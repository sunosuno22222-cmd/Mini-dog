import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type Request, type Response } from 'express';
import sharp from 'sharp';
import { createServer as createViteServer } from 'vite';
import {
  fetchBotGuildIds,
  fetchBotGuildsSummary,
  fetchGuildAllChannels,
  fetchGuildTextChannels,
  getBotClient,
  getBotStatus,
  initializeDiscordBot,
  reconnectDiscordBot,
  sendTestWelcomeBanner,
} from './src/server/bot';
import {
  deleteUploadedImage,
  getGuildConfig,
  getUploadFilePath,
  hasSavedGuildConfig,
  restoreAccountConfigsForUser,
  restorePresetForUnconfiguredGuild,
  saveGuildConfig,
  saveUploadedImage,
  syncGuildConfigToAccount,
  type BannerEventType,
  type BannerRuleConfig,
} from './src/server/configStore';

import {
  deleteStoredSession,
  getStoredSession,
  setStoredSession,
  type SessionRecord,
} from './src/server/sessionStore';
import {
  allocateUniqueExpNumber,
  createExpRecord,
  formatExpCode,
  getExpMediaDir,
  getExpMediaFilePath,
  getExpRecord,
  getNextPreviewExpNumber,
  listExpRecords,
  parseEvidenceLinks,
  setGuildTikTokOwner,
  syncUsedExpNumbersFloor,
  updateExpRecord,
  upsertRestoredExpRecord,
  validateExpNoPrivateData,
  type CarouselPublishMode,
  type ExpAudioTrackMeta,
  type ExpFormat,
  type ExpRecord,
} from './src/server/expStore';
import {
  generateCarouselSlideshowVideo,
  generateExpDraftPreview,
  generateStudioCarouselSlides,
} from './src/server/expMediaGenerator';
import {
  listRussianMusicTracks,
  selectRussianTrackForPost,
} from './src/server/tiktokMusic';
import {
  isTikTokConfigured,
  getTikTokAccounts,
  getTikTokConnection,
  verifyTikTokAccountHealth,
  publishExpToTikTok,
  publishTestPostToTikTok,
  toPublicTikTokInfo,
  type TikTokPublishMode,
} from './src/server/tiktokService';
import {
  completeZernioOAuthCallback,
  disconnectZernioAccount,
  hydrateZernioEnvFromDisk,
  pollZernioOAuthState,
  refreshZernioPostStatus,
  retryZernioPost,
  startZernioTikTokConnect,
  syncZernioAccountsForUser,
  getZernioKeyStatus,
  saveZernioApiKey,
  testZernioApiKey,
  type TikTokPrivacyLevel,
} from './src/server/zernioService';
import {
  getZernioAccounts,
  getZernioPostHistory,
  setDefaultZernioAccount,
} from './src/server/zernioStore';
import {
  applyDemonicFilterToImage,
  extractFrameFromVideoBuffer,
  generateDemonicExpContent,
  isGroqConfigured,
} from './src/server/groqService';
import { apiRouter, handleDiscordInteractions } from './src/server/api';
import { attachBroadcastWebSocketServer } from './src/server/broadcastHub';
import {
  beginCallGameMatch,
  cleanupAllCallGamesOnShutdown,
  getCallGameStatus,
  startCallGame,
  stopCallGame,
} from './src/server/callGame';
import {
  getDiscordOAuthSessionInfo,
  handleDiscordOAuthCallbackReq,
  hasPendingDiscordOAuthState,
  setOwnerProvidedDiscordLink,
} from './src/server/discordOAuth';
import {
  hydrateDiscordEnvFromDisk,
  saveDiscordCredentials,
  getDiscordCredentialsStatus,
} from './src/server/discordConfigStore';
import { resendAllChannelMessages } from './src/server/channelResender';
import {
  getModerationConfig,
  getOrCreateSpamQuarantineChannel,
  getSecurityLogs,
  toggleServerLockdown,
  unbanAndAuthorizeBot,
  updateModerationConfig,
  whitelistBotId,
} from './src/server/moderation';
import {
  extractBotIdFromToken,
  getLastTestBotError,
  getTestBotInfo,
  initTestDiscordBot,
  inspectTestBotTokenOrId,
  runSecurityTest,
  savePersistedTestBotConfig,
  type SecurityTestType,
} from './src/server/testBot';
import { getServerScreenStatus } from './src/server/serverScreen';
import { getAllClonedVoices } from './src/server/voice';

hydrateDiscordEnvFromDisk();
hydrateZernioEnvFromDisk();

interface DiscordApiGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}

export interface ManagedGuildSummary {
  id: string;
  name: string;
  iconUrl: string | null;
  owner: boolean;
  isAdmin: boolean;
  botPresent: boolean;
}

interface OAuthStateEntry {
  mode: 'invite' | 'login';
  redirectUri: string;
  createdAt: number;
}

interface CompletedOAuthEntry {
  status: 'success' | 'cancelled' | 'error';
  sessionToken?: string;
  guildId?: string | null;
  error?: string;
  createdAt: number;
}

function resolveServerPort(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--port' && args[i + 1]) {
      const parsed = Number(args[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    } else if (arg.startsWith('--port=')) {
      const parsed = Number(arg.slice('--port='.length));
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  const envPort = Number(process.env.PORT);
  const nginxPort = Number(process.env.NGINX_PORT);
  const defaultAppPort = Number(process.env.DEFAULT_APP_PORT);

  if (Number.isFinite(envPort) && envPort > 0) {
    if (process.env.NODE_ENV !== 'production' && nginxPort > 0 && envPort === nginxPort) {
      return Number.isFinite(defaultAppPort) && defaultAppPort > 0 ? defaultAppPort : 3000;
    }
    return envPort;
  }

  return Number.isFinite(defaultAppPort) && defaultAppPort > 0 ? defaultAppPort : 3000;
}

const PORT = resolveServerPort();
const SESSION_COOKIE_NAME = 'aph_session';

function loadOrCreateSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret) return envSecret;

  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim() || '';
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim() || '';
  const appId = process.env.DISCORD_APPLICATION_ID?.trim() || '';

  if (clientSecret || botToken) {
    return crypto
      .createHmac('sha256', 'aph-bot-manager-session-key-v2')
      .update(`${appId}:${clientSecret}:${botToken}`)
      .digest('hex');
  }

  const dataDir = path.resolve(process.cwd(), 'server', 'data');
  const secretPath = path.resolve(dataDir, '.session-secret');
  fs.mkdirSync(dataDir, { recursive: true });

  if (fs.existsSync(secretPath)) {
    const existing = fs.readFileSync(secretPath, 'utf-8').trim();
    if (existing.length >= 32) return existing;
  }

  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(secretPath, generated, { mode: 0o600 });
  return generated;
}

const SESSION_SECRET = loadOrCreateSessionSecret();
const SESSION_AES_KEY = crypto.createHash('sha256').update(SESSION_SECRET).digest();
const revokedSessionIds = new Set<string>();

const oauthStates = new Map<string, OAuthStateEntry>();
const completedOAuthStates = new Map<string, CompletedOAuthEntry>();

function cleanupExpiredStates(): void {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [state, entry] of oauthStates.entries()) {
    if (entry.createdAt < cutoff) {
      oauthStates.delete(state);
    }
  }
  const completedCutoff = Date.now() - 5 * 60 * 1000;
  for (const [state, entry] of completedOAuthStates.entries()) {
    if (entry.createdAt < completedCutoff) {
      completedOAuthStates.delete(state);
    }
  }
}

function isAllowedOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();
    if (
      parsed.protocol === 'https:' &&
      (host.endsWith('.run.app') ||
        host.endsWith('.usercontent.goog') ||
        host.endsWith('.web.app') ||
        host.endsWith('.firebaseapp.com') ||
        host.endsWith('.cloudworkstations.dev') ||
        host.endsWith('.aistudio.google.com'))
    ) {
      return true;
    }
    if (
      parsed.protocol === 'http:' &&
      (host === 'localhost' || host === '127.0.0.1')
    ) {
      return true;
    }
    if (process.env.APP_URL) {
      try {
        const appParsed = new URL(process.env.APP_URL.trim());
        if (parsed.origin === appParsed.origin) return true;
      } catch {}
    }
    return false;
  } catch {
    return false;
  }
}

function resolvePublicOrigin(req?: Request, requestedOrigin?: string): string {
  const candidates: string[] = [];
  if (requestedOrigin) candidates.push(requestedOrigin.trim());
  if (req) {
    const reqOrigin = typeof req.headers.origin === 'string' ? req.headers.origin.trim() : '';
    if (reqOrigin) candidates.push(reqOrigin);
    const forwardedHost =
      (typeof req.headers['x-forwarded-host'] === 'string'
        ? req.headers['x-forwarded-host'].split(',')[0].trim()
        : '') || req.get('host') || '';
    if (forwardedHost) {
      const forwardedProto =
        (typeof req.headers['x-forwarded-proto'] === 'string'
          ? req.headers['x-forwarded-proto'].split(',')[0].trim()
          : '') || (forwardedHost.startsWith('localhost') || forwardedHost.startsWith('127.0.0.1') ? 'http' : 'https');
      candidates.push(`${forwardedProto}://${forwardedHost}`);
    }
  }
  for (const cand of candidates) {
    if (cand && isAllowedOrigin(cand)) {
      return cand.replace(/\/+$/, '');
    }
  }
  return (process.env.APP_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');
}

function getRedirectUri(requestedOrigin?: string): string {
  if (requestedOrigin && isAllowedOrigin(requestedOrigin)) {
    return `${requestedOrigin.replace(/\/+$/, '')}/auth/callback`;
  }
  const appUrl = (process.env.APP_URL || 'http://localhost:3000').trim().replace(/\/+$/, '');
  return `${appUrl}/auth/callback`;
}

function encryptStatelessSession(sessionId: string, session: SessionRecord): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', SESSION_AES_KEY, iv);
  const payload = JSON.stringify({ id: sessionId, s: session });
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2.${iv.toString('base64url')}.${encrypted.toString('base64url')}.${tag.toString('base64url')}`;
}

function decryptStatelessSession(
  tokenVal: unknown,
): { sessionId: string; session: SessionRecord } | null {
  if (typeof tokenVal !== 'string' || !tokenVal.startsWith('v2.')) return null;
  const parts = tokenVal.split('.');
  if (parts.length !== 4) return null;

  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const encrypted = Buffer.from(parts[2], 'base64url');
    const tag = Buffer.from(parts[3], 'base64url');
    if (iv.length !== 12 || tag.length !== 16) return null;

    const decipher = crypto.createDecipheriv('aes-256-gcm', SESSION_AES_KEY, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(decrypted) as { id?: string; s?: SessionRecord };
    if (!parsed?.id || !parsed?.s?.user?.id || !parsed?.s?.accessToken) return null;
    if (Date.now() - (parsed.s.createdAt || 0) > 7 * 24 * 60 * 60 * 1000) return null;
    return { sessionId: parsed.id, session: parsed.s };
  } catch {
    return null;
  }
}

function verifySignedSessionId(tokenVal: unknown): string | null {
  if (typeof tokenVal !== 'string') return null;
  const dotIdx = tokenVal.indexOf('.');
  if (dotIdx <= 0) return null;

  const sessionId = tokenVal.slice(0, dotIdx);
  const sig = tokenVal.slice(dotIdx + 1);
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(sessionId).digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  return sessionId;
}

function getSessionFromRequest(req: Request): { sessionId: string; session: SessionRecord } | null {
  const authHeader = req.headers.authorization;
  const bearerToken =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;

  const rawToken = bearerToken || req.cookies?.[SESSION_COOKIE_NAME];

  const stateless = decryptStatelessSession(rawToken);
  if (stateless) {
    if (revokedSessionIds.has(stateless.sessionId)) return null;
    const stored = getStoredSession(stateless.sessionId);
    if (stored) {
      return { sessionId: stateless.sessionId, session: stored };
    }
    setStoredSession(stateless.sessionId, stateless.session);
    return stateless;
  }

  const sessionId = verifySignedSessionId(rawToken);
  if (!sessionId || revokedSessionIds.has(sessionId)) return null;

  const session = getStoredSession(sessionId);
  if (!session) return null;

  return { sessionId, session };
}

function getPanelOwnerId(
  req: Request,
  auth: { sessionId: string; session: SessionRecord } | null,
): string {
  if (auth?.session?.user?.id) {
    return auth.session.user.id;
  }
  const fbUid = req.header('x-firebase-uid')?.trim() || '';
  if (/^[a-zA-Z0-9_-]{4,128}$/.test(fbUid)) {
    return `fb_${fbUid}`;
  }
  return 'panel-owner';
}

function resolveTikTokOwnerId(
  req: Request,
  auth: { sessionId: string; session: SessionRecord } | null,
  preferredAccountId?: string,
): string {
  if (auth?.session?.user?.id) {
    return auth.session.user.id;
  }
  const panelOwner = getPanelOwnerId(req, null);
  const direct = getZernioAccounts(panelOwner);
  if (direct.length > 0) return panelOwner;

  const all = getZernioAccounts();
  if (preferredAccountId) {
    const matched = all.find(
      (a) =>
        a.id === preferredAccountId ||
        a.zernioAccountId === preferredAccountId ||
        a.username === preferredAccountId,
    );
    if (matched?.discordUserId) return matched.discordUserId;
  }
  const defaultOrFirst = all.find((a) => a.isDefault) || all[0];
  return defaultOrFirst?.discordUserId || panelOwner;
}

function setSessionCookie(res: Response, sessionId: string, session: SessionRecord): string {
  const token = encryptStatelessSession(sessionId, session);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
  return token;
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
  });
}

function buildUserAvatarUrl(userId: string, avatarHash: string | null): string | null {
  if (!avatarHash) return null;
  const ext = avatarHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=128`;
}

function buildGuildIconUrl(guildId: string, iconHash: string | null): string | null {
  if (!iconHash) return null;
  const ext = iconHash.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.${ext}?size=128`;
}

function hasAdminPermission(guild: DiscordApiGuild): boolean {
  if (guild.owner) return true;
  try {
    const perms = BigInt(guild.permissions || '0');
    const ADMINISTRATOR = 0x8n;
    const MANAGE_GUILD = 0x20n;
    return (perms & ADMINISTRATOR) === ADMINISTRATOR || (perms & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
  }
}

async function refreshAccessTokenIfNeeded(
  sessionId: string,
  session: SessionRecord,
  res?: Response,
): Promise<SessionRecord | null> {
  if (Date.now() < session.expiresAt - 60_000) {
    return session;
  }

  if (!session.refreshToken) {
    return session;
  }

  const clientId = process.env.DISCORD_APPLICATION_ID?.trim();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken,
  });

  const resp = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!resp.ok) {
    deleteStoredSession(sessionId);
    return null;
  }

  const data = (await resp.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const updated: SessionRecord = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? session.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    user: session.user,
    createdAt: session.createdAt,
  };
  setStoredSession(sessionId, updated);
  if (res) {
    const newToken = setSessionCookie(res, sessionId, updated);
    res.setHeader('X-Aph-Session-Token', newToken);
  }
  return updated;
}

function renderPopupClosePage(
  payload: Record<string, unknown>,
  heading: string,
  description: string,
): string {
  const serialized = JSON.stringify(payload).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Autenticação Discord</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #fafafa; color: #0f172a; }
      .box { text-align: center; padding: 32px; max-width: 420px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; }
      h1 { font-size: 18px; font-weight: 600; margin: 0 0 8px 0; }
      p { font-size: 14px; color: #475569; line-height: 1.5; margin: 0 0 20px 0; }
      button { background: #5865f2; color: #fff; border: none; border-radius: 8px; padding: 10px 18px; font-size: 14px; font-weight: 500; cursor: pointer; }
      a { display: inline-block; margin-top: 12px; font-size: 13px; color: #64748b; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="box">
      <h1>${heading}</h1>
      <p>${description}</p>
      <button type="button" onclick="window.close()">Fechar esta guia</button>
      <div><a href="/">Ir para o painel nesta guia</a></div>
    </div>
    <script>
      (function() {
        var data = ${serialized};
        try {
          if (data && data.sessionToken) {
            localStorage.setItem('aph_session_token', data.sessionToken);
          }
        } catch (e) {}
        if (window.opener) {
          try {
            window.opener.postMessage(data, '*');
          } catch (e) {}
          window.close();
        }
      })();
    </script>
  </body>
</html>`;
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    express.json({
      limit: '60mb',
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf.toString('utf8');
      },
    }),
  );
  app.use(express.urlencoded({ limit: '60mb', extended: true }));
  app.use(cookieParser());

  app.post(
    ['/public/discord/interactions', '/api/public/discord/interactions'],
    handleDiscordInteractions,
  );
  app.use('/api', apiRouter);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Discord Credentials (Bot Token, Client ID, Secret) configuration & status
  app.get('/api/config/discord-credentials', (_req, res) => {
    res.json(getDiscordCredentialsStatus());
  });

  app.post('/api/config/discord-credentials', async (req, res) => {
    try {
      const { botToken, applicationId, clientSecret, publicKey, groqApiKey } = req.body || {};
      const saved = saveDiscordCredentials({
        botToken,
        applicationId,
        clientSecret,
        publicKey,
        groqApiKey,
      });

      if (saved.botToken) {
        await initializeDiscordBot().catch((e) => console.error('[Discord Bot] Init error:', e));
        await reconnectDiscordBot().catch((e) => console.error('[Discord Bot] Reconnect error:', e));
      }

      res.json({
        success: true,
        credentials: getDiscordCredentialsStatus(),
        botStatus: getBotStatus(),
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Zernio API Key routes
  app.get('/api/tiktok/zernio-key', (_req, res) => {
    res.json(getZernioKeyStatus());
  });

  app.post('/api/tiktok/zernio-key', (req, res) => {
    const rawKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
    if (!rawKey) {
      return res.status(400).json({ error: 'Informe a chave ZERNIO_API_KEY.' });
    }
    saveZernioApiKey(rawKey);
    res.json({
      success: true,
      ...getZernioKeyStatus(),
    });
  });

  app.post('/api/tiktok/zernio-test', async (req, res) => {
    const rawKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : undefined;
    const testResult = await testZernioApiKey(rawKey);
    res.json(testResult);
  });

  // Reenviar Todas as Mensagens dos Canais (5573 Satan)
  app.post('/api/discord/resend-all-channel-messages', async (req, res) => {
    try {
      const guildId = typeof req.body?.guildId === 'string' ? req.body.guildId.trim() : undefined;
      const result = await resendAllChannelMessages(guildId);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/bot/reconnect', async (_req, res) => {
    const status = await reconnectDiscordBot();
    res.json({
      botStatus: {
        connected: status.connected,
        botTag: status.botTag,
        guildCount: status.guildCount,
        error: status.error,
      },
    });
  });

  // Safe configuration & session status (never exposes Client Secret or Bot Token)
  app.get('/api/config/status', (req, res) => {
    hydrateDiscordEnvFromDisk();
    hydrateZernioEnvFromDisk();
    const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
    const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
    const botStatus = getBotStatus();
    const auth = getSessionFromRequest(req);

    res.json({
      oauthConfigured: Boolean(applicationId && clientSecret),
      botConfigured: botStatus.configured,
      groqConfigured: isGroqConfigured(),
      zernioConfigured: getZernioKeyStatus().configured,
      botStatus: {
        connected: botStatus.connected,
        botTag: botStatus.botTag,
        guildCount: botStatus.guildCount,
        error: botStatus.error,
      },
      authenticated: Boolean(auth),
      user: auth ? auth.session.user : null,
      redirectUri: getRedirectUri(),
    });
  });

  // Generates the official Discord OAuth2 URL (either inviting the bot + user auth, or user login only)
  app.get('/api/auth/url', (req, res) => {
    hydrateDiscordEnvFromDisk();
    const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
    const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
    const mode = req.query.mode === 'login' ? 'login' : 'invite';
    const guildId = typeof req.query.guild_id === 'string' ? req.query.guild_id.trim() : '';
    const requestedOrigin = typeof req.query.origin === 'string' ? req.query.origin.trim() : '';
    const redirectUri = getRedirectUri(requestedOrigin);

    if (mode === 'invite') {
      if (!applicationId) {
        res.status(503).json({
          error: 'Application ID do Discord não configurado. Configure o Bot Token ou Application ID no painel.',
          needsConfig: true,
        });
        return;
      }

      cleanupExpiredStates();

      if (clientSecret) {
        const state = crypto.randomBytes(24).toString('hex');
        oauthStates.set(state, { mode, redirectUri, createdAt: Date.now() });

        const params = new URLSearchParams({
          client_id: applicationId,
          redirect_uri: redirectUri,
          response_type: 'code',
          state,
          scope: 'bot applications.commands identify guilds',
          permissions: '8',
        });
        if (/^\d{17,22}$/.test(guildId)) {
          params.set('guild_id', guildId);
        }

        res.json({
          url: `https://discord.com/oauth2/authorize?${params.toString()}`,
          state,
        });
        return;
      }

      // Direct bot invite if clientSecret is not yet configured
      const params = new URLSearchParams({
        client_id: applicationId,
        permissions: '8',
        scope: 'bot applications.commands',
      });
      if (/^\d{17,22}$/.test(guildId)) {
        params.set('guild_id', guildId);
      }

      res.json({
        url: `https://discord.com/oauth2/authorize?${params.toString()}`,
        state: 'direct_invite',
        directInviteOnly: true,
      });
      return;
    }

    if (!applicationId || !clientSecret) {
      res.status(503).json({
        error:
          'Credenciais OAuth2 do Discord não configuradas no backend (DISCORD_APPLICATION_ID e DISCORD_CLIENT_SECRET). Configure as credenciais no painel para login com conta Discord.',
        needsConfig: true,
        inviteUrl: applicationId
          ? `https://discord.com/oauth2/authorize?client_id=${applicationId}&permissions=8&scope=bot%20applications.commands`
          : null,
      });
      return;
    }

    cleanupExpiredStates();
    const state = crypto.randomBytes(24).toString('hex');
    oauthStates.set(state, { mode, redirectUri, createdAt: Date.now() });

    const params = new URLSearchParams({
      client_id: applicationId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
      scope: 'identify guilds',
    });

    res.json({
      url: `https://discord.com/oauth2/authorize?${params.toString()}`,
      state,
    });
  });

  // Allows the main iframe tab to retrieve the session token even if the browser opened Discord OAuth in a separate tab without window.opener
  app.get('/api/auth/poll', (req, res) => {
    cleanupExpiredStates();
    const state = typeof req.query.state === 'string' ? req.query.state.trim() : '';
    if (!state) {
      res.status(400).json({ completed: false });
      return;
    }

    const completed = completedOAuthStates.get(state);
    if (!completed) {
      res.json({ completed: false });
      return;
    }

    completedOAuthStates.delete(state);
    res.json({
      completed: true,
      status: completed.status,
      sessionToken: completed.sessionToken ?? null,
      guildId: completed.guildId ?? null,
      error: completed.error ?? null,
    });
  });

  // OAuth2 callback route (handles both with and without trailing slash)
  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const error = typeof req.query.error === 'string' ? req.query.error : null;
    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    const guildId = typeof req.query.guild_id === 'string' ? req.query.guild_id : null;

    if ((state && hasPendingDiscordOAuthState(state)) || (!state && !error && code)) {
      return await handleDiscordOAuthCallbackReq(req, res);
    }

    if (error) {
      if (state) {
        completedOAuthStates.set(state, {
          status: 'cancelled',
          error,
          createdAt: Date.now(),
        });
      }
      res
        .status(200)
        .send(
          renderPopupClosePage(
            { type: 'OAUTH_AUTH_CANCELLED', error },
            'Autorização cancelada',
            'Você pode fechar esta guia e voltar para a aba anterior do painel.',
          ),
        );
      return;
    }

    if (!code || !state) {
      res
        .status(400)
        .send(
          renderPopupClosePage(
            { type: 'OAUTH_AUTH_ERROR', error: 'Parâmetros OAuth2 ausentes.' },
            'Parâmetros inválidos',
            'Parâmetros de autenticação ausentes. Feche esta guia e tente novamente.',
          ),
        );
      return;
    }

    const storedState = oauthStates.get(state);
    oauthStates.delete(state);
    if (!storedState) {
      res
        .status(400)
        .send(
          renderPopupClosePage(
            { type: 'OAUTH_AUTH_ERROR', error: 'Sessão OAuth2 expirada ou inválida.' },
            'Sessão expirada',
            'Esta sessão de autenticação expirou. Feche esta guia e tente novamente.',
          ),
        );
      return;
    }

    const applicationId = process.env.DISCORD_APPLICATION_ID?.trim();
    const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
    if (!applicationId || !clientSecret) {
      completedOAuthStates.set(state, {
        status: 'error',
        error: 'Credenciais OAuth2 ausentes no servidor.',
        createdAt: Date.now(),
      });
      res
        .status(500)
        .send(
          renderPopupClosePage(
            { type: 'OAUTH_AUTH_ERROR', error: 'Credenciais OAuth2 ausentes no servidor.' },
            'Erro de configuração',
            'Credenciais OAuth2 não configuradas no servidor.',
          ),
        );
      return;
    }

    try {
      const tokenBody = new URLSearchParams({
        client_id: applicationId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: storedState.redirectUri,
      });

      const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody,
      });

      if (!tokenResponse.ok) {
        const detail = await tokenResponse.text();
        console.error('[OAuth2] Token exchange failed:', tokenResponse.status, detail);
        completedOAuthStates.set(state, {
          status: 'error',
          error: 'Falha ao validar código OAuth2 com o Discord.',
          createdAt: Date.now(),
        });
        res
          .status(400)
          .send(
            renderPopupClosePage(
              { type: 'OAUTH_AUTH_ERROR', error: 'Falha ao validar código OAuth2 com o Discord.' },
              'Falha na autenticação',
              'Não foi possível concluir a autenticação com o Discord. Feche esta guia e tente novamente.',
            ),
          );
        return;
      }

      const tokenData = (await tokenResponse.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      };

      const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userResponse.ok) {
        completedOAuthStates.set(state, {
          status: 'error',
          error: 'Falha ao obter dados do usuário Discord.',
          createdAt: Date.now(),
        });
        res
          .status(400)
          .send(
            renderPopupClosePage(
              { type: 'OAUTH_AUTH_ERROR', error: 'Falha ao obter dados do usuário Discord.' },
              'Falha ao carregar perfil',
              'Não foi possível carregar seu perfil do Discord.',
            ),
          );
        return;
      }

      const discordUser = (await userResponse.json()) as {
        id: string;
        username: string;
        global_name?: string | null;
        avatar?: string | null;
      };

      const sessionId = crypto.randomBytes(32).toString('hex');
      const sessionRecord: SessionRecord = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        expiresAt: Date.now() + tokenData.expires_in * 1000,
        createdAt: Date.now(),
        user: {
          id: discordUser.id,
          username: discordUser.username,
          globalName: discordUser.global_name ?? null,
          avatarUrl: buildUserAvatarUrl(discordUser.id, discordUser.avatar ?? null),
        },
      };
      setStoredSession(sessionId, sessionRecord);

      const signedToken = setSessionCookie(res, sessionId, sessionRecord);

      completedOAuthStates.set(state, {
        status: 'success',
        sessionToken: signedToken,
        guildId: guildId || null,
        createdAt: Date.now(),
      });

      res
        .status(200)
        .send(
          renderPopupClosePage(
            {
              type: 'OAUTH_AUTH_SUCCESS',
              sessionToken: signedToken,
              guildId: guildId || null,
              mode: storedState.mode,
            },
            'Discord conectado com sucesso',
            'Suas configurações e servidores foram sincronizados. Você pode fechar esta guia e voltar para a aba anterior.',
          ),
        );
    } catch (err) {
      console.error('[OAuth2] Callback exception:', err);
      completedOAuthStates.set(state, {
        status: 'error',
        error: 'Erro interno durante o callback OAuth2.',
        createdAt: Date.now(),
      });
      res
        .status(500)
        .send(
          renderPopupClosePage(
            { type: 'OAUTH_AUTH_ERROR', error: 'Erro interno durante o callback OAuth2.' },
            'Erro interno',
            'Ocorreu um erro interno durante a autenticação. Feche esta guia e tente novamente.',
          ),
        );
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    const auth = getSessionFromRequest(req);
    if (auth) {
      revokedSessionIds.add(auth.sessionId);
      deleteStoredSession(auth.sessionId);
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  const userGuildsCache = new Map<string, { guilds: DiscordApiGuild[]; fetchedAt: number }>();

  async function fetchUserGuildsCached(
    sessionId: string,
    session: SessionRecord,
    forceRefresh = false,
  ): Promise<{ guilds: DiscordApiGuild[] | null; status: number; error?: string }> {
    const cached = userGuildsCache.get(sessionId);
    const now = Date.now();
    if (!forceRefresh && cached && now - cached.fetchedAt < 120_000) {
      return { guilds: cached.guilds, status: 200 };
    }

    const guildsResp = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });

    if (guildsResp.status === 401) {
      userGuildsCache.delete(sessionId);
      deleteStoredSession(sessionId);
      return { guilds: null, status: 401, error: 'Sessão Discord expirada. Conecte-se novamente.' };
    }

    if (guildsResp.status === 429) {
      if (cached && now - cached.fetchedAt < 10 * 60_000) {
        return { guilds: cached.guilds, status: 200 };
      }
      return {
        guilds: null,
        status: 429,
        error: 'Limite de requisições da API do Discord atingido. Aguarde alguns segundos.',
      };
    }

    if (!guildsResp.ok) {
      if (cached && now - cached.fetchedAt < 10 * 60_000) {
        return { guilds: cached.guilds, status: 200 };
      }
      return {
        guilds: null,
        status: 502,
        error: 'Não foi possível validar seus servidores no Discord.',
      };
    }

    const rawGuilds = (await guildsResp.json()) as DiscordApiGuild[];
    userGuildsCache.set(sessionId, { guilds: rawGuilds, fetchedAt: now });
    return { guilds: rawGuilds, status: 200 };
  }

  // Returns all bot-connected guilds (even without Discord OAuth login) and user admin guilds when logged in
  app.get('/api/guilds', async (req, res) => {
    try {
      const auth = getSessionFromRequest(req);
      const botGuilds = await fetchBotGuildsSummary();
      const botGuildMap = new Map(botGuilds.map((g) => [g.id, g]));
      const panelOwnerId = getPanelOwnerId(req, auth);

      if (auth) {
        const activeSession = await refreshAccessTokenIfNeeded(auth.sessionId, auth.session, res);
        if (activeSession) {
          const result = await fetchUserGuildsCached(auth.sessionId, activeSession, true);
          if (result.guilds) {
            const adminGuilds: ManagedGuildSummary[] = result.guilds
              .filter(hasAdminPermission)
              .map((g) => ({
                id: g.id,
                name: g.name,
                iconUrl: buildGuildIconUrl(g.id, g.icon),
                owner: g.owner,
                isAdmin: true,
                botPresent: botGuildMap.has(g.id),
              }));

            const managedMap = new Map<string, ManagedGuildSummary>();
            for (const g of adminGuilds) {
              if (g.botPresent) managedMap.set(g.id, g);
            }
            for (const bg of botGuilds) {
              if (!managedMap.has(bg.id)) {
                managedMap.set(bg.id, {
                  id: bg.id,
                  name: bg.name,
                  iconUrl: bg.iconUrl,
                  owner: bg.owner,
                  isAdmin: true,
                  botPresent: true,
                });
              }
            }

            const managedGuilds = Array.from(managedMap.values()).sort((a, b) =>
              a.name.localeCompare(b.name, 'pt-BR'),
            );
            const availableMap = new Map<string, ManagedGuildSummary>();
            for (const g of managedGuilds) availableMap.set(g.id, g);
            for (const g of adminGuilds) {
              if (!availableMap.has(g.id)) availableMap.set(g.id, g);
            }
            const availableGuilds = Array.from(availableMap.values()).sort((a, b) =>
              a.name.localeCompare(b.name, 'pt-BR'),
            );

            restoreAccountConfigsForUser(
              activeSession.user.id,
              managedGuilds.map((g) => g.id),
            );

            const tikTokOwner = resolveTikTokOwnerId(req, auth);
            for (const mg of managedGuilds) {
              if (getTikTokConnection(tikTokOwner)) {
                setGuildTikTokOwner(mg.id, tikTokOwner);
              }
            }

            res.json({
              managedGuilds,
              availableGuilds,
            });
            return;
          }
          if (result.status === 401) {
            clearSessionCookie(res);
          }
        } else {
          clearSessionCookie(res);
        }
      }

      const managedGuilds: ManagedGuildSummary[] = botGuilds.map((g) => ({
        id: g.id,
        name: g.name,
        iconUrl: g.iconUrl,
        owner: g.owner,
        isAdmin: true,
        botPresent: true,
      }));

      restoreAccountConfigsForUser(
        panelOwnerId,
        managedGuilds.map((g) => g.id),
      );

      const tikTokOwner = resolveTikTokOwnerId(req, null);
      if (getTikTokConnection(tikTokOwner)) {
        for (const mg of managedGuilds) {
          setGuildTikTokOwner(mg.id, tikTokOwner);
        }
      }

      res.json({
        managedGuilds,
        availableGuilds: managedGuilds,
        publicBotMode: true,
      });
    } catch (err) {
      console.error('[API /api/guilds] Error:', err);
      res.status(500).json({ error: 'Erro interno ao consultar servidores.' });
    }
  });

  async function authorizeGuildAdmin(
    req: Request,
    res: Response,
    guildId: string,
  ): Promise<{
    session: SessionRecord;
    guild: { id: string; name: string; iconUrl: string | null; owner: boolean };
    isSyntheticSession?: boolean;
  } | null> {
    if (!/^\d{17,22}$/.test(guildId)) {
      res.status(400).json({ error: 'ID de servidor inválido.' });
      return null;
    }

    const botGuilds = await fetchBotGuildsSummary();
    const botGuild = botGuilds.find((g) => g.id === guildId);
    if (!botGuild) {
      res.status(404).json({ error: 'O bot não está presente neste servidor.' });
      return null;
    }

    const auth = getSessionFromRequest(req);
    if (auth) {
      const activeSession = await refreshAccessTokenIfNeeded(auth.sessionId, auth.session, res);
      if (activeSession) {
        const result = await fetchUserGuildsCached(auth.sessionId, activeSession, false);
        if (result.guilds) {
          const target = result.guilds.find((g) => g.id === guildId);
          if (target && !hasAdminPermission(target)) {
            res.status(403).json({ error: 'Você não possui permissão administrativa neste servidor.' });
            return null;
          }
          return {
            session: activeSession,
            guild: {
              id: botGuild.id,
              name: target?.name || botGuild.name,
              iconUrl: target ? buildGuildIconUrl(target.id, target.icon) : botGuild.iconUrl,
              owner: target ? target.owner : botGuild.owner,
            },
          };
        }
        if (result.status === 401) {
          clearSessionCookie(res);
        }
      } else {
        clearSessionCookie(res);
      }
    }

    const panelOwnerId = getPanelOwnerId(req, null);
    return {
      session: {
        accessToken: '',
        refreshToken: null,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        createdAt: Date.now(),
        user: {
          id: panelOwnerId,
          username: 'Painel 5573',
          globalName: 'Painel 5573',
          avatarUrl: null,
        },
      },
      guild: {
        id: botGuild.id,
        name: botGuild.name,
        iconUrl: botGuild.iconUrl,
        owner: botGuild.owner,
      },
      isSyntheticSession: true,
    };
  }

  function serializeGuildConfigForClient(
    guildId: string,
    restoredFromAccount = false,
    hasSavedConfig = hasSavedGuildConfig(guildId),
  ) {
    const config = getGuildConfig(guildId);
    const stamp = encodeURIComponent(config.updatedAt);
    return {
      guildId: config.guildId,
      updatedAt: config.updatedAt,
      restoredFromAccount,
      hasSavedConfig,
      welcome: {
        enabled: config.welcome.enabled,
        channelId: config.welcome.channelId,
        title: config.welcome.title,
        message: config.welcome.message,
        imageUrl: config.welcome.imageFilename
          ? `/api/guilds/${guildId}/welcome-image/welcome?v=${stamp}`
          : null,
      },
      leave: {
        enabled: config.leave.enabled,
        channelId: config.leave.channelId,
        title: config.leave.title,
        message: config.leave.message,
        imageUrl: config.leave.imageFilename
          ? `/api/guilds/${guildId}/welcome-image/leave?v=${stamp}`
          : null,
      },
    };
  }

  // Verify access to a specific server panel
  app.get('/api/guilds/:guildId', async (req, res) => {
    try {
      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      res.json({
        id: authorized.guild.id,
        name: authorized.guild.name,
        iconUrl: authorized.guild.iconUrl,
        owner: authorized.guild.owner,
      });
    } catch (err) {
      console.error('[API /api/guilds/:guildId] Error:', err);
      res.status(500).json({ error: 'Erro ao validar servidor.' });
    }
  });

  // Fetch text channels for a specific guild
  app.get('/api/guilds/:guildId/channels', async (req, res) => {
    try {
      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      const channels = await fetchGuildTextChannels(authorized.guild.id);
      res.json({ channels });
    } catch (err) {
      console.error('[API /api/guilds/:guildId/channels] Error:', err);
      res.status(500).json({ error: 'Erro ao buscar canais do servidor.' });
    }
  });

  // Fetch all channels (text + voice) + cloned voices for Call Game & Security
  app.get('/api/guilds/:guildId/all-channels', async (req, res) => {
    try {
      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      const channels = await fetchGuildAllChannels(authorized.guild.id);
      const clonedVoices = getAllClonedVoices().map((v) => ({ id: v.id, name: v.name }));
      res.json({ channels, clonedVoices });
    } catch (err) {
      console.error('[API /api/guilds/:guildId/all-channels] Error:', err);
      res.status(500).json({ error: 'Erro ao buscar canais completos do servidor.' });
    }
  });

  // ── Security / Moderação Avançada (Guild-Scoped) ─────────────────────────
  app.get('/api/guilds/:guildId/moderation', async (req, res) => {
    try {
      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      const guildId = authorized.guild.id;
      const client = getBotClient();
      const guild = client?.isReady()
        ? client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => undefined))
        : undefined;

      let quarantineChannel: { exists: boolean; id: string | null; name: string | null } = {
        exists: false,
        id: null,
        name: null,
      };
      if (guild) {
        if (guild.channels.cache.size === 0) {
          await guild.channels.fetch().catch(() => null);
        }
        const qChan = guild.channels.cache.find(
          (c) =>
            c.isTextBased() &&
            (c.name.toLowerCase().includes('spam-não') ||
              c.name.toLowerCase().includes('spam-nao') ||
              c.name.toLowerCase().includes('spam?-não') ||
              c.name.toLowerCase().includes('spam?-nao')),
        );
        if (qChan) {
          quarantineChannel = { exists: true, id: qChan.id, name: qChan.name };
        }
      }

      const allLogs = getSecurityLogs();
      const guildLogs = allLogs.filter((l) => l.guildId === guildId);

      res.json({
        success: true,
        config: getModerationConfig(),
        logs: guildLogs,
        allLogs,
        testBot: getTestBotInfo(),
        quarantineChannel,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Erro ao carregar segurança.' });
    }
  });

  app.put('/api/guilds/:guildId/moderation', async (req, res) => {
    try {
      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      updateModerationConfig(req.body?.config || {});
      res.json({
        success: true,
        config: getModerationConfig(),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Erro ao salvar regras de segurança.' });
    }
  });

  app.post('/api/guilds/:guildId/moderation/lockdown', async (req, res) => {
    try {
      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      const client = getBotClient();
      const guild = client?.isReady()
        ? client.guilds.cache.get(authorized.guild.id) ??
          (await client.guilds.fetch(authorized.guild.id).catch(() => undefined))
        : undefined;
      if (!guild) {
        res.status(404).json({ error: 'Bot principal não está conectado a este servidor no Gateway.' });
        return;
      }

      const lock = Boolean(req.body?.lock);
      const result = await toggleServerLockdown(guild, lock);
      res.json({
        success: true,
        lock,
        message: lock
          ? `Lockdown de emergência ativado em ${result.channelsAffected} canais de texto!`
          : `Lockdown desativado em ${result.channelsAffected} canais de texto.`,
        ...result,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Erro ao alternar lockdown.' });
    }
  });

  app.post('/api/guilds/:guildId/moderation/quarantine-channel', async (req, res) => {
    try {
      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      const client = getBotClient();
      const guild = client?.isReady()
        ? client.guilds.cache.get(authorized.guild.id) ??
          (await client.guilds.fetch(authorized.guild.id).catch(() => undefined))
        : undefined;
      if (!guild) {
        res.status(404).json({ error: 'Bot principal não está conectado a este servidor no Gateway.' });
        return;
      }

      const channel = await getOrCreateSpamQuarantineChannel(guild);
      if (!channel) {
        res.status(500).json({ error: 'Não foi possível criar ou localizar o canal #spam-não.' });
        return;
      }

      res.json({
        success: true,
        channelId: channel.id,
        channelName: channel.name,
        message: `Canal de quarentena #${channel.name} pronto e ativo no servidor.`,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Erro ao criar canal de quarentena.' });
    }
  });

  app.post('/api/guilds/:guildId/moderation/test-bot/configure', async (req, res) => {
    try {
      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      const rawInput = String(req.body?.tokenOrId || req.body?.token || '').trim();
      const rawAppId = String(req.body?.applicationId || '').trim();

      if (!rawInput && !rawAppId) {
        res.status(400).json({ error: 'Informe o Bot Token ou Client ID do 2º Bot.' });
        return;
      }

      let hasToken = false;
      if (rawInput) {
        if (/^\d{17,22}$/.test(rawInput)) {
          savePersistedTestBotConfig({ applicationId: rawInput, botId: rawInput });
        } else {
          const extracted = extractBotIdFromToken(rawInput);
          savePersistedTestBotConfig({
            token: rawInput,
            ...(extracted ? { botId: extracted, applicationId: extracted } : {}),
          });
          hasToken = true;
        }
      }
      if (rawAppId && /^\d{17,22}$/.test(rawAppId)) {
        savePersistedTestBotConfig({ applicationId: rawAppId, botId: rawAppId });
      }

      const inspected = await inspectTestBotTokenOrId(rawInput || rawAppId).catch(() => null);
      const resolvedId =
        inspected?.id ||
        process.env.TEST_BOT_ID?.trim() ||
        extractBotIdFromToken(process.env.TEST_BOT_TOKEN) ||
        process.env.TEST_BOT_APPLICATION_ID?.trim() ||
        '';

      let unbanned = false;
      if (resolvedId && /^\d{17,22}$/.test(resolvedId)) {
        whitelistBotId(resolvedId);
        const client = getBotClient();
        const guild = client?.isReady() ? client.guilds.cache.get(authorized.guild.id) : undefined;
        if (guild) {
          const r = await unbanAndAuthorizeBot(guild, resolvedId).catch(() => ({ unbanned: false }));
          unbanned = Boolean(r.unbanned);
        }
      }

      if (hasToken || process.env.TEST_BOT_TOKEN?.trim()) {
        await initTestDiscordBot(true).catch(() => null);
      }

      const testBot = getTestBotInfo();
      res.json({
        success: true,
        unbanned,
        testBot,
        error: testBot.online ? null : getLastTestBotError(),
        message: testBot.online
          ? `2º Bot conectado (${testBot.username || testBot.id}) e liberado na lista branca.`
          : 'Configuração do 2º Bot salva e pré-autorizada.',
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message || 'Erro ao configurar 2º Bot.' });
    }
  });

  app.post('/api/guilds/:guildId/moderation/test-bot/reconnect', async (req, res) => {
    try {
      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      await initTestDiscordBot(true).catch(() => null);
      const testBot = getTestBotInfo();
      res.json({
        success: testBot.online,
        testBot,
        error: testBot.online ? null : getLastTestBotError(),
        message: testBot.online
          ? `2º Bot conectado como ${testBot.username || testBot.id}.`
          : getLastTestBotError() || 'Não foi possível conectar o 2º Bot.',
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Erro ao reconectar 2º Bot.' });
    }
  });

  app.post('/api/guilds/:guildId/moderation/test-bot/authorize', async (req, res) => {
    try {
      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      const targetId = String(
        req.body?.botId ||
          process.env.TEST_BOT_ID ||
          extractBotIdFromToken(process.env.TEST_BOT_TOKEN) ||
          process.env.TEST_BOT_APPLICATION_ID ||
          '',
      ).trim();

      if (!targetId || !/^\d{17,22}$/.test(targetId)) {
        res.status(400).json({ error: 'Informe um ID ou Token válido do 2º Bot para liberar.' });
        return;
      }

      whitelistBotId(targetId);
      process.env.TEST_BOT_ID = targetId;

      const client = getBotClient();
      const guild = client?.isReady()
        ? client.guilds.cache.get(authorized.guild.id) ??
          (await client.guilds.fetch(authorized.guild.id).catch(() => undefined))
        : undefined;

      let unbanned = false;
      if (guild) {
        const result = await unbanAndAuthorizeBot(guild, targetId, req.body?.inviterUserId).catch(
          () => ({ unbanned: false }),
        );
        unbanned = Boolean(result.unbanned);
      }

      res.json({
        success: true,
        botId: targetId,
        unbanned,
        testBot: getTestBotInfo(),
        message: unbanned
          ? `Bot ${targetId} desbanido neste servidor e adicionado à lista branca!`
          : `Bot ${targetId} liberado na lista branca! Pode convidar sem bloqueio Anti-Bot.`,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Erro ao autorizar 2º Bot.' });
    }
  });

  app.post('/api/guilds/:guildId/moderation/test-bot/run', async (req, res) => {
    try {
      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      const { channelId, testType, customText } = req.body || {};
      if (!channelId) {
        res.status(400).json({ error: 'Selecione um canal de texto para executar o teste.' });
        return;
      }

      const validTypes: SecurityTestType[] = ['spam', 'invite', 'massping', 'raid', 'all'];
      const selectedType: SecurityTestType = validTypes.includes(testType) ? testType : 'spam';
      const result = await runSecurityTest(authorized.guild.id, channelId, selectedType, customText);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Erro ao executar teste de segurança.' });
    }
  });

  // ── Jogo da Call (Guild-Scoped) ──────────────────────────────────────────
  app.get('/api/guilds/:guildId/call-game/status', async (req, res) => {
    try {
      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      res.json({ success: true, game: getCallGameStatus(authorized.guild.id) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Erro ao consultar Jogo da Call.' });
    }
  });

  app.post('/api/guilds/:guildId/call-game/start', async (req, res) => {
    try {
      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      const {
        channelId,
        voice,
        expression,
        rulesText,
        ownerUserId,
        smsChannelId,
        questions,
        questionsPerMatch,
        roundSeconds,
        autoScreenBroadcast,
      } = req.body || {};

      if (!channelId) {
        res.status(400).json({ error: 'Selecione um canal de voz para abrir o lobby.' });
        return;
      }

      const oauth = await getDiscordOAuthSessionInfo(req);
      const connectedAccount =
        oauth.connected && oauth.user
          ? {
              userId: oauth.user.id,
              username: oauth.user.globalName || oauth.user.username,
              avatar: oauth.user.avatarUrl,
            }
          : null;

      const game = await startCallGame({
        guildId: authorized.guild.id,
        voiceChannelId: channelId,
        voice,
        expression,
        rulesText,
        ownerUserId,
        smsChannelId,
        questions: Array.isArray(questions) ? questions : undefined,
        questionsPerMatch:
          typeof questionsPerMatch === 'number'
            ? questionsPerMatch
            : Number(questionsPerMatch) || undefined,
        roundSeconds:
          typeof roundSeconds === 'number' ? roundSeconds : Number(roundSeconds) || undefined,
        connectedAccount,
        autoScreenBroadcast: autoScreenBroadcast !== false,
      });

      res.json({ success: true, game });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Erro ao iniciar Jogo da Call.' });
    }
  });

  app.post('/api/guilds/:guildId/call-game/begin-match', async (req, res) => {
    try {
      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      const game = await beginCallGameMatch(authorized.guild.id);
      res.json({ success: true, game });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Erro ao iniciar partida.' });
    }
  });

  app.post('/api/guilds/:guildId/call-game/stop', async (req, res) => {
    try {
      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      const { deleteChannel, disconnectCall } = req.body || {};
      const game = await stopCallGame(
        authorized.guild.id,
        deleteChannel !== false,
        Boolean(disconnectCall),
      );
      res.json({ success: true, game });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Erro ao encerrar Jogo da Call.' });
    }
  });

  app.post('/api/guilds/:guildId/broadcast/server-status', async (req, res) => {
    try {
      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      const state = await getServerScreenStatus(Boolean(req.body?.refresh));
      res.json({ success: true, state });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'Erro ao consultar transmissão.' });
    }
  });

  app.post('/api/auth/discord/custom-link-panel', (req, res) => {
    try {
      const rawLink = typeof req.body?.link === 'string' ? req.body.link : '';
      const result = setOwnerProvidedDiscordLink(rawLink);
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // Get welcome/leave banner configuration
  app.get('/api/guilds/:guildId/welcome-config', async (req, res) => {
    try {
      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      const guildId = authorized.guild.id;
      let restoredFromAccount = false;

      if (!hasSavedGuildConfig(guildId)) {
        const channels = await fetchGuildTextChannels(guildId).catch(() => []);
        const restored = restorePresetForUnconfiguredGuild(
          authorized.session.user.id,
          guildId,
          channels,
        );
        restoredFromAccount = Boolean(restored);
      } else {
        syncGuildConfigToAccount(authorized.session.user.id, getGuildConfig(guildId));
      }

      res.json(
        serializeGuildConfigForClient(
          guildId,
          restoredFromAccount,
          hasSavedGuildConfig(guildId),
        ),
      );
    } catch (err) {
      console.error('[API GET welcome-config] Error:', err);
      res.status(500).json({ error: 'Erro ao carregar configurações do servidor.' });
    }
  });

  // Serve uploaded background image for welcome or leave
  app.get('/api/guilds/:guildId/welcome-image/:eventType', async (req, res) => {
    try {
      const eventType = req.params.eventType;
      if (eventType !== 'welcome' && eventType !== 'leave') {
        res.status(400).json({ error: 'Tipo de evento inválido.' });
        return;
      }

      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      const config = getGuildConfig(authorized.guild.id);
      const filename = eventType === 'welcome' ? config.welcome.imageFilename : config.leave.imageFilename;
      if (!filename) {
        res.status(404).json({ error: 'Nenhuma imagem configurada.' });
        return;
      }

      const filePath = getUploadFilePath(filename);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Arquivo de imagem não encontrado.' });
        return;
      }

      res.setHeader('Cache-Control', 'private, max-age=300');
      res.sendFile(filePath);
    } catch (err) {
      console.error('[API GET welcome-image] Error:', err);
      res.status(500).json({ error: 'Erro ao carregar imagem.' });
    }
  });

  // Save welcome/leave configuration + optional background image upload
  app.put('/api/guilds/:guildId/welcome-config', async (req, res) => {
    try {
      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      const guildId = authorized.guild.id;
      const current = getGuildConfig(guildId);
      const body = (req.body || {}) as Record<string, unknown>;
      let liveChannels: Array<{ id: string; name: string }> | null = null;

      async function resolveChannelIdWithFallback(
        eventType: BannerEventType,
        rawId: unknown,
        rawName: unknown,
        fallbackId: string | null,
      ): Promise<string | null> {
        if (rawId === null) return null;
        const candidateId =
          typeof rawId === 'string' && /^\d{17,22}$/.test(rawId.trim()) ? rawId.trim() : null;
        const channelNameHint = typeof rawName === 'string' ? rawName.trim() : '';

        if (!liveChannels && (candidateId || channelNameHint)) {
          liveChannels = await fetchGuildTextChannels(guildId).catch(() => null);
        }

        if (candidateId) {
          if (!liveChannels || liveChannels.some((ch) => ch.id === candidateId)) {
            return candidateId;
          }
        }

        if (liveChannels && liveChannels.length > 0) {
          const norm = (s: string) =>
            s
              .normalize('NFKD')
              .replace(/[\u0300-\u036f]/g, '')
              .toLowerCase();

          if (channelNameHint) {
            const targetNorm = norm(channelNameHint);
            const exact = liveChannels.find((ch) => norm(ch.name) === targetNorm);
            if (exact) return exact.id;
          }

          const keywordMatch = liveChannels.find((ch) => {
            const n = norm(ch.name);
            return eventType === 'welcome'
              ? n.includes('entrada') || n.includes('boas-vindas') || n.includes('welcome')
              : n.includes('saida') || n.includes('despedida') || n.includes('leave');
          });
          if (keywordMatch) return keywordMatch.id;
        }

        return candidateId ?? fallbackId;
      }

      async function applyRuleUpdate(
        eventType: BannerEventType,
        existing: BannerRuleConfig,
        incomingRaw: unknown,
      ): Promise<BannerRuleConfig> {
        if (!incomingRaw || typeof incomingRaw !== 'object') {
          return existing;
        }
        const incoming = incomingRaw as Record<string, unknown>;
        const resolvedChannelId = await resolveChannelIdWithFallback(
          eventType,
          incoming.channelId,
          incoming.channelName,
          existing.channelId,
        );

        const next: BannerRuleConfig = {
          enabled: typeof incoming.enabled === 'boolean' ? incoming.enabled : existing.enabled,
          channelId: resolvedChannelId,
          title:
            typeof incoming.title === 'string'
              ? incoming.title.trim().slice(0, 40)
              : existing.title,
          message:
            typeof incoming.message === 'string'
              ? incoming.message.trim().slice(0, 220)
              : existing.message,
          imageFilename: existing.imageFilename,
        };

        if (incoming.removeImage === true) {
          deleteUploadedImage(existing.imageFilename);
          next.imageFilename = null;
        } else if (typeof incoming.imageDataUrl === 'string' && incoming.imageDataUrl.trim()) {
          const match = incoming.imageDataUrl.match(
            /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/is,
          );
          if (!match) {
            throw new Error('Formato de imagem inválido. Utilize PNG, JPG ou WEBP.');
          }
          const cleanedBase64 = match[2].replace(/\s+/g, '');
          const buffer = Buffer.from(cleanedBase64, 'base64');
          if (buffer.length > 5 * 1024 * 1024) {
            throw new Error('A imagem selecionada excede o limite de 5 MB.');
          }

          const meta = await sharp(buffer).metadata().catch(() => null);
          if (!meta || !meta.format || !['png', 'jpeg', 'webp'].includes(meta.format)) {
            throw new Error('Arquivo de imagem corrompido ou formato não suportado.');
          }

          const ext: 'png' | 'jpg' | 'webp' =
            meta.format === 'jpeg' ? 'jpg' : (meta.format as 'png' | 'webp');
          next.imageFilename = saveUploadedImage(
            guildId,
            eventType,
            buffer,
            ext,
            existing.imageFilename,
          );
        }

        return next;
      }

      const nextWelcome = await applyRuleUpdate('welcome', current.welcome, body.welcome);
      const nextLeave = await applyRuleUpdate('leave', current.leave, body.leave);

      const saved = saveGuildConfig({
        guildId,
        welcome: nextWelcome,
        leave: nextLeave,
        updatedAt: new Date().toISOString(),
      });

      // Persist changes under the authenticated Discord user's account as well
      syncGuildConfigToAccount(authorized.session.user.id, saved);

      res.json(serializeGuildConfigForClient(guildId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar configurações.';
      res.status(400).json({ error: msg });
    }
  });

  // Send a real test dynamic image to the selected Discord channel
  app.post('/api/guilds/:guildId/welcome-config/test', async (req, res) => {
    try {
      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      const body = (req.body || {}) as {
        eventType?: string;
        channelId?: string;
        title?: string;
        message?: string;
        memberName?: string;
      };

      const eventType: BannerEventType = body.eventType === 'leave' ? 'leave' : 'welcome';
      const channelId = typeof body.channelId === 'string' ? body.channelId.trim() : '';

      if (!/^\d{17,22}$/.test(channelId)) {
        res.status(400).json({ error: 'Selecione um canal de texto válido antes de testar.' });
        return;
      }

      const saved = getGuildConfig(authorized.guild.id);
      const savedRule = eventType === 'welcome' ? saved.welcome : saved.leave;

      const title =
        typeof body.title === 'string' && body.title.trim()
          ? body.title.trim().slice(0, 40)
          : savedRule.title;
      const message =
        typeof body.message === 'string'
          ? body.message.trim().slice(0, 220)
          : savedRule.message;
      const fallbackBotId = getBotStatus().botId || '1';
      const memberDisplayName =
        typeof body.memberName === 'string' && body.memberName.trim()
          ? body.memberName.trim().slice(0, 32)
          : authorized.isSyntheticSession
            ? 'Membro Teste'
            : authorized.session.user.globalName ?? authorized.session.user.username;

      const result = await sendTestWelcomeBanner({
        guildId: authorized.guild.id,
        eventType,
        channelId,
        title,
        message,
        memberUserId: authorized.isSyntheticSession ? fallbackBotId : authorized.session.user.id,
        memberDisplayName,
        memberUsername: authorized.isSyntheticSession ? 'membro' : authorized.session.user.username,
        avatarUrl: authorized.session.user.avatarUrl,
        imageFilename: savedRule.imageFilename,
      });

      if (!result.ok) {
        res.status(400).json({ error: result.error || 'Falha ao enviar teste.' });
        return;
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('[API POST welcome-config/test] Error:', err);
      res.status(500).json({ error: 'Erro ao enviar imagem de demonstração no canal.' });
    }
  });

  // ==========================================
  // TikTok Connection & Publishing Routes (Powered by Zernio API)
  // ==========================================

  app.get('/api/tiktok/status', async (req, res) => {
    const auth = getSessionFromRequest(req);
    const configured = isTikTokConfigured();
    const ownerId = resolveTikTokOwnerId(req, auth);

    const accounts = await syncZernioAccountsForUser(ownerId);
    const publicAccounts = accounts.map(toPublicTikTokInfo).filter(Boolean);
    const active = accounts.find((a) => a.isDefault) || accounts[0] || null;

    res.json({
      configured,
      connected: publicAccounts.length > 0,
      provider: 'zernio',
      account: toPublicTikTokInfo(active),
      accounts: publicAccounts,
      activeAccountId: active ? (active.id || active.zernioAccountId) : null,
    });
  });

  app.get('/api/tiktok/accounts', async (req, res) => {
    const auth = getSessionFromRequest(req);
    const ownerId = resolveTikTokOwnerId(req, auth);
    const accounts = await syncZernioAccountsForUser(ownerId);
    const publicAccounts = accounts.map(toPublicTikTokInfo).filter(Boolean);
    const active = accounts.find((a) => a.isDefault) || accounts[0] || null;
    res.json({
      accounts: publicAccounts,
      activeAccountId: active ? (active.id || active.zernioAccountId) : null,
    });
  });

  app.post('/api/tiktok/accounts/connect', async (req, res) => {
    const auth = getSessionFromRequest(req);
    const ownerId = getPanelOwnerId(req, auth);

    const rawOrigin = typeof req.body?.origin === 'string' ? req.body.origin.trim() : '';
    const origin = resolvePublicOrigin(req, rawOrigin);

    const callbackBaseUrl = `${origin}/api/tiktok/oauth/callback`;
    const result = await startZernioTikTokConnect(ownerId, callbackBaseUrl);
    if (!result.ok || !result.authUrl) {
      res.status(isTikTokConfigured() ? 400 : 503).json({
        ok: false,
        error: result.error || 'Não foi possível gerar o link de autorização OAuth do Zernio.',
      });
      return;
    }

    res.json({ ok: true, url: result.authUrl, state: result.state });
  });

  app.get('/api/tiktok/oauth/poll', (req, res) => {
    const state = typeof req.query.state === 'string' ? req.query.state.trim() : '';
    if (!state) {
      res.status(400).json({ completed: false });
      return;
    }
    const polled = pollZernioOAuthState(state);
    res.json({
      completed: polled.completed,
      status: polled.status,
      account: polled.account ? toPublicTikTokInfo(polled.account) : null,
      error: polled.error ?? null,
    });
  });

  app.get('/api/tiktok/oauth/callback', async (req, res) => {
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const accountId =
      typeof req.query.accountId === 'string'
        ? req.query.accountId
        : typeof req.query.account_id === 'string'
          ? req.query.account_id
          : undefined;
    const username = typeof req.query.username === 'string' ? req.query.username : undefined;
    const error = typeof req.query.error === 'string' ? req.query.error : undefined;
    const errorDescription =
      typeof req.query.error_description === 'string'
        ? req.query.error_description
        : typeof req.query.message === 'string'
          ? req.query.message
          : undefined;

    const result = await completeZernioOAuthCallback({
      state,
      accountId,
      username,
      error,
      errorDescription,
    });

    const payloadJson = JSON.stringify({
      type: 'ZERNIO_TIKTOK_AUTH_DONE',
      ok: result.ok,
      username: result.account?.username || null,
      error: result.error || null,
    });

    const safeHtml = (val: string) =>
      val
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const redirectTarget = result.ok
      ? `/?view=tiktok&tiktok_oauth=success${result.account?.username ? `&username=${encodeURIComponent(result.account.username)}` : ''}`
      : `/?view=tiktok&tiktok_oauth=error&error=${encodeURIComponent(result.error || 'Falha na autorização TikTok')}`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Conexão TikTok · Zernio OAuth</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #FAFAFA; color: #0f172a; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; }
    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px 28px; max-width: 420px; width: 100%; text-align: center; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    p { font-size: 14px; color: #475569; margin: 0 0 18px; line-height: 1.5; }
    a { display: inline-block; padding: 10px 16px; border-radius: 8px; background: #0f172a; color: #fff; text-decoration: none; font-size: 13px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${result.ok ? 'TikTok conectado com sucesso!' : 'Não foi possível conectar o TikTok'}</h1>
    <p>${result.ok ? `Conta @${safeHtml(result.account?.username || 'tiktok')} autorizada via Zernio OAuth.` : safeHtml(result.error || 'Erro desconhecido.')}</p>
    <a href="${safeHtml(redirectTarget)}">Voltar ao painel</a>
  </div>
  <script>
    (function () {
      var msg = ${payloadJson};
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(msg, '*');
          setTimeout(function () { window.close(); }, 600);
          return;
        }
      } catch (e) {}
      setTimeout(function () {
        window.location.replace(${JSON.stringify(redirectTarget)});
      }, 900);
    })();
  </script>
</body>
</html>`);
  });

  app.post('/api/tiktok/accounts/:id/select', (req, res) => {
    const auth = getSessionFromRequest(req);
    const ownerId = resolveTikTokOwnerId(req, auth, req.params.id);
    const ok = setDefaultZernioAccount(req.params.id, ownerId);
    if (!ok) {
      res.status(404).json({ ok: false, error: 'Conta não encontrada ou sem permissão.' });
      return;
    }
    res.json({ ok: true });
  });

  app.delete('/api/tiktok/accounts/:id', async (req, res) => {
    const auth = getSessionFromRequest(req);
    const ownerId = resolveTikTokOwnerId(req, auth, req.params.id);
    const result = await disconnectZernioAccount(req.params.id, ownerId);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  app.post('/api/tiktok/accounts/:id/verify', async (req, res) => {
    const auth = getSessionFromRequest(req);
    const ownerId = resolveTikTokOwnerId(req, auth, req.params.id);
    const result = await verifyTikTokAccountHealth(req.params.id, ownerId);
    res.json(result);
  });

  app.post('/api/tiktok/test-publish', async (req, res) => {
    const auth = getSessionFromRequest(req);
    const accountId = typeof req.body?.accountId === 'string' ? req.body.accountId : undefined;
    const ownerId = resolveTikTokOwnerId(req, auth, accountId);
    const result = await publishTestPostToTikTok(ownerId, accountId);
    res.status(result.outcome === 'published' ? 200 : 400).json(result);
  });

  app.post('/api/tiktok/disconnect', async (req, res) => {
    const auth = getSessionFromRequest(req);
    const ownerId = resolveTikTokOwnerId(req, auth);

    const accounts = getTikTokAccounts(ownerId);
    for (const acc of accounts) {
      await disconnectZernioAccount(acc.id, ownerId);
    }
    res.json({ ok: true });
  });

  // Zernio EXP Publishing Status Consultation & History
  app.get('/api/tiktok/posts', (req, res) => {
    const auth = getSessionFromRequest(req);
    const ownerId = resolveTikTokOwnerId(req, auth);
    res.json({ posts: getZernioPostHistory(ownerId) });
  });

  app.get('/api/tiktok/posts/:postId/status', async (req, res) => {
    const auth = getSessionFromRequest(req);
    const ownerId = resolveTikTokOwnerId(req, auth);

    const result = await refreshZernioPostStatus(req.params.postId, ownerId);
    if (!result.ok || !result.post) {
      res.status(400).json(result);
      return;
    }

    if (result.post.expId) {
      const expRec = getExpRecord(result.post.expId);
      if (expRec) {
        updateExpRecord(expRec.id, {
          status:
            result.post.status === 'published'
              ? 'published_tiktok'
              : result.post.status === 'failed'
                ? 'tiktok_error'
                : result.post.status === 'draft'
                  ? 'tiktok_inbox'
                  : expRec.status,
          tiktokPostUrl: result.post.platformPostUrl ?? expRec.tiktokPostUrl ?? null,
          tiktokError: result.post.error ?? null,
        });
      }
    }

    res.json(result);
  });

  app.post('/api/tiktok/posts/:postId/retry', async (req, res) => {
    const auth = getSessionFromRequest(req);
    const ownerId = resolveTikTokOwnerId(req, auth);

    const result = await retryZernioPost(req.params.postId, ownerId);
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }

    if (result.post?.expId) {
      const expRec = getExpRecord(result.post.expId);
      if (expRec) {
        updateExpRecord(expRec.id, {
          status:
            result.post.status === 'published'
              ? 'published_tiktok'
              : result.post.status === 'failed'
                ? 'tiktok_error'
                : expRec.status,
          tiktokPostUrl: result.post.platformPostUrl ?? expRec.tiktokPostUrl ?? null,
          tiktokError: result.post.error ?? null,
        });
      }
    }

    res.json(result);
  });

  // ==========================================
  // EXP System API & Media Hosting Routes
  // ==========================================

  // Public token-verified media route required for TikTok Content Posting API (PULL_FROM_URL)
  app.get('/api/exp/public-media/:expId/:mediaToken/:filename', (req, res) => {
    const { expId, mediaToken, filename } = req.params;
    const record = getExpRecord(expId);
    if (!record || !record.mediaToken) {
      res.status(404).end();
      return;
    }

    const expectedBuf = Buffer.from(record.mediaToken);
    const providedBuf = Buffer.from(mediaToken || '');
    if (
      expectedBuf.length !== providedBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, providedBuf)
    ) {
      res.status(403).end();
      return;
    }

    const filePath = getExpMediaFilePath(expId, filename);
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).end();
      return;
    }

    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(filePath);
  });

  // Authenticated or panel-authorized media route for web preview player / carousel viewer
  app.get('/api/exp/media/:expId/:filename', async (req, res) => {
    const record = getExpRecord(req.params.expId);
    if (!record) {
      res.status(404).json({ error: 'Registro EXP não encontrado.' });
      return;
    }

    if (record.guildId !== 'web-studio') {
      const authorized = await authorizeGuildAdmin(req, res, record.guildId);
      if (!authorized) return;
    }

    const filePath = getExpMediaFilePath(record.id, req.params.filename);
    if (!filePath || !fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Mídia não encontrada.' });
      return;
    }

    res.sendFile(filePath);
  });

  app.get('/api/exp/records', async (req, res) => {
    const auth = getSessionFromRequest(req);
    const botGuildIds = await fetchBotGuildIds();
    const allowedGuildIds = new Set<string>(botGuildIds);

    if (auth) {
      const activeSession = await refreshAccessTokenIfNeeded(auth.sessionId, auth.session, res);
      if (activeSession) {
        const guildsResult = await fetchUserGuildsCached(auth.sessionId, activeSession, false);
        for (const g of guildsResult.guilds ?? []) {
          if (hasAdminPermission(g)) allowedGuildIds.add(g.id);
        }
      }
    }

    const filterGuildId =
      typeof req.query.guildId === 'string' && req.query.guildId.trim()
        ? req.query.guildId.trim()
        : null;

    if (filterGuildId && filterGuildId !== 'web-studio' && !allowedGuildIds.has(filterGuildId)) {
      res.status(403).json({ error: 'Sem permissão administrativa neste servidor.' });
      return;
    }

    const records = listExpRecords(filterGuildId || undefined)
      .filter(
        (r) => r.guildId === 'web-studio' || allowedGuildIds.has(r.guildId),
      )
      .map((r) => ({
        id: r.id,
        guildId: r.guildId,
        guildName: r.guildName,
        requesterId: r.requesterId,
        requesterTag: r.requesterTag,
        involvedName: r.involvedName,
        description: r.description,
        whatHappened: r.whatHappened,
        whyWrong: r.whyWrong,
        additionalInsults: r.additionalInsults ?? '',
        title: r.title ?? r.description,
        information: r.information ?? r.whatHappened,
        additionalText: r.additionalText ?? r.whyWrong,
        insultText: r.insultText ?? r.additionalInsults ?? '',
        closingText: r.closingText ?? '',
        watermarkText: r.watermarkText ?? '',
        audioTrack: r.audioTrack ?? null,
        carouselPublishMode: r.carouselPublishMode ?? 'video_slideshow',
        mediaLinks: r.mediaLinks,
        otherLinks: r.otherLinks,
        format: r.format,
        status: r.status,
        expNumber: r.expNumber,
        expCode: r.expCode,
        caption: r.caption,
        generatedFiles: r.generatedFiles,
        handledByTag: r.handledByTag,
        handledAt: r.handledAt,
        tiktokPublishId: r.tiktokPublishId,
        tiktokPublishMode: r.tiktokPublishMode,
        tiktokStatusText: r.tiktokStatusText,
        tiktokError: r.tiktokError,
        tiktokPostUrl: r.tiktokPostUrl ?? null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));

    res.json({
      records,
      nextExpNumber: getNextPreviewExpNumber(),
      nextExpCode: formatExpCode(getNextPreviewExpNumber()),
    });
  });

  app.post('/api/exp/restore', (req, res) => {
    const auth = getSessionFromRequest(req);
    const panelOwnerId = getPanelOwnerId(req, auth);
    const requesterTag = auth?.session.user.username || 'Painel 573';

    const body = (req.body || {}) as {
      records?: Array<Partial<ExpRecord>>;
      maxExpNumber?: number;
    };

    if (typeof body.maxExpNumber === 'number') {
      syncUsedExpNumbersFloor(body.maxExpNumber);
    }

    if (Array.isArray(body.records)) {
      for (const r of body.records) {
        if (!r?.id || !r?.guildId || !r?.description) continue;
        upsertRestoredExpRecord({
          id: r.id,
          guildId: r.guildId,
          guildName: r.guildName || 'Servidor Discord',
          requesterId: r.requesterId || panelOwnerId,
          requesterTag: r.requesterTag || requesterTag,
          involvedName: r.involvedName || '',
          description: r.description,
          whatHappened: r.whatHappened || '',
          whyWrong: r.whyWrong || '',
          title: r.title,
          information: r.information,
          additionalText: r.additionalText,
          insultText: r.insultText,
          closingText: r.closingText,
          watermarkText: r.watermarkText,
          audioTrack: r.audioTrack,
          carouselPublishMode: r.carouselPublishMode,
          mediaLinks: Array.isArray(r.mediaLinks) ? r.mediaLinks : [],
          otherLinks: Array.isArray(r.otherLinks) ? r.otherLinks : [],
          format: r.format === 'video' ? 'video' : 'carousel',
          status: r.status || 'pending',
          expNumber: typeof r.expNumber === 'number' ? r.expNumber : null,
          expCode: r.expCode ?? null,
          caption: r.caption ?? null,
          mediaToken: crypto.randomBytes(16).toString('hex'),
          generatedFiles: [],
          handledById: r.handledById ?? null,
          handledByTag: r.handledByTag ?? null,
          handledAt: r.handledAt ?? null,
          tiktokPublishId: r.tiktokPublishId ?? null,
          tiktokPublishMode: r.tiktokPublishMode ?? null,
          tiktokStatusText: r.tiktokStatusText ?? null,
          tiktokError: r.tiktokError ?? null,
          createdAt: r.createdAt || new Date().toISOString(),
          updatedAt: r.updatedAt || new Date().toISOString(),
        });
      }
    }

    res.json({ ok: true, nextExpNumber: getNextPreviewExpNumber() });
  });

  async function decodeStudioMedia(mediaItemsBase64: unknown): Promise<Buffer[]> {
    if (!Array.isArray(mediaItemsBase64)) return [];
    const out: Buffer[] = [];
    for (const item of mediaItemsBase64.slice(0, 3)) {
      if (typeof item !== 'string' || !item.trim()) continue;
      const isVideo = item.startsWith('data:video/');
      const cleaned = item.replace(/^data:(image|video)\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
      if (!cleaned) continue;
      try {
        const rawBuf = Buffer.from(cleaned, 'base64');
        if (rawBuf.byteLength > 100 && rawBuf.byteLength <= 35 * 1024 * 1024) {
          if (isVideo) {
            const frame = await extractFrameFromVideoBuffer(rawBuf).catch(() => null);
            if (frame) out.push(frame);
          } else {
            out.push(rawBuf);
          }
        }
      } catch {
        // Ignore malformed media
      }
    }
    return out;
  }

  // AI demonic content generator powered by Groq (Llama 3.3 70B) with Gemini fallback
  app.post('/api/exp/ai/generate', async (req, res) => {
    try {
      const body = (req.body || {}) as {
        involvedName?: string;
        promptTopic?: string;
        currentTitle?: string;
        currentInfo?: string;
        currentAdditional?: string;
        currentInsult?: string;
        generateImages?: boolean;
        expCode?: string;
      };

      const result = await generateDemonicExpContent({
        involvedName: body.involvedName,
        promptTopic: body.promptTopic,
        currentTitle: body.currentTitle,
        currentInfo: body.currentInfo,
        currentAdditional: body.currentAdditional,
        currentInsult: body.currentInsult,
        generateImages: body.generateImages !== false,
        expCode: body.expCode || formatExpCode(getNextPreviewExpNumber()),
      });

      res.json({ ok: true, result });
    } catch (err) {
      console.error('[API /api/exp/ai/generate] Error:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Falha ao gerar conteúdo demoníaco com IA.',
      });
    }
  });

  // Extract a high-res poster frame from an uploaded video file (MP4/WebM)
  app.post('/api/exp/media/extract-frame', async (req, res) => {
    try {
      const { videoBase64 } = (req.body || {}) as { videoBase64?: string };
      if (!videoBase64 || typeof videoBase64 !== 'string') {
        res.status(400).json({ error: 'Vídeo não informado.' });
        return;
      }

      const cleaned = videoBase64.replace(/^data:video\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
      const videoBuf = Buffer.from(cleaned, 'base64');
      const frameBuf = await extractFrameFromVideoBuffer(videoBuf);
      const frameOut = await sharp(frameBuf)
        .resize(1080, 1350, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 92 })
        .toBuffer();

      res.json({
        ok: true,
        dataUrl: `data:image/jpeg;base64,${frameOut.toString('base64')}`,
      });
    } catch (err) {
      console.error('[API /api/exp/media/extract-frame] Error:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Falha ao extrair quadro do vídeo.',
      });
    }
  });

  // Apply demonic styling filter (crimson vignette, contrast, runic border) to an uploaded image
  app.post('/api/exp/media/demonic-filter', async (req, res) => {
    try {
      const { imageBase64 } = (req.body || {}) as { imageBase64?: string };
      if (!imageBase64 || typeof imageBase64 !== 'string') {
        res.status(400).json({ error: 'Imagem não informada.' });
        return;
      }

      const cleaned = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
      const imgBuf = Buffer.from(cleaned, 'base64');
      const filteredBuf = await applyDemonicFilterToImage(imgBuf);

      res.json({
        ok: true,
        dataUrl: `data:image/jpeg;base64,${filteredBuf.toString('base64')}`,
      });
    } catch (err) {
      console.error('[API /api/exp/media/demonic-filter] Error:', err);
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Falha ao aplicar filtro demoníaco.',
      });
    }
  });

  // Russian music catalog for EXP Carousels
  app.get('/api/exp/music/russian', async (req, res) => {
    try {
      const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
      const tracks = await listRussianMusicTracks(14, refresh);
      res.json({ tracks });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Não foi possível carregar as músicas russas.',
      });
    }
  });

  // 100% Web Studio: Preview callout poster + optional Russian track
  app.post('/api/exp/studio/preview', async (req, res) => {
    try {
      const body = (req.body || {}) as {
        targetName?: string;
        explanation?: string;
        title?: string;
        information?: string;
        imagesBase64?: unknown;
        additionalText?: string;
        insultText?: string;
        closingText?: string;
        watermarkText?: string;
        theme?: 'demonic' | 'gallery';
        audioMode?: 'auto' | 'custom';
        selectedAudioTrack?: ExpAudioTrackMeta | null;
      };

      const title = (body.targetName || body.title || '').trim();
      const information = (body.explanation || body.information || '').trim();
      if (title.length < 1) {
        res.status(400).json({ error: 'Informe o nome (ex.: VAMP) antes de gerar a prévia.' });
        return;
      }
      if (information.length < 3) {
        res.status(400).json({ error: 'Explique o que ela fez / faz (mínimo 3 caracteres).' });
        return;
      }

      const privacy = validateExpNoPrivateData({
        title,
        information,
        additionalText: body.additionalText,
        insultText: body.insultText,
        closingText: body.closingText,
        watermarkText: body.watermarkText,
      });
      if (!privacy.ok) {
        res.status(400).json({ error: privacy.reason });
        return;
      }

      const imageBuffers = await decodeStudioMedia(body.imagesBase64);
      const nextExpNumber = getNextPreviewExpNumber();
      const theme = body.theme || 'gallery';
      const watermarkText = (body.watermarkText || '@5573exp').trim();
      const { slideBuffers, slideLabels } = await generateStudioCarouselSlides({
        expNumber: nextExpNumber,
        title,
        information,
        imageBuffers,
        additionalText: (body.additionalText || '').trim(),
        insultText: (body.insultText || '').trim(),
        closingText: (body.closingText || '').trim(),
        watermarkText,
        theme,
      });

      let suggestedAudioTrack: ExpAudioTrackMeta | null =
        body.audioMode === 'custom' && body.selectedAudioTrack?.previewUrl
          ? body.selectedAudioTrack
          : null;

      if (!suggestedAudioTrack) {
        const catalog = await listRussianMusicTracks(12, false).catch(() => []);
        if (catalog.length > 0) {
          const picked = catalog[crypto.randomInt(0, catalog.length)];
          suggestedAudioTrack = {
            id: picked.id,
            artist: picked.artist,
            title: picked.title,
            previewUrl: picked.previewUrl,
          };
        }
      }

      res.json({
        slides: slideBuffers.map((buf, idx) => ({
          index: idx + 1,
          label: slideLabels[idx] || `Slide ${idx + 1}`,
          dataUrl: `data:image/jpeg;base64,${buf.toString('base64')}`,
        })),
        nextExpNumber,
        nextExpCode: formatExpCode(nextExpNumber),
        suggestedAudioTrack,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao gerar prévia do cartaz.',
      });
    }
  });

  // 100% Web Studio: Create EXP poster + video/photo & optionally publish
  app.post('/api/exp/studio/create', async (req, res) => {
    const auth = getSessionFromRequest(req);
    const panelOwnerId = getPanelOwnerId(req, auth);
    const actorTag = auth?.session.user.globalName || auth?.session.user.username || 'Painel 573';

    try {
      const body = (req.body || {}) as {
        guildId?: string;
        targetName?: string;
        explanation?: string;
        title?: string;
        information?: string;
        imagesBase64?: unknown;
        additionalText?: string;
        insultText?: string;
        closingText?: string;
        watermarkText?: string;
        theme?: 'demonic' | 'gallery';
        audioMode?: 'auto' | 'custom';
        selectedAudioTrack?: ExpAudioTrackMeta | null;
        carouselMode?: CarouselPublishMode;
        publishNow?: boolean;
        draftOnly?: boolean;
        accountId?: string;
        caption?: string;
        hashtags?: string[] | string;
      };

      const title = (body.targetName || body.title || '').trim();
      const information = (body.explanation || body.information || '').trim();
      if (title.length < 1) {
        res.status(400).json({ error: 'Informe o nome (ex.: VAMP) para criar o cartaz.' });
        return;
      }
      if (information.length < 3) {
        res.status(400).json({ error: 'Explique o que ela fez / faz (mínimo 3 caracteres).' });
        return;
      }

      const privacy = validateExpNoPrivateData({
        title,
        information,
        additionalText: body.additionalText,
        insultText: body.insultText,
        closingText: body.closingText,
        watermarkText: body.watermarkText,
      });
      if (!privacy.ok) {
        res.status(400).json({ error: privacy.reason });
        return;
      }

      let resolvedGuildId = 'web-studio';
      let resolvedGuildName = 'Estúdio Web 573';

      if (body.guildId && body.guildId !== 'web-studio') {
        const authorized = await authorizeGuildAdmin(req, res, body.guildId);
        if (!authorized) return;
        resolvedGuildId = authorized.guild.id;
        resolvedGuildName = authorized.guild.name;
      }

      const imageBuffers = await decodeStudioMedia(body.imagesBase64);
      const additionalText = (body.additionalText || '').trim();
      const insultText = (body.insultText || '').trim();
      const closingText = (body.closingText || '').trim();
      const theme = body.theme || 'gallery';
      const watermarkText = (body.watermarkText || '@5573exp').trim();
      const carouselPublishMode: CarouselPublishMode =
        body.carouselMode === 'photo_carousel' ? 'photo_carousel' : 'video_slideshow';

      const initialRecord = createExpRecord({
        guildId: resolvedGuildId,
        guildName: resolvedGuildName,
        requesterId: panelOwnerId,
        requesterTag: actorTag,
        involvedName: title,
        description: `A PUTA DE HOJE É: ${title}`,
        whatHappened: information,
        whyWrong: additionalText,
        additionalInsults: insultText,
        title,
        information,
        additionalText,
        insultText,
        closingText,
        watermarkText,
        audioTrack: null,
        carouselPublishMode,
        mediaLinks: [],
        otherLinks: [],
        personPhotoFile: null,
        proofFiles: [],
        format: 'carousel',
        status: 'accepted',
        expNumber: null,
        expCode: null,
        caption: null,
        generatedFiles: [],
        handledById: panelOwnerId,
        handledByTag: actorTag,
        handledAt: new Date().toISOString(),
        tiktokPublishId: null,
        tiktokPublishMode: null,
        tiktokStatusText: null,
        tiktokError: null,
      });

      const allocation = allocateUniqueExpNumber(initialRecord.id);
      const mediaDir = getExpMediaDir(initialRecord.id);

      const savedSourceProofs: string[] = [];
      for (let i = 0; i < imageBuffers.length; i++) {
        const srcName = `source-studio-${i + 1}.jpg`;
        const srcOut = await sharp(imageBuffers[i]).jpeg({ quality: 92 }).toBuffer();
        fs.writeFileSync(path.resolve(mediaDir, srcName), srcOut);
        savedSourceProofs.push(srcName);
      }

      const { slideBuffers } = await generateStudioCarouselSlides({
        expNumber: allocation.expNumber,
        title,
        information,
        imageBuffers,
        additionalText,
        insultText,
        closingText,
        watermarkText,
        theme,
      });

      const generatedFiles: string[] = [];
      for (let i = 0; i < slideBuffers.length; i++) {
        const fname = `slide-${i + 1}.jpg`;
        fs.writeFileSync(path.resolve(mediaDir, fname), slideBuffers[i]);
        generatedFiles.push(fname);
      }

      const selectedTrack = await selectRussianTrackForPost(
        body.audioMode === 'custom' && body.selectedAudioTrack ? body.selectedAudioTrack : null,
      ).catch(() => null);

      const trackMeta: ExpAudioTrackMeta | null = selectedTrack
        ? {
            id: selectedTrack.id,
            artist: selectedTrack.artist,
            title: selectedTrack.title,
            previewUrl: selectedTrack.previewUrl,
          }
        : body.selectedAudioTrack?.artist
          ? body.selectedAudioTrack
          : null;

      try {
        await generateCarouselSlideshowVideo(
          initialRecord.id,
          generatedFiles,
          selectedTrack?.localPath ?? null,
        );
        generatedFiles.push('exp-carousel.mp4');
      } catch (ffmpegErr) {
        console.error('[Studio] Falha ao compilar MP4 do carrossel:', ffmpegErr);
      }

      let finalRecord =
        updateExpRecord(initialRecord.id, {
          status: 'accepted',
          expNumber: allocation.expNumber,
          expCode: allocation.expCode,
          caption: allocation.caption,
          proofFiles: savedSourceProofs,
          generatedFiles,
          audioTrack: trackMeta,
          carouselPublishMode,
        }) ?? initialRecord;

      let tiktokOutcome: Awaited<ReturnType<typeof publishExpToTikTok>> | null = null;
      if (body.publishNow) {
        const tikTokOwnerId = resolveTikTokOwnerId(req, auth, body.accountId);
        tiktokOutcome = await publishExpToTikTok(
          finalRecord,
          tikTokOwnerId,
          body.draftOnly ? 'inbox_draft' : 'auto',
          body.accountId,
          {
            caption: body.caption,
            hashtags: body.hashtags,
            carouselMode: carouselPublishMode,
          },
        );

        if (tiktokOutcome.outcome === 'published') {
          finalRecord =
            updateExpRecord(finalRecord.id, {
              status: 'published_tiktok',
              tiktokPublishId: tiktokOutcome.publishId ?? null,
              tiktokPublishMode: tiktokOutcome.publishMode ?? null,
              tiktokStatusText: tiktokOutcome.statusText,
              tiktokPostUrl: tiktokOutcome.platformPostUrl ?? null,
              tiktokError: null,
            }) ?? finalRecord;
        } else if (tiktokOutcome.outcome === 'inbox_draft') {
          finalRecord =
            updateExpRecord(finalRecord.id, {
              status: 'tiktok_inbox',
              tiktokPublishId: tiktokOutcome.publishId ?? null,
              tiktokPublishMode: 'inbox_draft',
              tiktokStatusText: tiktokOutcome.statusText,
              tiktokPostUrl: tiktokOutcome.platformPostUrl ?? null,
              tiktokError: null,
            }) ?? finalRecord;
        } else {
          finalRecord =
            updateExpRecord(finalRecord.id, {
              status: 'tiktok_error',
              tiktokPublishId: tiktokOutcome.publishId ?? null,
              tiktokStatusText: tiktokOutcome.statusText,
              tiktokError: tiktokOutcome.error ?? tiktokOutcome.statusText,
            }) ?? finalRecord;
        }
      }

      res.json({
        ok: true,
        record: finalRecord,
        tiktokOutcome,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao criar carrossel EXP.',
      });
    }
  });

  app.post('/api/exp/preview', async (req, res) => {
    const body = (req.body || {}) as {
      involvedName?: string;
      description?: string;
      whatHappened?: string;
      whyWrong?: string;
      additionalInsults?: string;
      mediaLinks?: string;
      otherLinks?: string;
      format?: string;
    };

    const privacy = validateExpNoPrivateData(body);
    if (!privacy.ok) {
      res.status(400).json({ error: privacy.reason });
      return;
    }

    const mediaLinks = parseEvidenceLinks(body.mediaLinks || '');
    const otherLinks = parseEvidenceLinks(body.otherLinks || '');
    const format: ExpFormat = body.format === 'video' ? 'video' : 'carousel';
    const nextExpNumber = getNextPreviewExpNumber();

    const buf = await generateExpDraftPreview({
      nextExpNumber,
      involvedName: (body.involvedName || '').trim(),
      description: (body.description || '').trim(),
      whatHappened: (body.whatHappened || '').trim(),
      whyWrong: (body.whyWrong || '').trim(),
      additionalInsults: (body.additionalInsults || '').trim(),
      mediaLinks,
      mediaLinksCount: mediaLinks.length,
      otherLinksCount: otherLinks.length,
      format,
    });

    res.json({
      previewDataUrl: `data:image/jpeg;base64,${buf.toString('base64')}`,
      nextExpNumber,
      nextExpCode: formatExpCode(nextExpNumber),
    });
  });

  // Publish EXP record (supports both web-studio records and Discord server records)
  app.post('/api/exp/:expId/publish-tiktok', async (req, res) => {
    try {
      const auth = getSessionFromRequest(req);
      const panelOwnerId = getPanelOwnerId(req, auth);

      const record = getExpRecord(req.params.expId);
      if (!record) {
        res.status(404).json({ error: 'Exposição não encontrada.' });
        return;
      }

      if (record.guildId !== 'web-studio') {
        const authorized = await authorizeGuildAdmin(req, res, record.guildId);
        if (!authorized) return;
      }

      if (record.generatedFiles.length === 0) {
        res.status(400).json({ error: 'O conteúdo desta exposição ainda não foi gerado.' });
        return;
      }

      const body = (req.body || {}) as {
        mode?: TikTokPublishMode;
        accountId?: string;
        caption?: string;
        hashtags?: string[] | string;
        privacyLevel?: TikTokPrivacyLevel;
        carouselMode?: CarouselPublishMode;
      };
      const mode: TikTokPublishMode =
        body.mode === 'inbox_draft' || body.mode === 'direct_private' || body.mode === 'direct_public'
          ? body.mode
          : 'auto';

      const candidateOwner = resolveTikTokOwnerId(req, auth, body.accountId);
      const tiktokOwner = getTikTokConnection(candidateOwner, body.accountId)
        ? candidateOwner
        : null;

      const outcome = await publishExpToTikTok(record, tiktokOwner, mode, body.accountId, {
        caption: body.caption,
        hashtags: body.hashtags,
        privacyLevel: body.privacyLevel,
        carouselMode: body.carouselMode,
      });

      if (outcome.outcome === 'published') {
        updateExpRecord(record.id, {
          status: 'published_tiktok',
          tiktokPublishId: outcome.publishId ?? null,
          tiktokPublishMode: outcome.publishMode ?? null,
          tiktokStatusText: outcome.statusText,
          tiktokPostUrl: outcome.platformPostUrl ?? null,
          tiktokError: null,
        });
      } else if (outcome.outcome === 'inbox_draft') {
        updateExpRecord(record.id, {
          status: 'tiktok_inbox',
          tiktokPublishId: outcome.publishId ?? null,
          tiktokPublishMode: 'inbox_draft',
          tiktokStatusText: outcome.statusText,
          tiktokPostUrl: outcome.platformPostUrl ?? null,
          tiktokError: null,
        });
      } else {
        updateExpRecord(record.id, {
          status: 'tiktok_error',
          tiktokPublishId: outcome.publishId ?? record.tiktokPublishId ?? null,
          tiktokStatusText: outcome.statusText,
          tiktokError: outcome.error ?? outcome.statusText,
        });
      }

      res.status(outcome.outcome === 'error' || outcome.outcome === 'not_connected' ? 400 : 200).json(
        outcome,
      );
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao publicar exposição no TikTok.',
      });
    }
  });

  app.post('/api/guilds/:guildId/exp/:expId/publish-tiktok', async (req, res) => {
    try {
      const authorized = await authorizeGuildAdmin(req, res, req.params.guildId);
      if (!authorized) return;

      const record = getExpRecord(req.params.expId);
      if (!record || record.guildId !== authorized.guild.id) {
        res.status(404).json({ error: 'Exposição não encontrada neste servidor.' });
        return;
      }

      if (record.generatedFiles.length === 0) {
        res.status(400).json({ error: 'O conteúdo desta exposição ainda não foi gerado.' });
        return;
      }

      const body = (req.body || {}) as {
        mode?: TikTokPublishMode;
        accountId?: string;
        caption?: string;
        hashtags?: string[] | string;
        privacyLevel?: TikTokPrivacyLevel;
        carouselMode?: CarouselPublishMode;
      };
      const mode: TikTokPublishMode =
        body.mode === 'inbox_draft' || body.mode === 'direct_private' || body.mode === 'direct_public'
          ? body.mode
          : 'auto';

      const tiktokOwner = getTikTokConnection(authorized.session.user.id, body.accountId)
        ? authorized.session.user.id
        : null;

      const outcome = await publishExpToTikTok(record, tiktokOwner, mode, body.accountId, {
        caption: body.caption,
        hashtags: body.hashtags,
        privacyLevel: body.privacyLevel,
        carouselMode: body.carouselMode,
      });

      if (outcome.outcome === 'published') {
        updateExpRecord(record.id, {
          status: 'published_tiktok',
          tiktokPublishId: outcome.publishId ?? null,
          tiktokPublishMode: outcome.publishMode ?? null,
          tiktokStatusText: outcome.statusText,
          tiktokPostUrl: outcome.platformPostUrl ?? null,
          tiktokError: null,
        });
      } else if (outcome.outcome === 'inbox_draft') {
        updateExpRecord(record.id, {
          status: 'tiktok_inbox',
          tiktokPublishId: outcome.publishId ?? null,
          tiktokPublishMode: 'inbox_draft',
          tiktokStatusText: outcome.statusText,
          tiktokPostUrl: outcome.platformPostUrl ?? null,
          tiktokError: null,
        });
      } else {
        updateExpRecord(record.id, {
          status: 'tiktok_error',
          tiktokPublishId: outcome.publishId ?? record.tiktokPublishId ?? null,
          tiktokStatusText: outcome.statusText,
          tiktokError: outcome.error ?? outcome.statusText,
        });
      }

      res.status(outcome.outcome === 'error' || outcome.outcome === 'not_connected' ? 400 : 200).json(
        outcome,
      );
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Erro ao publicar exposição no TikTok.',
      });
    }
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Rota da API não encontrada.' });
  });

  app.use((err: any, req: Request, res: Response, _next: express.NextFunction) => {
    console.error('[Server Error]:', err);
    if (res.headersSent) return;
    if (req.path.startsWith('/api')) {
      res.status(err?.status || 500).json({
        error: err?.message || 'Erro interno no servidor.',
      });
      return;
    }
    res.status(err?.status || 500).send('Erro interno no servidor.');
  });

  // Mount Vite middleware in development, or serve static dist in production.
  // Start listening immediately so dev server health checks succeed even during cold Vite setup.
  if (process.env.NODE_ENV !== 'production') {
    const vitePromise = createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    vitePromise.catch((err) => {
      console.error('[Vite] Initialization error:', err);
    });
    app.use((req, res, next) => {
      void vitePromise.then((vite) => vite.middlewares(req, res, next)).catch(next);
    });
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
  });

  attachBroadcastWebSocketServer(httpServer);

  httpServer.once('close', () => {
    void cleanupAllCallGamesOnShutdown('Servidor do site encerrado ou reiniciado.').catch(() => {});
  });

  // Start Discord bot in background without blocking HTTP startup
  initializeDiscordBot().catch((err) => {
    console.error('[Discord Bot] Initialization error:', err);
  });
  initTestDiscordBot().catch(() => {});
}

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
