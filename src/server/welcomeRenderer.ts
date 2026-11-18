import fs from 'node:fs';
import sharp, { type OverlayOptions, type Sharp } from 'sharp';
import { getUploadFilePath } from './configStore.ts';

export interface RenderBannerParams {
  title: string;
  message: string;
  memberDisplayName: string;
  memberUsername: string;
  guildName: string;
  memberCount: number;
  avatarUrl: string | null;
  imageFilename: string | null;
}

const BANNER_WIDTH = 960;
const BANNER_HEIGHT = 480;
const AVATAR_SIZE = 176;
const AVATAR_LEFT = 56;
const AVATAR_TOP = (BANNER_HEIGHT - AVATAR_SIZE) / 2; // 152
const AVATAR_CENTER_X = AVATAR_LEFT + AVATAR_SIZE / 2; // 144
const AVATAR_CENTER_Y = BANNER_HEIGHT / 2; // 240
const TEXT_CENTER_X = 588; // Centered inside [264 .. 912]

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function formatBannerMessage(template: string, params: RenderBannerParams): string {
  return template
    .replace(/\{user\}/gi, params.memberDisplayName)
    .replace(/\{username\}/gi, params.memberUsername)
    .replace(/\{server\}/gi, params.guildName)
    .replace(/\{membros\}/gi, String(params.memberCount))
    .replace(/\{memberCount\}/gi, String(params.memberCount));
}

function wrapTextLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const words = normalized.split(' ');
  const lines: string[] = [];
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
      current = word.length > maxCharsPerLine ? `${word.slice(0, maxCharsPerLine - 1)}…` : word;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  } else if (lines.length === maxLines && current && !lines[maxLines - 1].endsWith('…')) {
    const last = lines[maxLines - 1];
    if (last.length >= maxCharsPerLine - 1) {
      lines[maxLines - 1] = `${last.slice(0, maxCharsPerLine - 1)}…`;
    }
  }

  return lines;
}

function truncateText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars - 1)}…`;
}

function getInitials(name: string): string {
  const clean = name.trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

async function fetchCircularAvatar(avatarUrl: string | null): Promise<Buffer | null> {
  if (!avatarUrl) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(avatarUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);

    const circleMask = Buffer.from(
      `<svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2}" fill="#ffffff"/>
      </svg>`,
    );

    return await sharp(rawBuffer)
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
      .composite([{ input: circleMask, blend: 'dest-in' }])
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

export async function renderWelcomeBanner(params: RenderBannerParams): Promise<Buffer> {
  let baseSharp: Sharp;

  const customImagePath = params.imageFilename ? getUploadFilePath(params.imageFilename) : null;
  if (customImagePath && fs.existsSync(customImagePath)) {
    // Resize smoothly to 960x480 and apply a clean atmospheric filter for contrast
    baseSharp = sharp(customImagePath)
      .resize(BANNER_WIDTH, BANNER_HEIGHT, {
        fit: 'cover',
        position: 'center',
      })
      .modulate({
        brightness: 0.88,
        saturation: 1.08,
      });
  } else {
    const fallbackBg = Buffer.from(
      `<svg width="${BANNER_WIDTH}" height="${BANNER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0f172a"/>
            <stop offset="55%" stop-color="#1e293b"/>
            <stop offset="100%" stop-color="#312e81"/>
          </linearGradient>
        </defs>
        <rect width="${BANNER_WIDTH}" height="${BANNER_HEIGHT}" fill="url(#bg)"/>
      </svg>`,
    );
    baseSharp = sharp(fallbackBg);
  }

  const avatarBuffer = await fetchCircularAvatar(params.avatarUrl);
  const titleText = escapeXml(truncateText(params.title.toUpperCase(), 28));
  const nameText = escapeXml(truncateText(params.memberDisplayName, 20));
  const formattedMessage = formatBannerMessage(params.message, params);
  const messageLines = wrapTextLines(formattedMessage, 31, 3);
  const initials = escapeXml(getInitials(params.memberDisplayName));

  // Vertically center the text block inside 480px height
  const hasTitle = Boolean(titleText);
  const titleBlockHeight = hasTitle ? 38 : 0;
  const nameBlockHeight = 60;
  const messageBlockHeight = messageLines.length > 0 ? 14 + messageLines.length * 38 : 0;
  const totalTextHeight = titleBlockHeight + nameBlockHeight + messageBlockHeight;

  let cursorY = Math.round((BANNER_HEIGHT - totalTextHeight) / 2);

  let titleSvg = '';
  if (hasTitle) {
    cursorY += 24;
    titleSvg = `<text x="${TEXT_CENTER_X}" y="${cursorY}" text-anchor="middle" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="23" font-weight="700" letter-spacing="3.5" fill="#CBD5E1">${titleText}</text>`;
    cursorY += 14;
  }

  cursorY += 46;
  const nameSvg = `<text x="${TEXT_CENTER_X}" y="${cursorY}" text-anchor="middle" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="48" font-weight="700" fill="#FFFFFF">${nameText}</text>`;
  cursorY += 14;

  const messageSvgLines = messageLines
    .map((line, index) => {
      const y = cursorY + 38 + index * 38;
      return `<text x="${TEXT_CENTER_X}" y="${y}" text-anchor="middle" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="29" font-weight="500" fill="#E2E8F0">${escapeXml(line)}</text>`;
    })
    .join('\n');

  const avatarRadius = AVATAR_SIZE / 2;
  const avatarFallbackSvg = avatarBuffer
    ? ''
    : `<circle cx="${AVATAR_CENTER_X}" cy="${AVATAR_CENTER_Y}" r="${avatarRadius}" fill="#334155" stroke="rgba(255,255,255,0.65)" stroke-width="4"/>
       <text x="${AVATAR_CENTER_X}" y="${AVATAR_CENTER_Y + 18}" text-anchor="middle" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="52" font-weight="700" fill="#FFFFFF">${initials}</text>`;

  const avatarRingSvg = avatarBuffer
    ? `<circle cx="${AVATAR_CENTER_X}" cy="${AVATAR_CENTER_Y}" r="${avatarRadius + 2}" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="4"/>`
    : '';

  const overlaySvg = Buffer.from(
    `<svg width="${BANNER_WIDTH}" height="${BANNER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="scrim" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="rgba(10, 15, 28, 0.56)"/>
          <stop offset="50%" stop-color="rgba(15, 23, 42, 0.62)"/>
          <stop offset="100%" stop-color="rgba(10, 15, 28, 0.76)"/>
        </linearGradient>
        <radialGradient id="glow" cx="18%" cy="50%" r="45%">
          <stop offset="0%" stop-color="rgba(88, 101, 242, 0.24)"/>
          <stop offset="100%" stop-color="rgba(88, 101, 242, 0)"/>
        </radialGradient>
      </defs>
      <rect width="${BANNER_WIDTH}" height="${BANNER_HEIGHT}" fill="url(#scrim)"/>
      <rect width="${BANNER_WIDTH}" height="${BANNER_HEIGHT}" fill="url(#glow)"/>
      <rect x="18" y="18" width="${BANNER_WIDTH - 36}" height="${BANNER_HEIGHT - 36}" rx="18" fill="none" stroke="rgba(255,255,255,0.20)" stroke-width="1.5"/>
      ${avatarFallbackSvg}
      ${titleSvg}
      ${nameSvg}
      ${messageSvgLines}
    </svg>`,
  );

  const composites: OverlayOptions[] = [{ input: overlaySvg, top: 0, left: 0 }];

  if (avatarBuffer) {
    composites.push({ input: avatarBuffer, top: AVATAR_TOP, left: AVATAR_LEFT });
    const ringOverlay = Buffer.from(
      `<svg width="${BANNER_WIDTH}" height="${BANNER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        ${avatarRingSvg}
      </svg>`,
    );
    composites.push({ input: ringOverlay, top: 0, left: 0 });
  }

  return await baseSharp.composite(composites).png().toBuffer();
}
