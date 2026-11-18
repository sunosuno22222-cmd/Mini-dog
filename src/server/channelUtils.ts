import { ChannelType, type Guild, type GuildBasedChannel, type NewsChannel, type TextChannel } from 'discord.js';

const TINY_CHAR_MAP: Record<string, string> = {
  a: 'ᵃ',
  b: 'ᵇ',
  c: 'ᶜ',
  d: 'ᵈ',
  e: 'ᵉ',
  f: 'ᶠ',
  g: 'ᵍ',
  h: 'ʰ',
  i: 'ⁱ',
  j: 'ʲ',
  k: 'ᵏ',
  l: 'ˡ',
  m: 'ᵐ',
  n: 'ⁿ',
  o: 'ᵒ',
  p: 'ᵖ',
  q: 'ᑫ',
  r: 'ʳ',
  s: 'ˢ',
  t: 'ᵗ',
  u: 'ᵘ',
  v: 'ᵛ',
  w: 'ʷ',
  x: 'ˣ',
  y: 'ʸ',
  z: 'ᶻ',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

const REVERSE_TINY_MAP: Record<string, string> = Object.fromEntries([
  ...Object.entries(TINY_CHAR_MAP).map(([ascii, tiny]) => [tiny, ascii]),
  // Additional tiny/small-caps/superscript variants for safe normalization
  ['ᵠ', 'q'],
  ['𐞥', 'q'],
  ['ᴀ', 'a'],
  ['ʙ', 'b'],
  ['ᴄ', 'c'],
  ['ᴅ', 'd'],
  ['ᴇ', 'e'],
  ['ꜰ', 'f'],
  ['ɢ', 'g'],
  ['ʜ', 'h'],
  ['ɪ', 'i'],
  ['ᴊ', 'j'],
  ['ᴋ', 'k'],
  ['ʟ', 'l'],
  ['ᴍ', 'm'],
  ['ɴ', 'n'],
  ['ᴏ', 'o'],
  ['ᴘ', 'p'],
  ['ꞯ', 'q'],
  ['ʀ', 'r'],
  ['ꜱ', 's'],
  ['ᴛ', 't'],
  ['ᴜ', 'u'],
  ['ᴠ', 'v'],
  ['ᴡ', 'w'],
  ['ʏ', 'y'],
  ['ᴢ', 'z'],
]);

/**
 * Converts standard ASCII letters/digits to Mathematical Bold Serif Unicode font
 * (e.g. "𝐓𝐞𝐱𝐭𝐨 𝐝𝐞 𝐞𝐱𝐞𝐦𝐩𝐥𝐨") without any Unicode icons.
 */
export function toBoldSerifFont(input: string): string {
  const clean = input.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  let out = '';
  for (const ch of clean) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) {
      // A-Z -> U+1D400..U+1D419
      out += String.fromCodePoint(0x1d400 + (code - 65));
    } else if (code >= 97 && code <= 122) {
      // a-z -> U+1D41A..U+1D433
      out += String.fromCodePoint(0x1d41a + (code - 97));
    } else if (code >= 48 && code <= 57) {
      // 0-9 -> U+1D7CE..U+1D7D7
      out += String.fromCodePoint(0x1d7ce + (code - 48));
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Channel font helper (now mapped to Mathematical Bold Serif "𝐓𝐞𝐱𝐭𝐨 𝐝𝐞 𝐞𝐱𝐞𝐦𝐩𝐥𝐨").
 */
export function toTinyFont(input: string): string {
  return toBoldSerifFont(input);
}

/**
 * Normalizes any Discord channel, category, or role name — including Mathematical Bold/Sans,
 * Tiny Superscript, Small Caps, and accented characters — into clean lowercase ASCII.
 */
export function normalizeDiscordName(name: string): string {
  let mapped = '';
  for (const ch of name) {
    mapped += REVERSE_TINY_MAP[ch] ?? ch;
  }
  return mapped
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function isGuildTextOrAnnouncement(
  channel: GuildBasedChannel | null | undefined,
): channel is TextChannel | NewsChannel {
  return Boolean(
    channel &&
      (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement),
  );
}

export function findExpChannelInGuild(guild: Guild): TextChannel | NewsChannel | null {
  for (const ch of guild.channels.cache.values()) {
    if (!isGuildTextOrAnnouncement(ch)) continue;
    const norm = normalizeDiscordName(ch.name);
    if (/(?:^|[^a-z])exp(?:[^a-z]|$)/.test(norm)) {
      return ch;
    }
  }
  return null;
}

export function findMuralChannelInGuild(guild: Guild): TextChannel | NewsChannel | null {
  const textChannels: Array<TextChannel | NewsChannel> = [];
  for (const ch of guild.channels.cache.values()) {
    if (isGuildTextOrAnnouncement(ch)) {
      textChannels.push(ch);
    }
  }

  const primary = textChannels.find((ch) => {
    const norm = normalizeDiscordName(ch.name);
    return (
      (norm.includes('mural') && !norm.includes('pedir')) ||
      (norm.includes('mrl') && !norm.includes('pdr'))
    );
  });
  if (primary) return primary;

  return (
    textChannels.find((ch) => {
      const norm = normalizeDiscordName(ch.name);
      return norm.includes('mural') || norm.includes('mrl');
    }) ?? null
  );
}

export function findPedirMuralChannelInGuild(guild: Guild): TextChannel | NewsChannel | null {
  for (const ch of guild.channels.cache.values()) {
    if (!isGuildTextOrAnnouncement(ch)) continue;
    const norm = normalizeDiscordName(ch.name);
    if (
      (norm.includes('pedir') && norm.includes('mural')) ||
      (norm.includes('pdr') && norm.includes('mrl'))
    ) {
      return ch;
    }
  }
  return null;
}

export function findChorarChannelInGuild(guild: Guild): TextChannel | NewsChannel | null {
  for (const ch of guild.channels.cache.values()) {
    if (!isGuildTextOrAnnouncement(ch)) continue;
    const norm = normalizeDiscordName(ch.name);
    if (norm.includes('chorar') || norm.includes('chrr')) {
      return ch;
    }
  }
  return null;
}

export function findRegistroChannelInGuild(guild: Guild): TextChannel | NewsChannel | null {
  for (const ch of guild.channels.cache.values()) {
    if (!isGuildTextOrAnnouncement(ch)) continue;
    const norm = normalizeDiscordName(ch.name).replace(/[^a-z0-9]/g, '');
    if (norm === 'reg' || norm === 'registro' || norm.includes('registro')) {
      return ch;
    }
  }
  return null;
}
