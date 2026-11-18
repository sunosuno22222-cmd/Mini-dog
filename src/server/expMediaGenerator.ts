import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp, { type OverlayOptions } from 'sharp';
import {
  EXP_HASHTAGS,
  formatExpCode,
  getExpMediaDir,
  type ExpFormat,
} from './expStore.ts';

const execFileAsync = promisify(execFile);

export interface ExpContentInput {
  expId: string;
  expNumber: number;
  involvedName: string;
  description: string;
  whatHappened: string;
  whyWrong: string;
  additionalInsults?: string;
  title?: string;
  information?: string;
  additionalText?: string;
  insultText?: string;
  closingText?: string;
  watermarkText?: string;
  mediaLinks: string[];
  otherLinks: string[];
  personPhotoPath?: string | null;
  localProofPaths?: string[];
}

export interface ExpStudioInput {
  expNumber: number;
  title: string;
  information: string;
  imageBuffers: Buffer[];
  additionalText?: string;
  insultText?: string;
  closingText?: string;
  watermarkText?: string;
  theme?: 'demonic' | 'gallery';
}

export interface GeneratedCarouselResult {
  files: string[];
  filePaths: string[];
  slideCount: number;
  verifiedEvidenceImages: number;
}

export interface GeneratedVideoResult {
  files: string[];
  videoFile: string;
  videoPath: string;
  previewImagePath: string;
  durationSeconds: number;
  verifiedEvidenceImages: number;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Estimates proportional visual width units of a string so centered/wrapped SVG text
 * never overflows or looks unbalanced regardless of uppercase letters or punctuation.
 */
function measureCharUnits(ch: string): number {
  if (ch === ' ') return 0.42;
  if ('iljtfrI1!|.,:;\'"`'.includes(ch)) return 0.48;
  if ('MW@#%&QGO'.includes(ch)) return 1.24;
  if (ch >= 'A' && ch <= 'Z') return 1.08;
  if ('mw'.includes(ch)) return 1.18;
  return 0.9;
}

function measureTextUnits(str: string): number {
  let total = 0;
  for (const ch of str) {
    total += measureCharUnits(ch);
  }
  return total;
}

function wrapLinesProportional(
  text: string,
  maxWidthPx: number,
  fontSize: number,
  maxLines: number,
): { lines: string[]; overflowed: boolean } {
  const maxUnits = maxWidthPx / (fontSize * 0.68);
  const paragraphs = text.replace(/\r/g, '').split('\n');
  const lines: string[] = [];
  let overflowed = false;

  for (const para of paragraphs) {
    const normalized = para.replace(/\s+/g, ' ').trim();
    if (!normalized) continue;

    const words = normalized.split(' ');
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (measureTextUnits(candidate) <= maxUnits) {
        current = candidate;
      } else if (!current) {
        // Word alone exceeds width: split cleanly
        let chunk = '';
        for (const ch of word) {
          if (measureTextUnits(chunk + ch) > maxUnits && chunk.length > 0) {
            lines.push(chunk);
            chunk = ch;
            if (lines.length >= maxLines) {
              overflowed = true;
              break;
            }
          } else {
            chunk += ch;
          }
        }
        current = chunk;
        if (overflowed) break;
      } else {
        lines.push(current);
        current = word;
        if (lines.length >= maxLines) {
          overflowed = true;
          break;
        }
      }
    }

    if (overflowed) break;
    if (current) {
      if (lines.length >= maxLines) {
        overflowed = true;
        break;
      }
      lines.push(current);
    }
  }

  return { lines, overflowed };
}

interface AdaptiveTextLayout {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  cardTop: number;
  cardHeight: number;
  textStartY: number;
}

/**
 * Computes an adaptive font size, balanced frame height, and vertically centered
 * baseline so short texts look bold/spacious and long texts never clip or look crooked.
 */
function fitTextInAdaptiveFrame(
  text: string,
  options: {
    zoneTop: number;
    zoneHeight: number;
    cardWidth: number;
    paddingX: number;
    paddingY: number;
    minFont: number;
    maxFont: number;
    lineHeightRatio: number;
    minCardHeight: number;
    maxCardHeight: number;
    headerBandHeight?: number;
  },
): AdaptiveTextLayout {
  const clean = text.trim() || ' ';
  const headerBand = options.headerBandHeight ?? 0;
  const maxInnerWidth = options.cardWidth - options.paddingX * 2;
  const maxTextAreaHeight = options.maxCardHeight - options.paddingY * 2 - headerBand;

  let chosenFont = options.minFont;
  let chosenLines: string[] = [];
  let chosenLineHeight = Math.round(options.minFont * options.lineHeightRatio);

  for (let fs = options.maxFont; fs >= options.minFont; fs -= 2) {
    const lh = Math.round(fs * options.lineHeightRatio);
    const maxLinesPossible = Math.max(1, Math.floor(maxTextAreaHeight / lh));
    const wrapped = wrapLinesProportional(clean, maxInnerWidth, fs, maxLinesPossible);
    if (!wrapped.overflowed && wrapped.lines.length * lh <= maxTextAreaHeight) {
      chosenFont = fs;
      chosenLines = wrapped.lines;
      chosenLineHeight = lh;
      break;
    }
    chosenFont = fs;
    chosenLines = wrapped.lines;
    chosenLineHeight = lh;
  }

  if (chosenLines.length === 0) {
    chosenLines = [clean.slice(0, 60)];
  }

  const textBlockHeight =
    (chosenLines.length - 1) * chosenLineHeight + Math.round(chosenFont * 0.9);
  const desiredCardHeight =
    textBlockHeight + options.paddingY * 2 + headerBand;
  const cardHeight = Math.max(
    options.minCardHeight,
    Math.min(options.maxCardHeight, desiredCardHeight),
  );
  const cardTop =
    options.zoneTop + Math.round((options.zoneHeight - cardHeight) / 2);

  const innerTop = cardTop + headerBand + options.paddingY;
  const innerHeight = cardHeight - headerBand - options.paddingY * 2;
  const verticalOffset = Math.max(0, Math.round((innerHeight - textBlockHeight) / 2));
  const textStartY = innerTop + verticalOffset + Math.round(chosenFont * 0.78);

  return {
    lines: chosenLines,
    fontSize: chosenFont,
    lineHeight: chosenLineHeight,
    cardTop,
    cardHeight,
    textStartY,
  };
}

function wrapLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const paragraphs = text.replace(/\r/g, '').split('\n');
  const lines: string[] = [];

  for (const para of paragraphs) {
    const normalized = para.replace(/\s+/g, ' ').trim();
    if (!normalized) continue;

    const words = normalized.split(' ');
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxCharsPerLine) {
        current = candidate;
      } else {
        if (current) {
          lines.push(current);
          if (lines.length >= maxLines) break;
        }
        current =
          word.length > maxCharsPerLine ? `${word.slice(0, maxCharsPerLine - 1)}…` : word;
      }
    }

    if (lines.length >= maxLines) break;
    if (current) {
      lines.push(current);
      if (lines.length >= maxLines) break;
    }
  }

  return lines.slice(0, maxLines);
}

interface VerifiedEvidenceImage {
  sourceUrl: string;
  buffer: Buffer;
}

function isSafePublicHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function loadLocalVerifiedImages(localPaths: string[]): Promise<VerifiedEvidenceImage[]> {
  const results: VerifiedEvidenceImage[] = [];
  for (const p of localPaths.slice(0, 4)) {
    if (!p || !fs.existsSync(p)) continue;
    try {
      const buf = fs.readFileSync(p);
      if (buf.byteLength === 0) continue;
      const meta = await sharp(buf).metadata().catch(() => null);
      if (!meta || !meta.width || !meta.height) continue;
      results.push({ sourceUrl: path.basename(p), buffer: buf });
    } catch {
      // Ignore non-image local files
    }
  }
  return results;
}

async function fetchVerifiedEvidenceImages(
  urls: string[],
  localPaths: string[] = [],
): Promise<VerifiedEvidenceImage[]> {
  const results = await loadLocalVerifiedImages(localPaths);
  for (const url of urls.slice(0, 6)) {
    if (results.length >= 4) break;
    if (!isSafePublicHttpUrl(url)) continue;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const resp = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': '573ExpBot/1.0' },
      });
      clearTimeout(timer);
      if (!resp.ok) continue;

      const contentType = (resp.headers.get('content-type') || '').toLowerCase();
      if (!contentType.startsWith('image/')) continue;

      const arrBuf = await resp.arrayBuffer();
      if (arrBuf.byteLength === 0 || arrBuf.byteLength > 10 * 1024 * 1024) continue;
      const buf = Buffer.from(arrBuf);
      const meta = await sharp(buf).metadata().catch(() => null);
      if (!meta || !meta.width || !meta.height) continue;

      results.push({ sourceUrl: url, buffer: buf });
      if (results.length >= 4) break;
    } catch {
      // Ignore unreachable evidence URLs cleanly
    }
  }
  return results;
}

async function loadSingleImageBuffer(
  localPath?: string | null,
  fallbackUrls: string[] = [],
): Promise<Buffer | null> {
  if (localPath && fs.existsSync(localPath)) {
    try {
      const buf = fs.readFileSync(localPath);
      const meta = await sharp(buf).metadata().catch(() => null);
      if (meta?.width && meta?.height) return buf;
    } catch {
      // Fall through
    }
  }
  const fetched = await fetchVerifiedEvidenceImages(fallbackUrls, []);
  return fetched[0]?.buffer ?? null;
}

async function renderRoundedImageTile(
  buf: Buffer,
  width: number,
  height: number,
  radius: number,
  fit: 'cover' | 'contain' = 'cover',
): Promise<Buffer> {
  const resized = await sharp(buf)
    .resize(width, height, {
      fit,
      background: { r: 16, g: 18, b: 23, alpha: 1 },
    })
    .png()
    .toBuffer();

  const maskSvg = Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#ffffff"/>
    </svg>`,
  );

  return await sharp(resized)
    .composite([{ input: maskSvg, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

function renderLinesSvg(
  lines: string[],
  x: number,
  startY: number,
  lineHeight: number,
  fontSize: number,
  color: string,
  fontWeight = '400',
  anchor: 'start' | 'middle' = 'start',
): string {
  return lines
    .map(
      (line, idx) =>
        `<text x="${x}" y="${startY + idx * lineHeight}" text-anchor="${anchor}" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" fill="${color}">${escapeXml(line)}</text>`,
    )
    .join('\n');
}

function renderCornerBracketsSvg(
  x: number,
  y: number,
  w: number,
  h: number,
  len = 26,
  color = 'rgba(212,175,55,0.65)',
  strokeWidth = 3,
): string {
  const x2 = x + w;
  const y2 = y + h;
  return `
    <path d="M ${x} ${y + len} L ${x} ${y} L ${x + len} ${y}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="square"/>
    <path d="M ${x2 - len} ${y} L ${x2} ${y} L ${x2} ${y + len}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="square"/>
    <path d="M ${x} ${y2 - len} L ${x} ${y2} L ${x + len} ${y2}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="square"/>
    <path d="M ${x2 - len} ${y2} L ${x2} ${y2} L ${x2} ${y2 - len}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="square"/>
  `;
}

function buildFramedSlideSvg(params: {
  width: number;
  height: number;
  expCode: string;
  sectionLabel: string;
  pageTag: string;
  watermarkText?: string;
  accentColor?: string;
  theme?: 'demonic' | 'gallery';
  innerSvg: string;
}): Buffer {
  const { width, height, expCode, sectionLabel, pageTag, innerSvg } = params;
  const isDemonic = params.theme !== 'gallery';
  const accent = params.accentColor || (isDemonic ? '#EF4444' : '#D4AF37');
  const watermark = (params.watermarkText || (isDemonic ? '@5573satan' : '@5573exp')).trim();

  const bgGradient = isDemonic
    ? `
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#050102"/>
        <stop offset="50%" stop-color="#120305"/>
        <stop offset="100%" stop-color="#030001"/>
      </linearGradient>
      <radialGradient id="topGlow" cx="50%" cy="18%" r="65%">
        <stop offset="0%" stop-color="rgba(220, 38, 38, 0.28)"/>
        <stop offset="55%" stop-color="rgba(127, 29, 29, 0.10)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
      </radialGradient>
      <radialGradient id="bottomEmber" cx="50%" cy="88%" r="55%">
        <stop offset="0%" stop-color="rgba(185, 28, 28, 0.20)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
      </radialGradient>`
    : `
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#111216"/>
        <stop offset="55%" stop-color="#16181E"/>
        <stop offset="100%" stop-color="#0C0D11"/>
      </linearGradient>
      <radialGradient id="topGlow" cx="50%" cy="22%" r="65%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.055)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
      </radialGradient>`;

  const outerFrameStroke = isDemonic ? '#7F1D1D' : 'rgba(255,255,255,0.14)';
  const innerFrameStroke = isDemonic ? 'rgba(220, 38, 38, 0.50)' : 'rgba(255,255,255,0.06)';
  const headerCodeFill = isDemonic ? '#EF4444' : '#E4E4E7';
  const headerMidFill = isDemonic ? '#F87171' : accent;
  const headerRightFill = isDemonic ? '#DC2626' : '#A1A1AA';
  const lineDividerFill = isDemonic ? '#7F1D1D' : 'rgba(255,255,255,0.10)';
  const footerLeftFill = isDemonic ? '#EF4444' : '#A1A1AA';
  const footerWatermarkFill = isDemonic ? '#FCA5A5' : 'rgba(228,228,231,0.72)';

  const headerLeftText = isDemonic ? `⛧ ${expCode.toUpperCase()} ⛧` : expCode.toUpperCase();
  const headerCenterText = isDemonic ? `⛧ ${sectionLabel.toUpperCase()} ⛧` : sectionLabel.toUpperCase();
  const headerRightText = isDemonic ? `[ ${pageTag} ]` : pageTag;
  const footerLeftText = isDemonic
    ? `⛧ ${expCode} · 5573 SATAN · CONDENAÇÃO TIKTOK ⛧`
    : `${expCode} · ${EXP_HASHTAGS}`;

  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        ${bgGradient}
      </defs>

      <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>
      <rect width="${width}" height="${height}" fill="url(#topGlow)"/>
      ${isDemonic ? `<rect width="${width}" height="${height}" fill="url(#bottomEmber)"/>` : ''}

      <!-- Outer & Inner Demonic Architectural Frame -->
      <rect x="44" y="44" width="${width - 88}" height="${height - 88}" rx="24" fill="none" stroke="${outerFrameStroke}" stroke-width="${isDemonic ? 3 : 2}"/>
      <rect x="58" y="58" width="${width - 116}" height="${height - 116}" rx="18" fill="none" stroke="${innerFrameStroke}" stroke-width="1.5" ${isDemonic ? 'stroke-dasharray="14 6"' : ''}/>
      ${renderCornerBracketsSvg(44, 44, width - 88, height - 88, 30, accent, 3.5)}

      <!-- Symmetric Header -->
      <text x="92" y="114" font-family="monospace, sans-serif" font-size="22" font-weight="700" letter-spacing="3" fill="${headerCodeFill}">${escapeXml(headerLeftText)}</text>
      <text x="${width / 2}" y="114" text-anchor="middle" font-family="monospace, sans-serif" font-size="20" font-weight="800" letter-spacing="3" fill="${headerMidFill}">${escapeXml(headerCenterText)}</text>
      <text x="${width - 92}" y="114" text-anchor="end" font-family="monospace, sans-serif" font-size="22" font-weight="700" fill="${headerRightFill}">${escapeXml(headerRightText)}</text>
      <rect x="92" y="142" width="${width - 184}" height="2" fill="${lineDividerFill}"/>

      <!-- Main Symmetric Content Area -->
      ${innerSvg}

      <!-- Symmetric Footer + Watermark -->
      <rect x="92" y="${height - 134}" width="${width - 184}" height="2" fill="${lineDividerFill}"/>
      <text x="92" y="${height - 88}" font-family="monospace, sans-serif" font-size="20" font-weight="600" fill="${footerLeftFill}">${escapeXml(footerLeftText)}</text>
      ${
        watermark
          ? `<text x="${width - 92}" y="${height - 88}" text-anchor="end" font-family="monospace, sans-serif" font-size="20" font-weight="700" letter-spacing="1" fill="${footerWatermarkFill}">${escapeXml(isDemonic ? `⛧ ${watermark} ⛧` : watermark)}</text>`
          : ''
      }
    </svg>`,
  );
}

function buildCarouselBaseSvg(width: number, height: number, innerSvg: string): Buffer {
  return Buffer.from(
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#080102"/>
          <stop offset="55%" stop-color="#140305"/>
          <stop offset="100%" stop-color="#040001"/>
        </linearGradient>
        <radialGradient id="topGlow" cx="50%" cy="15%" r="65%">
          <stop offset="0%" stop-color="rgba(220,38,38,0.22)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>
      <rect width="${width}" height="${height}" fill="url(#topGlow)"/>
      ${innerSvg}
    </svg>`,
  );
}

/**
 * Renders the clean callout poster (1080x1350 JPEG) with:
 * - Top headline: 5573 EXPLANANDO PUTAS!
 * - Subheadline: A PUTA DE HOJE É: <NOME>
 * - Larger centered photo frame
 * - Bottom explanation block strictly contained within the poster frame
 */
export async function generateStudioCarouselSlides(
  input: ExpStudioInput,
): Promise<{ slideBuffers: Buffer[]; slideLabels: string[] }> {
  const W = 1080;
  const H = 1350;
  const watermarkText = (input.watermarkText || '@5573exp').trim();
  const rawName = (input.title || '').trim().replace(/^A PUTA DE HOJE É:\s*/i, '').trim() || 'ALVO';
  const targetNameDisplay = rawName.toUpperCase();
  const explanationText = (input.information || '').trim() || 'Sem descrição informada.';
  const personBuffer = input.imageBuffers[0] || null;

  const sheetX = 64;
  const sheetY = 56;
  const sheetW = W - sheetX * 2; // 952
  const sheetH = H - sheetY * 2; // 1238

  // Top crimson banner for "5573 EXPLANANDO PUTAS!"
  const bannerX = sheetX + 44;
  const bannerY = sheetY + 34;
  const bannerW = sheetW - 88; // 864
  const bannerH = 86;

  // Subtitle "A PUTA DE HOJE É: <NOME>" dynamically sized so it never clips horizontally
  const subtitleFull = `A PUTA DE HOJE É: ${targetNameDisplay}`;
  const subUnits = measureTextUnits(subtitleFull);
  let subFontSize = 36;
  while (subFontSize > 20 && subUnits * (subFontSize * 0.68) > bannerW - 24) {
    subFontSize -= 2;
  }
  const subY = bannerY + bannerH + 54;

  // Larger centered portrait frame for her photo (540x540 vs old 204x214)
  const photoW = 540;
  const photoH = 540;
  const photoX = Math.round((W - photoW) / 2);
  const photoY = subY + 36;

  // Bottom explanation zone strictly contained above footer line, balanced vertically
  const footerLineY = sheetY + sheetH - 60;
  const infoBoxX = sheetX + 48;
  const infoBoxW = sheetW - 96; // 856
  const infoLabelY = photoY + photoH + 40;
  const infoZoneTop = infoLabelY + 14;
  const infoZoneMaxH = Math.max(150, footerLineY - 22 - infoZoneTop);

  const layout = fitTextInAdaptiveFrame(explanationText, {
    zoneTop: infoZoneTop,
    zoneHeight: infoZoneMaxH,
    cardWidth: infoBoxW,
    paddingX: 30,
    paddingY: 22,
    minFont: 15,
    maxFont: 21,
    lineHeightRatio: 1.44,
    minCardHeight: infoZoneMaxH,
    maxCardHeight: infoZoneMaxH,
    headerBandHeight: 0,
  });

  // Strict clamp to ensure lines never overflow bottom of box
  const maxLinesAllowed = Math.max(
    1,
    Math.floor((infoZoneMaxH - 44) / Math.max(20, layout.lineHeight)),
  );
  const clampedLines = layout.lines.slice(0, maxLinesAllowed);
  if (layout.lines.length > maxLinesAllowed && clampedLines.length > 0) {
    const lastIdx = clampedLines.length - 1;
    clampedLines[lastIdx] = `${clampedLines[lastIdx].replace(/[.,;:\s]+$/, '').slice(0, -1)}…`;
  }
  const actualTextHeight =
    (clampedLines.length - 1) * layout.lineHeight + Math.round(layout.fontSize * 0.9);
  const boxHeight = infoZoneMaxH;
  const boxTop = infoZoneTop;
  const textStartY =
    boxTop +
    Math.max(22, Math.round((boxHeight - actualTextHeight) / 2)) +
    Math.round(layout.fontSize * 0.78);

  const svg = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="wallBg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#141518"/>
          <stop offset="100%" stop-color="#0B0C0E"/>
        </linearGradient>
        <filter id="posterShadow" x="-8%" y="-6%" width="116%" height="114%">
          <feDropShadow dx="0" dy="14" stdDeviation="20" flood-color="#000000" flood-opacity="0.55"/>
        </filter>
      </defs>

      <rect width="${W}" height="${H}" fill="url(#wallBg)"/>

      <!-- Poster Heavyweight Paper Sheet -->
      <rect x="${sheetX}" y="${sheetY}" width="${sheetW}" height="${sheetH}" rx="8" fill="#F5F1E8" stroke="#D6CFC2" stroke-width="2" filter="url(#posterShadow)"/>
      <rect x="${sheetX + 18}" y="${sheetY + 18}" width="${sheetW - 36}" height="${sheetH - 36}" rx="4" fill="none" stroke="#18181B" stroke-width="2.5"/>

      <!-- Top Callout Masthead -->
      <rect x="${bannerX}" y="${bannerY}" width="${bannerW}" height="${bannerH}" rx="6" fill="#B91C1C"/>
      <text x="${W / 2}" y="${bannerY + 58}" text-anchor="middle" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="46" font-weight="900" letter-spacing="1.5" fill="#FFFFFF">5573 EXPLANANDO PUTAS!</text>

      <!-- Subheader with Target Name -->
      <text x="${W / 2}" y="${subY}" text-anchor="middle" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="${subFontSize}" font-weight="800" fill="#18181B">
        <tspan fill="#991B1B">A PUTA DE HOJE É:</tspan><tspan dx="${Math.round(subFontSize * 0.28)}" fill="#111216">${escapeXml(targetNameDisplay)}</tspan>
      </text>
      <line x1="${bannerX}" y1="${subY + 14}" x2="${bannerX + bannerW}" y2="${subY + 14}" stroke="#18181B" stroke-width="2"/>

      <!-- Larger Centered Portrait Frame -->
      <rect x="${photoX - 8}" y="${photoY - 8}" width="${photoW + 16}" height="${photoH + 16}" rx="10" fill="#FFFFFF" stroke="#18181B" stroke-width="3"/>
      <rect x="${photoX}" y="${photoY}" width="${photoW}" height="${photoH}" rx="6" fill="#E7E2D8"/>
      ${
        !personBuffer
          ? `<text x="${W / 2}" y="${photoY + photoH / 2 + 8}" text-anchor="middle" font-family="Noto Sans, DejaVu Sans, sans-serif" font-size="24" font-weight="700" fill="#71717A">IMAGEM DO ALVO</text>`
          : ''
      }

      <!-- Bottom Explanation Section (Small, Clean, Zero Overflow) -->
      <text x="${infoBoxX}" y="${infoLabelY}" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="16" font-weight="800" letter-spacing="1.2" fill="#991B1B">O QUE ELA FEZ / FAZ:</text>
      <rect x="${infoBoxX}" y="${boxTop}" width="${infoBoxW}" height="${boxHeight}" rx="8" fill="#FFFFFF" stroke="#D6CFC2" stroke-width="1.5"/>
      ${renderLinesSvg(clampedLines, infoBoxX + 30, textStartY, layout.lineHeight, layout.fontSize, '#18181B', '500', 'start')}

      <!-- Clean Footer -->
      <line x1="${infoBoxX}" y1="${footerLineY}" x2="${infoBoxX + infoBoxW}" y2="${footerLineY}" stroke="#D6CFC2" stroke-width="1.5"/>
      <text x="${infoBoxX}" y="${footerLineY + 34}" font-family="Noto Sans, DejaVu Sans, sans-serif" font-size="17" font-weight="700" fill="#52525B">573 · CARTAZ OFICIAL</text>
      <text x="${infoBoxX + infoBoxW}" y="${footerLineY + 34}" text-anchor="end" font-family="Noto Sans, DejaVu Sans, sans-serif" font-size="17" font-weight="700" fill="#991B1B">${escapeXml(watermarkText)}</text>
    </svg>`,
  );

  const composites: OverlayOptions[] = [];
  if (personBuffer) {
    const personTile = await renderRoundedImageTile(personBuffer, photoW, photoH, 6, 'cover');
    composites.push({ input: personTile, top: photoY, left: photoX });
  }

  let pipeline = sharp(svg);
  if (composites.length > 0) {
    pipeline = pipeline.composite(composites);
  }
  const singleSlideBuf = await pipeline.jpeg({ quality: 93 }).toBuffer();

  return {
    slideBuffers: [singleSlideBuf],
    slideLabels: [`Cartaz · ${targetNameDisplay}`],
  };
}

/**
 * Generates a pre-submission preview image (JPEG) showing how the published image/post will look,
 * embedding the optional person photo and proof thumbnail when supplied.
 */
export async function generateExpDraftPreview(params: {
  nextExpNumber: number;
  involvedName: string;
  description: string;
  whatHappened: string;
  whyWrong: string;
  additionalInsults?: string;
  mediaLinks?: string[];
  mediaLinksCount: number;
  otherLinksCount: number;
  personPhotoPath?: string | null;
  localProofPaths?: string[];
  format: ExpFormat;
}): Promise<Buffer> {
  const W = 1080;
  const H = 1350;
  const expCode = formatExpCode(params.nextExpNumber);
  const formatLabel =
    params.format === 'carousel'
      ? 'Exemplo da Publicação · Carrossel'
      : 'Exemplo da Publicação · Vídeo Vertical';

  const personBuffer = await loadSingleImageBuffer(params.personPhotoPath, []);
  const proofImages = await fetchVerifiedEvidenceImages(
    params.mediaLinks ?? [],
    params.localProofPaths ?? [],
  );
  const proofThumbBuffer = proofImages[0]?.buffer ?? null;

  const hasPersonPhoto = Boolean(personBuffer);
  const hasProofThumb = Boolean(proofThumbBuffer);

  const headerTextWrap = hasPersonPhoto ? 24 : 34;
  const descLines = wrapLines(params.description, headerTextWrap, 3);
  const whatLines = wrapLines(params.whatHappened, 40, hasProofThumb ? 3 : 5);
  const insultsText = (params.additionalInsults || '').trim() || params.whyWrong.trim();
  const insultsLines = wrapLines(insultsText, hasProofThumb ? 24 : 40, 4);

  const involvedLine = params.involvedName.trim()
    ? `Pessoa: ${params.involvedName.trim().slice(0, 38)}`
    : 'Ocorrência EXP';

  const totalAttachments =
    params.mediaLinksCount +
    params.otherLinksCount +
    (params.localProofPaths?.length ?? 0) +
    (params.personPhotoPath ? 1 : 0);

  const svg = buildCarouselBaseSvg(
    W,
    H,
    `
      <rect x="72" y="68" width="430" height="44" rx="10" fill="#27272A"/>
      <text x="92" y="97" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="20" font-weight="700" fill="#E4E4E7">${escapeXml(formatLabel)}</text>

      <text x="72" y="198" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="84" font-weight="700" fill="#FFFFFF">${escapeXml(expCode)}</text>
      <text x="72" y="246" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="24" font-weight="500" fill="#A1A1AA">${escapeXml(EXP_HASHTAGS)}</text>
      <text x="72" y="294" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="26" font-weight="600" fill="#E4E4E7">${escapeXml(involvedLine)}</text>

      ${
        hasPersonPhoto
          ? `<rect x="${W - 312}" y="112" width="240" height="240" rx="22" fill="#27272A" stroke="rgba(255,255,255,0.22)" stroke-width="3"/>`
          : ''
      }

      <rect x="72" y="340" width="${hasPersonPhoto ? W - 404 : W - 144}" height="215" rx="18" fill="rgba(255,255,255,0.04)"/>
      <text x="100" y="384" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="20" font-weight="700" fill="#A1A1AA">INFORMAÇÕES</text>
      ${renderLinesSvg(descLines, 100, 432, 40, 29, '#FAFAFA', '600')}

      <rect x="72" y="576" width="${W - 144}" height="${hasProofThumb ? 250 : 300}" rx="18" fill="rgba(255,255,255,0.03)"/>
      <text x="100" y="620" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="20" font-weight="700" fill="#A1A1AA">MAIS INFORMAÇÕES</text>
      ${renderLinesSvg(whatLines, 100, 668, 40, 27, '#E4E4E7', '400')}

      ${
        hasProofThumb
          ? `
            <rect x="72" y="848" width="540" height="300" rx="18" fill="rgba(255,255,255,0.03)"/>
            <text x="100" y="894" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="20" font-weight="700" fill="#A1A1AA">${escapeXml((params.additionalInsults || '').trim() ? 'INSULTOS ADICIONAIS' : 'DETALHES')}</text>
            ${renderLinesSvg(insultsLines, 100, 944, 40, 26, '#E4E4E7', '400')}

            <rect x="636" y="848" width="372" height="300" rx="18" fill="#121317" stroke="rgba(255,255,255,0.14)" stroke-width="2"/>
            <text x="656" y="886" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="18" font-weight="700" fill="#A1A1AA">PROVA ANEXADA</text>
          `
          : `
            <rect x="72" y="898" width="${W - 144}" height="250" rx="18" fill="rgba(255,255,255,0.03)"/>
            <text x="100" y="944" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="20" font-weight="700" fill="#A1A1AA">${escapeXml((params.additionalInsults || '').trim() ? 'INSULTOS ADICIONAIS' : 'DETALHES ADICIONAIS')}</text>
            ${renderLinesSvg(insultsLines, 100, 994, 42, 27, '#E4E4E7', '400')}
          `
      }

      <text x="72" y="1212" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="22" font-weight="500" fill="#A1A1AA">${escapeXml(`Anexos e provas: ${totalAttachments} item(ns) · Prévia visível apenas para você`)}</text>
      <rect x="72" y="${H - 104}" width="${W - 144}" height="1" fill="rgba(255,255,255,0.08)"/>
      <text x="72" y="${H - 60}" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="21" font-weight="600" fill="#A1A1AA">${escapeXml(`${expCode} · ${EXP_HASHTAGS}`)}</text>
    `,
  );

  const composites: OverlayOptions[] = [];
  if (personBuffer) {
    const personTile = await renderRoundedImageTile(personBuffer, 234, 234, 20, 'cover');
    composites.push({ input: personTile, top: 115, left: W - 309 });
  }
  if (proofThumbBuffer) {
    const proofTile = await renderRoundedImageTile(proofThumbBuffer, 344, 236, 12, 'contain');
    composites.push({ input: proofTile, top: 900, left: 650 });
  }

  let pipeline = sharp(svg);
  if (composites.length > 0) {
    pipeline = pipeline.composite(composites);
  }
  return await pipeline.jpeg({ quality: 90 }).toBuffer();
}

/**
 * Generates individual 1080x1350 framed JPEG carousel slides using the unified 8-slot studio engine
 * (both for web-created EXP carousels and Discord-submitted EXP records).
 */
export async function generateExpCarousel(input: ExpContentInput): Promise<GeneratedCarouselResult> {
  const mediaDir = getExpMediaDir(input.expId);
  const personBuffer = await loadSingleImageBuffer(input.personPhotoPath, []);
  const verifiedImages = await fetchVerifiedEvidenceImages(
    input.mediaLinks,
    input.localProofPaths ?? [],
  );

  const collectedImages: Buffer[] = [];
  if (personBuffer) collectedImages.push(personBuffer);
  for (const ev of verifiedImages) {
    if (collectedImages.length >= 3) break;
    collectedImages.push(ev.buffer);
  }

  const { slideBuffers } = await generateStudioCarouselSlides({
    expNumber: input.expNumber,
    title: input.involvedName?.trim() || input.title?.trim() || input.description,
    information: input.information?.trim() || input.whatHappened || input.description,
    imageBuffers: collectedImages,
    additionalText: input.additionalText?.trim() || input.whyWrong?.trim() || '',
    insultText: input.insultText?.trim() || input.additionalInsults?.trim() || '',
    closingText: input.closingText?.trim() || '',
    watermarkText: input.watermarkText?.trim() || '@5573exp',
  });

  const files: string[] = [];
  const filePaths: string[] = [];
  for (let i = 0; i < slideBuffers.length; i++) {
    const filename = `slide-${i + 1}.jpg`;
    const fullPath = path.resolve(mediaDir, filename);
    fs.writeFileSync(fullPath, slideBuffers[i]);
    files.push(filename);
    filePaths.push(fullPath);
  }

  return {
    files,
    filePaths,
    slideCount: files.length,
    verifiedEvidenceImages: collectedImages.length,
  };
}

function buildSubtitleBarSvg(width: number, height: number, subtitleText: string): string {
  const lines = wrapLines(subtitleText, 34, 2);
  if (lines.length === 0) return '';
  const boxHeight = lines.length === 1 ? 84 : 130;
  const boxTop = height - 290;
  const textStartY = boxTop + 52;
  return `
    <rect x="68" y="${boxTop}" width="${width - 136}" height="${boxHeight}" rx="18" fill="rgba(10,11,15,0.88)"/>
    <rect x="68" y="${boxTop}" width="${width - 136}" height="${boxHeight}" rx="18" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="2"/>
    ${renderLinesSvg(lines, width / 2, textStartY, 44, 34, '#FFFFFF', '700', 'middle')}
  `;
}

/**
 * Generates a vertical 1080x1920 H.264 MP4 video with crisp scene frames, burned-in captions/subtitles,
 * real verified evidence visuals (if provided), and smooth xfade transitions using sharp + ffmpeg.
 */
export async function generateExpVideo(
  input: ExpContentInput,
  audioLocalPath?: string | null,
): Promise<GeneratedVideoResult> {
  const W = 1080;
  const H = 1920;
  const expCode = formatExpCode(input.expNumber);
  const mediaDir = getExpMediaDir(input.expId);
  const personBuffer = await loadSingleImageBuffer(input.personPhotoPath, []);
  const verifiedImages = await fetchVerifiedEvidenceImages(
    input.mediaLinks,
    input.localProofPaths ?? [],
  );

  interface SceneFrame {
    pngBuffer: Buffer;
    durationSec: number;
  }

  const scenes: SceneFrame[] = [];

  // Scene 1: Cover (with optional person photo)
  {
    const coverTitle = wrapLines(input.title?.trim() || input.description, 22, 4);
    const involvedLabel = input.involvedName.trim()
      ? `Pessoa envolvida: ${input.involvedName.trim().slice(0, 42)}`
      : 'Caso registrado no sistema EXP';

    const svg = buildCarouselBaseSvg(
      W,
      H,
      `
        <rect x="84" y="210" width="320" height="88" rx="14" fill="#FAFAFA"/>
        <text x="244" y="272" text-anchor="middle" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="54" font-weight="700" fill="#18191D">${escapeXml(expCode.toUpperCase())}</text>
        ${
          personBuffer
            ? `<rect x="${W - 394}" y="170" width="310" height="310" rx="28" fill="#27272A" stroke="rgba(255,255,255,0.24)" stroke-width="3"/>`
            : ''
        }
        <text x="84" y="366" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="32" font-weight="600" fill="#A1A1AA">${escapeXml(EXP_HASHTAGS)}</text>
        <text x="84" y="456" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="34" font-weight="600" fill="#E4E4E7">${escapeXml(involvedLabel)}</text>

        <rect x="84" y="530" width="${W - 168}" height="740" rx="24" fill="rgba(255,255,255,0.04)"/>
        ${renderLinesSvg(coverTitle, 124, 690, 78, 56, '#FFFFFF', '700')}

        ${buildSubtitleBarSvg(W, H, `${expCode}: ${input.title?.trim() || input.description}`)}
      `,
    );
    let scene1Pipe = sharp(svg);
    if (personBuffer) {
      const tile = await renderRoundedImageTile(personBuffer, 304, 304, 24, 'cover');
      scene1Pipe = scene1Pipe.composite([{ input: tile, top: 173, left: W - 391 }]);
    }
    scenes.push({ pngBuffer: await scene1Pipe.png().toBuffer(), durationSec: 3.5 });
  }

  // Scene 2: Informações
  {
    const whatLines = wrapLines(input.information?.trim() || input.whatHappened, 30, 11);
    const svg = buildCarouselBaseSvg(
      W,
      H,
      `
        <text x="84" y="210" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="28" font-weight="700" letter-spacing="3" fill="#A1A1AA">${escapeXml(`${expCode.toUpperCase()} · PARTE 01`)}</text>
        <text x="84" y="290" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="54" font-weight="700" fill="#FAFAFA">Informações</text>
        <rect x="84" y="328" width="84" height="5" rx="2.5" fill="#E4E4E7"/>

        <rect x="84" y="390" width="${W - 168}" height="1080" rx="24" fill="rgba(255,255,255,0.035)"/>
        ${renderLinesSvg(whatLines, 128, 490, 62, 40, '#FAFAFA', '500')}

        ${buildSubtitleBarSvg(W, H, (input.information?.trim() || input.whatHappened).slice(0, 120))}
      `,
    );
    scenes.push({ pngBuffer: await sharp(svg).png().toBuffer(), durationSec: 4.5 });
  }

  // Scene 3: Insulto / Texto adicional
  {
    const thirdText =
      (input.insultText || input.additionalInsults || input.additionalText || '').trim() ||
      input.whyWrong;
    const thirdHeading =
      input.insultText?.trim() || input.additionalInsults?.trim()
        ? 'Insulto'
        : 'Texto adicional';
    const whyLines = wrapLines(thirdText, 30, 11);
    const svg = buildCarouselBaseSvg(
      W,
      H,
      `
        <text x="84" y="210" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="28" font-weight="700" letter-spacing="3" fill="#A1A1AA">${escapeXml(`${expCode.toUpperCase()} · PARTE 02`)}</text>
        <text x="84" y="290" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="54" font-weight="700" fill="#FAFAFA">${escapeXml(thirdHeading)}</text>
        <rect x="84" y="328" width="84" height="5" rx="2.5" fill="#E4E4E7"/>

        <rect x="84" y="390" width="${W - 168}" height="1080" rx="24" fill="rgba(255,255,255,0.035)"/>
        ${renderLinesSvg(whyLines, 128, 490, 62, 40, '#FAFAFA', '500')}

        ${buildSubtitleBarSvg(W, H, thirdText.slice(0, 120))}
      `,
    );
    scenes.push({ pngBuffer: await sharp(svg).png().toBuffer(), durationSec: 4.5 });
  }

  // Scene 4..K: Real Verified Evidence Scenes
  if (verifiedImages.length > 0) {
    for (let idx = 0; idx < verifiedImages.length; idx++) {
      const ev = verifiedImages[idx];
      const boxW = W - 168;
      const boxH = 1040;
      const fitted = await sharp(ev.buffer)
        .resize(boxW, boxH, { fit: 'contain', background: { r: 18, g: 19, b: 23, alpha: 1 } })
        .png()
        .toBuffer();

      const bgSvg = buildCarouselBaseSvg(
        W,
        H,
        `
          <text x="84" y="210" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="28" font-weight="700" letter-spacing="3" fill="#A1A1AA">${escapeXml(`${expCode.toUpperCase()} · EVIDÊNCIA ${idx + 1}`)}</text>
          <text x="84" y="290" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="50" font-weight="700" fill="#FAFAFA">Prova anexada</text>
          <rect x="84" y="360" width="${boxW}" height="${boxH}" rx="20" fill="#121317"/>
          ${buildSubtitleBarSvg(W, H, `Evidência ${idx + 1} de ${verifiedImages.length} anexada ao caso.`)}
        `,
      );
      const composed = await sharp(bgSvg)
        .composite([{ input: fitted, top: 360, left: 84 }])
        .png()
        .toBuffer();
      scenes.push({ pngBuffer: composed, durationSec: 3.8 });
    }
  }

  // Final Scene: Outro
  {
    const wm = (input.watermarkText || '@5573exp').trim();
    const svg = buildCarouselBaseSvg(
      W,
      H,
      `
        <text x="${W / 2}" y="680" text-anchor="middle" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="28" font-weight="700" letter-spacing="4" fill="#A1A1AA">EXPOSIÇÃO REGISTRADA</text>
        <text x="${W / 2}" y="820" text-anchor="middle" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="112" font-weight="700" fill="#FFFFFF">${escapeXml(expCode)}</text>
        <text x="${W / 2}" y="910" text-anchor="middle" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="36" font-weight="600" fill="#D4D4D8">${escapeXml(EXP_HASHTAGS)}</text>
        <text x="${W / 2}" y="990" text-anchor="middle" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="32" font-weight="700" fill="#D4AF37">${escapeXml(wm)}</text>
        ${buildSubtitleBarSvg(W, H, `${expCode} · ${input.closingText?.trim() || 'Finalizado.'}`)}
      `,
    );
    scenes.push({ pngBuffer: await sharp(svg).png().toBuffer(), durationSec: 3.0 });
  }

  const previewPath = path.resolve(mediaDir, 'video-preview.jpg');
  await sharp(scenes[0].pngBuffer).jpeg({ quality: 90 }).toFile(previewPath);

  const scenePaths: string[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const p = path.resolve(mediaDir, `scene-${i}.png`);
    fs.writeFileSync(p, scenes[i].pngBuffer);
    scenePaths.push(p);
  }

  const videoFile = 'exp-video.mp4';
  const videoPath = path.resolve(mediaDir, videoFile);

  const transitionDuration = 0.4;
  const inputArgs: string[] = [];
  for (let i = 0; i < scenes.length; i++) {
    inputArgs.push('-loop', '1', '-t', scenes[i].durationSec.toFixed(2), '-i', scenePaths[i]);
  }
  const hasRealAudio = Boolean(audioLocalPath && fs.existsSync(audioLocalPath));
  if (hasRealAudio && audioLocalPath) {
    inputArgs.push('-stream_loop', '-1', '-i', audioLocalPath);
  } else {
    inputArgs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
  }

  const filterParts: string[] = [];
  for (let i = 0; i < scenes.length; i++) {
    filterParts.push(`[${i}:v]fps=30,format=yuv420p,setsar=1[v${i}]`);
  }

  let prevLabel = 'v0';
  let cumulativeDuration = scenes[0].durationSec;
  for (let i = 1; i < scenes.length; i++) {
    const offset = Math.max(0.1, cumulativeDuration - transitionDuration);
    const outLabel = i === scenes.length - 1 ? 'vout' : `x${i}`;
    filterParts.push(
      `[${prevLabel}][v${i}]xfade=transition=slideleft:duration=${transitionDuration}:offset=${offset.toFixed(2)}[${outLabel}]`,
    );
    prevLabel = outLabel;
    cumulativeDuration = cumulativeDuration + scenes[i].durationSec - transitionDuration;
  }

  const finalVideoLabel = scenes.length === 1 ? 'v0' : 'vout';
  const audioInputIdx = scenes.length;
  const fadeOutStart = Math.max(0.5, cumulativeDuration - 1.2).toFixed(2);
  if (hasRealAudio) {
    filterParts.push(
      `[${audioInputIdx}:a]afade=t=in:st=0:d=0.6,afade=t=out:st=${fadeOutStart}:d=1.2[aout]`,
    );
  }

  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      ...inputArgs,
      '-filter_complex',
      filterParts.join(';'),
      '-map',
      `[${finalVideoLabel}]`,
      '-map',
      hasRealAudio ? '[aout]' : `${audioInputIdx}:a`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      hasRealAudio ? '128k' : '96k',
      '-shortest',
      '-movflags',
      '+faststart',
      videoPath,
    ],
    { timeout: 60_000 },
  );

  for (const p of scenePaths) {
    fs.unlink(p, () => {});
  }

  return {
    files: [videoFile, 'video-preview.jpg'],
    videoFile,
    videoPath,
    previewImagePath: previewPath,
    durationSeconds: Math.round(cumulativeDuration * 10) / 10,
    verifiedEvidenceImages: verifiedImages.length,
  };
}

/**
 * Compiles generated framed carousel JPEG slides into a smooth 1080x1350 MP4 slideshow
 * mixed with the chosen/rotated Russian audio track (128kbps AAC) so TikTok receives
 * crisp framed slides synced with different Russian music tracks per post.
 */
export async function generateCarouselSlideshowVideo(
  expId: string,
  slideFiles: string[],
  audioLocalPath?: string | null,
): Promise<string> {
  const mediaDir = getExpMediaDir(expId);
  const existingPaths = slideFiles
    .filter((f) => f.toLowerCase().endsWith('.jpg') && f !== 'video-preview.jpg')
    .map((f) => path.resolve(mediaDir, path.basename(f)))
    .filter((p) => fs.existsSync(p));

  if (existingPaths.length === 0) {
    throw new Error('Nenhum slide JPEG encontrado para compilar o carrossel.');
  }

  const outPath = path.resolve(mediaDir, 'exp-carousel.mp4');
  const hasRealAudio = Boolean(audioLocalPath && fs.existsSync(audioLocalPath));

  const slideDur = 2.8;
  const totalDuration = Math.max(3, existingPaths.length * slideDur);
  const inputArgs: string[] = [];
  for (const slidePath of existingPaths) {
    inputArgs.push('-loop', '1', '-framerate', '24', '-t', slideDur.toFixed(2), '-i', slidePath);
  }
  if (hasRealAudio && audioLocalPath) {
    inputArgs.push('-stream_loop', '-1', '-i', audioLocalPath);
  } else {
    inputArgs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
  }

  const filterParts: string[] = [];
  const concatInputs: string[] = [];
  for (let i = 0; i < existingPaths.length; i++) {
    filterParts.push(
      `[${i}:v]scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=#0F1014,format=yuv420p,setsar=1[v${i}]`,
    );
    concatInputs.push(`[v${i}]`);
  }

  filterParts.push(`${concatInputs.join('')}concat=n=${existingPaths.length}:v=1:a=0[vout]`);

  const audioIdx = existingPaths.length;
  const fadeOutStart = Math.max(0.5, totalDuration - 1.2).toFixed(2);

  if (hasRealAudio) {
    filterParts.push(
      `[${audioIdx}:a]atrim=0:${totalDuration.toFixed(2)},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.5,afade=t=out:st=${fadeOutStart}:d=1.2[aout]`,
    );
  }

  await execFileAsync(
    'ffmpeg',
    [
      '-y',
      ...inputArgs,
      '-filter_complex',
      filterParts.join(';'),
      '-map',
      '[vout]',
      '-map',
      hasRealAudio ? '[aout]' : `${audioIdx}:a`,
      '-r',
      '24',
      '-t',
      totalDuration.toFixed(2),
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-tune',
      'stillimage',
      '-crf',
      '22',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      hasRealAudio ? '128k' : '96k',
      '-movflags',
      '+faststart',
      outPath,
    ],
    { timeout: 60_000 },
  );

  return outPath;
}

export const TIKTOK_TEST_POST_TEXT =
  'Olá, eu sou 5573exp, sou uma conta vinculada a um bot do Discord, onde meu principal objetivo é explanar os dados informados no canal do servidor. Cada postagem é simultaneamente enviada por um bot, mas configurada manualmente por alguém do servidor. Todos os dados informados serão divulgados em vídeos aqui deste perfil.';

export const TIKTOK_TEST_POST_CAPTION = `Exp ${EXP_HASHTAGS}`;

export interface GeneratedTestMediaResult {
  imagePath: string;
  videoPath: string;
  trackArtist: string | null;
  trackTitle: string | null;
}

export async function generateTikTokTestMedia(
  audioTrack?: { artist: string; title: string; localPath: string } | null,
): Promise<GeneratedTestMediaResult> {
  const testDir = path.resolve(process.cwd(), 'server', 'data', 'tiktok-test');
  fs.mkdirSync(testDir, { recursive: true });

  const W = 1080;
  const H = 1350;
  const lines = wrapLines(TIKTOK_TEST_POST_TEXT, 34, 18);
  const fontSize = 38;
  const lineHeight = 58;
  const blockHeight = (lines.length - 1) * lineHeight;
  const startY = Math.round((H - blockHeight) / 2);

  const svg = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${W}" height="${H}" fill="#141519"/>
      ${renderLinesSvg(lines, 104, startY, lineHeight, fontSize, '#F4F4F5', '500', 'start')}
    </svg>`,
  );

  const imagePath = path.resolve(testDir, 'test-post.png');
  await sharp(svg).png().toFile(imagePath);

  const videoPath = path.resolve(testDir, 'test-post.mp4');
  const durationSec = 15;

  if (audioTrack?.localPath && fs.existsSync(audioTrack.localPath)) {
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-loop',
        '1',
        '-t',
        String(durationSec),
        '-i',
        imagePath,
        '-i',
        audioTrack.localPath,
        '-vf',
        'fps=30,format=yuv420p,setsar=1',
        '-map',
        '0:v',
        '-map',
        '1:a',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '22',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-shortest',
        '-movflags',
        '+faststart',
        videoPath,
      ],
      { timeout: 60_000 },
    );
  } else {
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-loop',
        '1',
        '-t',
        String(durationSec),
        '-i',
        imagePath,
        '-f',
        'lavfi',
        '-i',
        'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-vf',
        'fps=30,format=yuv420p,setsar=1',
        '-map',
        '0:v',
        '-map',
        '1:a',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '22',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '96k',
        '-shortest',
        '-movflags',
        '+faststart',
        videoPath,
      ],
      { timeout: 60_000 },
    );
  }

  return {
    imagePath,
    videoPath,
    trackArtist: audioTrack?.artist ?? null,
    trackTitle: audioTrack?.title ?? null,
  };
}
