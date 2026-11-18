import sharp, { type OverlayOptions } from 'sharp';

export interface RenderMuralCardParams {
  title: string;
  observation: string;
  targetDisplayName: string;
  targetUsername: string;
  avatarUrl: string | null;
}

const CARD_WIDTH = 860;
const IMAGE_SIZE = 380;
const IMAGE_RADIUS = 28;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

function getInitials(name: string): string {
  const clean = name.trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

function upgradeDiscordAvatarSize(avatarUrl: string): string {
  try {
    const parsed = new URL(avatarUrl);
    if (parsed.hostname.includes('discordapp.com') || parsed.hostname.includes('discordapp.net')) {
      const currentSize = Number(parsed.searchParams.get('size') || '0');
      if (!currentSize || currentSize < 512) {
        parsed.searchParams.set('size', '512');
      }
      return parsed.toString();
    }
  } catch {
    // Keep original string if not a valid URL
  }
  return avatarUrl;
}

async function fetchRoundedLargeAvatar(avatarUrl: string | null): Promise<Buffer | null> {
  if (!avatarUrl) return null;

  try {
    const highResUrl = upgradeDiscordAvatarSize(avatarUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const response = await fetch(highResUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) return null;
    const rawBuffer = Buffer.from(await response.arrayBuffer());

    const roundedMask = Buffer.from(
      `<svg width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" rx="${IMAGE_RADIUS}" ry="${IMAGE_RADIUS}" fill="#ffffff"/>
      </svg>`,
    );

    return await sharp(rawBuffer)
      .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: 'cover', position: 'center' })
      .composite([{ input: roundedMask, blend: 'dest-in' }])
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * Renders a sleek, borderless matte-gray PNG mural card with editorial typography
 * at the top and a large rounded showcase of the member's photo at the bottom.
 */
export async function renderMuralCard(params: RenderMuralCardParams): Promise<Buffer> {
  const titleLines = wrapLines(params.title.trim() || 'Mural', 26, 2);
  const obsLines = wrapLines(params.observation.trim(), 48, 6);

  const topPad = 48;
  const accentBarHeight = 4;
  const gapAfterBar = 28;
  const titleLineHeight = 54;
  const titleBlockHeight = Math.max(1, titleLines.length) * titleLineHeight;
  const gapAfterTitle = obsLines.length > 0 ? 18 : 0;
  const obsLineHeight = 35;
  const obsBlockHeight = obsLines.length * obsLineHeight;
  const gapBeforeDivider = 28;
  const dividerHeight = 1;
  const gapBeforeImage = 32;
  const gapAfterImage = 36;
  const userNameHeight = 28;
  const userHandleHeight = 22;
  const bottomPad = 42;

  const cardHeight =
    topPad +
    accentBarHeight +
    gapAfterBar +
    titleBlockHeight +
    gapAfterTitle +
    obsBlockHeight +
    gapBeforeDivider +
    dividerHeight +
    gapBeforeImage +
    IMAGE_SIZE +
    gapAfterImage +
    userNameHeight +
    userHandleHeight +
    bottomPad;

  const centerX = CARD_WIDTH / 2;
  let cursorY = topPad;

  const accentBarSvg = `<rect x="${centerX - 28}" y="${cursorY}" width="56" height="${accentBarHeight}" rx="2" fill="#71717A"/>`;
  cursorY += accentBarHeight + gapAfterBar;

  const titleSvg = titleLines
    .map((line, i) => {
      const y = cursorY + 42 + i * titleLineHeight;
      return `<text x="${centerX}" y="${y}" text-anchor="middle" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="44" font-weight="700" fill="#FAFAFA">${escapeXml(line)}</text>`;
    })
    .join('\n');

  cursorY += titleBlockHeight + gapAfterTitle;

  const obsSvg = obsLines
    .map((line, i) => {
      const y = cursorY + 26 + i * obsLineHeight;
      return `<text x="${centerX}" y="${y}" text-anchor="middle" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="25" font-weight="400" fill="#D4D4D8">${escapeXml(line)}</text>`;
    })
    .join('\n');

  cursorY += obsBlockHeight + gapBeforeDivider;

  const dividerWidth = 520;
  const dividerSvg = `<rect x="${centerX - dividerWidth / 2}" y="${cursorY}" width="${dividerWidth}" height="${dividerHeight}" fill="rgba(255,255,255,0.08)"/>`;

  cursorY += dividerHeight + gapBeforeImage;

  const imageTop = cursorY;
  const imageLeft = Math.round((CARD_WIDTH - IMAGE_SIZE) / 2);
  const imageCenterY = imageTop + IMAGE_SIZE / 2;

  const avatarBuffer = await fetchRoundedLargeAvatar(params.avatarUrl);
  const initials = escapeXml(getInitials(params.targetDisplayName || params.targetUsername));

  const imageShadowSvg = `<rect x="${imageLeft}" y="${imageTop + 10}" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" rx="${IMAGE_RADIUS}" ry="${IMAGE_RADIUS}" fill="rgba(0,0,0,0.32)"/>`;

  const avatarFallbackSvg = avatarBuffer
    ? ''
    : `<rect x="${imageLeft}" y="${imageTop}" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" rx="${IMAGE_RADIUS}" ry="${IMAGE_RADIUS}" fill="#3F3F46"/>
       <text x="${centerX}" y="${imageCenterY + 34}" text-anchor="middle" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="96" font-weight="700" fill="#F4F4F5">${initials}</text>`;

  const nameY = imageTop + IMAGE_SIZE + gapAfterImage;
  const handleY = nameY + 28;
  const safeDisplayName = escapeXml(
    params.targetDisplayName.trim().slice(0, 32) || params.targetUsername,
  );
  const safeHandle = escapeXml(`@${params.targetUsername.replace(/^@/, '').slice(0, 32)}`);

  const baseSvg = Buffer.from(
    `<svg width="${CARD_WIDTH}" height="${cardHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="matteGray" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#2E3035"/>
          <stop offset="55%" stop-color="#26282C"/>
          <stop offset="100%" stop-color="#1E2024"/>
        </linearGradient>
        <radialGradient id="softLight" cx="50%" cy="12%" r="68%">
          <stop offset="0%" stop-color="rgba(255,255,255,0.05)"/>
          <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
        </radialGradient>
      </defs>
      <rect width="${CARD_WIDTH}" height="${cardHeight}" rx="22" fill="url(#matteGray)"/>
      <rect width="${CARD_WIDTH}" height="${cardHeight}" rx="22" fill="url(#softLight)"/>
      ${accentBarSvg}
      ${titleSvg}
      ${obsSvg}
      ${dividerSvg}
      ${imageShadowSvg}
      ${avatarFallbackSvg}
      <text x="${centerX}" y="${nameY}" text-anchor="middle" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="26" font-weight="700" fill="#FAFAFA">${safeDisplayName}</text>
      <text x="${centerX}" y="${handleY}" text-anchor="middle" font-family="Noto Sans, DejaVu Sans, Liberation Sans, sans-serif" font-size="18" font-weight="400" fill="#A1A1AA">${safeHandle}</text>
    </svg>`,
  );

  const composites: OverlayOptions[] = [];
  if (avatarBuffer) {
    composites.push({ input: avatarBuffer, top: imageTop, left: imageLeft });
  }

  return await sharp(baseSvg).composite(composites).png().toBuffer();
}
