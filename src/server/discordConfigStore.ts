import fs from 'node:fs';
import path from 'node:path';

export interface DiscordCredentials {
  botToken?: string;
  applicationId?: string;
  clientSecret?: string;
  publicKey?: string;
  groqApiKey?: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const CREDENTIALS_FILE = path.resolve(DATA_DIR, 'discord-credentials.json');

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Extracts Discord Bot User ID / Application ID from token by decoding the first base64 segment.
 */
export function extractAppIdFromToken(token?: string): string | null {
  if (!token || typeof token !== 'string') return null;
  const clean = token.trim();
  const dotIdx = clean.indexOf('.');
  if (dotIdx <= 0) return null;
  try {
    const firstPart = clean.slice(0, dotIdx);
    const decoded = Buffer.from(firstPart, 'base64').toString('utf-8');
    if (/^\d{17,22}$/.test(decoded)) {
      return decoded;
    }
  } catch {}
  return null;
}

export function loadSavedDiscordCredentials(): DiscordCredentials {
  ensureDataDir();
  if (!fs.existsSync(CREDENTIALS_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as DiscordCredentials;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Syncs saved credentials to process.env if they are not already set.
 */
export function hydrateDiscordEnvFromDisk(): DiscordCredentials {
  const saved = loadSavedDiscordCredentials();

  if (saved.botToken && !process.env.DISCORD_BOT_TOKEN) {
    process.env.DISCORD_BOT_TOKEN = saved.botToken.trim();
  }
  if (saved.applicationId && !process.env.DISCORD_APPLICATION_ID) {
    process.env.DISCORD_APPLICATION_ID = saved.applicationId.trim();
  } else if (!process.env.DISCORD_APPLICATION_ID && process.env.DISCORD_BOT_TOKEN) {
    const extracted = extractAppIdFromToken(process.env.DISCORD_BOT_TOKEN);
    if (extracted) {
      process.env.DISCORD_APPLICATION_ID = extracted;
    }
  }
  if (saved.clientSecret && !process.env.DISCORD_CLIENT_SECRET) {
    process.env.DISCORD_CLIENT_SECRET = saved.clientSecret.trim();
  }
  if (saved.publicKey && !process.env.DISCORD_PUBLIC_KEY) {
    process.env.DISCORD_PUBLIC_KEY = saved.publicKey.trim();
  }
  if (saved.groqApiKey && !process.env.GROQ_API_KEY) {
    process.env.GROQ_API_KEY = saved.groqApiKey.trim();
  }

  return saved;
}

export function saveDiscordCredentials(creds: DiscordCredentials): DiscordCredentials {
  ensureDataDir();
  const existing = loadSavedDiscordCredentials();

  const botToken = creds.botToken !== undefined ? creds.botToken.trim() : existing.botToken;
  let applicationId = creds.applicationId !== undefined ? creds.applicationId.trim() : existing.applicationId;
  const clientSecret = creds.clientSecret !== undefined ? creds.clientSecret.trim() : existing.clientSecret;
  const publicKey = creds.publicKey !== undefined ? creds.publicKey.trim() : existing.publicKey;
  const groqApiKey = creds.groqApiKey !== undefined ? creds.groqApiKey.trim() : existing.groqApiKey;

  // Auto-extract Application ID from token if not explicitly provided
  if (!applicationId && botToken) {
    const extracted = extractAppIdFromToken(botToken);
    if (extracted) {
      applicationId = extracted;
    }
  }

  const updated: DiscordCredentials = {
    botToken: botToken || undefined,
    applicationId: applicationId || undefined,
    clientSecret: clientSecret || undefined,
    publicKey: publicKey || undefined,
    groqApiKey: groqApiKey || undefined,
  };

  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(updated, null, 2), { mode: 0o600 });

  if (botToken) process.env.DISCORD_BOT_TOKEN = botToken;
  if (applicationId) process.env.DISCORD_APPLICATION_ID = applicationId;
  if (clientSecret) process.env.DISCORD_CLIENT_SECRET = clientSecret;
  if (publicKey) process.env.DISCORD_PUBLIC_KEY = publicKey;
  if (groqApiKey) process.env.GROQ_API_KEY = groqApiKey;

  return updated;
}

export function getDiscordCredentialsStatus(): {
  configured: boolean;
  botConfigured: boolean;
  oauthConfigured: boolean;
  hasAppId: boolean;
  hasSecret: boolean;
  hasBotToken: boolean;
  applicationId: string | null;
  botInviteUrl: string | null;
} {
  hydrateDiscordEnvFromDisk();
  const token = process.env.DISCORD_BOT_TOKEN?.trim() || '';
  const appId = process.env.DISCORD_APPLICATION_ID?.trim() || extractAppIdFromToken(token) || '';
  const secret = process.env.DISCORD_CLIENT_SECRET?.trim() || '';

  const botConfigured = Boolean(token && appId);
  const oauthConfigured = Boolean(appId && secret);
  const inviteUrl = appId
    ? `https://discord.com/oauth2/authorize?client_id=${appId}&permissions=8&scope=bot%20applications.commands`
    : null;

  return {
    configured: Boolean(botConfigured || oauthConfigured),
    botConfigured,
    oauthConfigured,
    hasAppId: Boolean(appId),
    hasSecret: Boolean(secret),
    hasBotToken: Boolean(token),
    applicationId: appId || null,
    botInviteUrl: inviteUrl,
  };
}
