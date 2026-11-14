import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { getBotClient } from "./bot";

export interface DiscordOAuthUser {
  id: string;
  username: string;
  globalName: string | null;
  discriminator: string;
  avatar: string | null;
  avatarUrl: string;
}

export interface DiscordOAuthGuild {
  id: string;
  name: string;
  icon: string | null;
  iconUrl: string | null;
  owner: boolean;
  permissions: string;
  botPresent: boolean;
}

interface StoredOAuthSession {
  sessionId: string;
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  scope: string;
  expiresAt: number;
  user: DiscordOAuthUser;
  guilds: DiscordOAuthGuild[];
  createdAt: number;
  updatedAt: number;
}

interface PendingOAuthState {
  state: string;
  redirectUri: string;
  createdAt: number;
}

const SESSION_COOKIE_NAME = "discord_tx_session";
const OAUTH_SCOPES = "identify guilds";
const DISK_SESSION_FILE = path.join(process.cwd(), ".discord-oauth-session.enc.json");
const DISK_KEY_FILE = path.join(process.cwd(), ".oauth-session.key");

const pendingStates = new Map<string, PendingOAuthState>();
const sessionsById = new Map<string, StoredOAuthSession>();

function getEncryptionKey(): Buffer {
  const secretSource = process.env.DISCORD_CLIENT_SECRET?.trim();
  if (secretSource) {
    return crypto.createHash("sha256").update(`phoenix-oauth:${secretSource}`).digest();
  }
  try {
    if (fs.existsSync(DISK_KEY_FILE)) {
      const hex = fs.readFileSync(DISK_KEY_FILE, "utf8").trim();
      if (/^[a-f0-9]{64}$/i.test(hex)) {
        return Buffer.from(hex, "hex");
      }
    }
    const generated = crypto.randomBytes(32);
    fs.writeFileSync(DISK_KEY_FILE, generated.toString("hex"), { mode: 0o600 });
    return generated;
  } catch {
    return crypto.createHash("sha256").update("phoenix-ephemeral-fallback").digest();
  }
}

function encryptPayload(plain: string): { iv: string; tag: string; data: string } {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted.toString("hex"),
  };
}

function decryptPayload(payload: { iv: string; tag: string; data: string }): string {
  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "hex"));
  decipher.setAuthTag(Buffer.from(payload.tag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.data, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function persistSessionsToDisk(): void {
  try {
    const arr = Array.from(sessionsById.values());
    if (arr.length === 0) {
      if (fs.existsSync(DISK_SESSION_FILE)) fs.unlinkSync(DISK_SESSION_FILE);
      return;
    }
    const encrypted = encryptPayload(JSON.stringify(arr));
    fs.writeFileSync(DISK_SESSION_FILE, JSON.stringify(encrypted), { mode: 0o600 });
  } catch (err) {
    console.warn("[Discord OAuth] Falha ao salvar sessão criptografada:", (err as Error).message);
  }
}

function hydrateSessionsFromDisk(): void {
  try {
    if (!fs.existsSync(DISK_SESSION_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(DISK_SESSION_FILE, "utf8"));
    if (!raw?.iv || !raw?.tag || !raw?.data) return;
    const arr = JSON.parse(decryptPayload(raw)) as StoredOAuthSession[];
    if (!Array.isArray(arr)) return;
    for (const s of arr) {
      if (s?.sessionId && s?.accessToken && s?.user?.id) {
        sessionsById.set(s.sessionId, s);
      }
    }
  } catch {
    // Ignore corrupt or old-key encrypted file
  }
}

hydrateSessionsFromDisk();

const CUSTOM_OAUTH_LINK_FILE = path.join(process.cwd(), ".discord-oauth-custom-link.txt");
export const DEFAULT_OWNER_OAUTH_LINK =
  "https://discord.com/oauth2/authorize?client_id=1555982349865324656&response_type=code&scope=identify+guilds";

let cachedCustomLink: string | null = DEFAULT_OWNER_OAUTH_LINK;
try {
  if (fs.existsSync(CUSTOM_OAUTH_LINK_FILE)) {
    const diskVal = fs.readFileSync(CUSTOM_OAUTH_LINK_FILE, "utf8").trim();
    if (diskVal) cachedCustomLink = diskVal;
  }
} catch {}

export function resolveDiscordClientId(): string | null {
  const explicit = process.env.DISCORD_APPLICATION_ID?.trim();
  if (explicit && /^\d{17,22}$/.test(explicit)) return explicit;

  if (cachedCustomLink) {
    try {
      const cid = new URL(cachedCustomLink).searchParams.get("client_id");
      if (cid && /^\d{17,22}$/.test(cid)) return cid;
    } catch {}
  }

  const client = getBotClient();
  if (client?.user?.id) return client.user.id;

  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
  if (botToken && botToken.includes(".")) {
    try {
      const firstPart = botToken.split(".")[0];
      const norm = firstPart.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = Buffer.from(norm, "base64").toString("utf8").trim();
      if (/^\d{17,22}$/.test(decoded)) return decoded;
    } catch {}
  }
  return null;
}

export function resolveBaseOrigin(originHint?: string): string {
  const cleanOrigin = (value?: string | null) =>
    (value || "").trim().replace(/\/+$/, "");

  const hinted = cleanOrigin(originHint);
  if (
    hinted &&
    (hinted.startsWith("https://") || hinted.startsWith("http://localhost")) &&
    (hinted.endsWith(".run.app") || hinted.includes("localhost"))
  ) {
    return hinted;
  }

  const appUrl = cleanOrigin(process.env.APP_URL);
  if (appUrl) {
    return appUrl;
  }

  return "http://localhost:3000";
}

export function resolveRedirectUri(originHint?: string, pathOverride = "/auth/callback"): string {
  return `${resolveBaseOrigin(originHint)}${pathOverride}`;
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie || "";
  const map: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try {
        map[k] = decodeURIComponent(v);
      } catch {
        map[k] = v;
      }
    }
  }
  return map;
}

function extractSessionIdFromReq(req: Request): string | null {
  const headerRef = req.headers["x-discord-session"];
  if (typeof headerRef === "string" && headerRef.trim()) {
    return headerRef.trim();
  }
  const cookies = parseCookies(req);
  if (cookies[SESSION_COOKIE_NAME]) {
    return cookies[SESSION_COOKIE_NAME];
  }
  return null;
}

function buildCookieString(value: string, maxAgeSeconds: number, isHttps: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
    `Path=/`,
    `HttpOnly`,
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isHttps) {
    parts.push("SameSite=None", "Secure");
  } else {
    parts.push("SameSite=Lax");
  }
  return parts.join("; ");
}

function formatDiscordAvatar(user: {
  id: string;
  avatar: string | null;
  discriminator?: string;
}): string {
  if (user.avatar) {
    const ext = user.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=256`;
  }
  const idx =
    user.discriminator && user.discriminator !== "0"
      ? Number(user.discriminator) % 5
      : Number((BigInt(user.id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

function mapOAuthGuilds(rawGuilds: any[]): DiscordOAuthGuild[] {
  const botClient = getBotClient();
  const botGuildIds = new Set<string>(
    botClient && botClient.isReady() ? Array.from(botClient.guilds.cache.keys()) : []
  );

  return (Array.isArray(rawGuilds) ? rawGuilds : []).map((g) => ({
    id: String(g.id),
    name: String(g.name || "Servidor Discord"),
    icon: g.icon || null,
    iconUrl: g.icon
      ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=128`
      : null,
    owner: Boolean(g.owner),
    permissions: String(g.permissions || "0"),
    botPresent: botGuildIds.has(String(g.id)),
  }));
}

async function refreshDiscordAccessToken(session: StoredOAuthSession): Promise<StoredOAuthSession | null> {
  if (!session.refreshToken) return null;
  const clientId = resolveDiscordClientId();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    });
    const res = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) return null;
    const tokenData = (await res.json()) as any;
    session.accessToken = tokenData.access_token;
    session.refreshToken = tokenData.refresh_token || session.refreshToken;
    session.expiresAt = Date.now() + Number(tokenData.expires_in || 3600) * 1000;
    session.updatedAt = Date.now();
    sessionsById.set(session.sessionId, session);
    persistSessionsToDisk();
    return session;
  } catch {
    return null;
  }
}

const RESTRICTED_RPC_SCOPES = new Set([
  "rpc",
  "rpc.notifications.read",
  "rpc.voice.read",
  "rpc.voice.write",
  "rpc.video.read",
  "rpc.video.write",
  "rpc.screenshare.read",
  "rpc.screenshare.write",
  "rpc.activities.write",
  "applications.store.update",
]);

function inspectCustomOAuthLink(raw: string | null, originHint?: string) {
  const baseOrigin = resolveBaseOrigin(originHint);
  const currentApiRedirect = `${baseOrigin}/api/auth/discord/callback`;
  const currentShortRedirect = `${baseOrigin}/auth/callback`;

  if (!raw) {
    return {
      linkRedirectUri: null as string | null,
      linkOriginMismatch: false,
      permissions: "8",
      requestedScopes: [] as string[],
      restrictedRpcScopes: [] as string[],
      currentApiRedirect,
      currentShortRedirect,
    };
  }

  try {
    const parsed = new URL(raw);
    const linkRedirectUri = parsed.searchParams.get("redirect_uri");
    const permissions = parsed.searchParams.get("permissions") || "8";
    const scopeStr = parsed.searchParams.get("scope") || "";
    const requestedScopes = scopeStr.split(/[\s+]+/).filter(Boolean);
    const restrictedRpcScopes = requestedScopes.filter((s) => RESTRICTED_RPC_SCOPES.has(s));

    let linkOriginMismatch = false;
    if (linkRedirectUri) {
      try {
        const redirectHost = new URL(linkRedirectUri).host;
        const liveHost = new URL(baseOrigin).host;
        linkOriginMismatch = redirectHost !== liveHost;
      } catch {}
    }

    return {
      linkRedirectUri,
      linkOriginMismatch,
      permissions,
      requestedScopes,
      restrictedRpcScopes,
      currentApiRedirect,
      currentShortRedirect,
    };
  } catch {
    return {
      linkRedirectUri: null,
      linkOriginMismatch: false,
      permissions: "8",
      requestedScopes: [],
      restrictedRpcScopes: [],
      currentApiRedirect,
      currentShortRedirect,
    };
  }
}

export function buildDiscordOAuthUrl(
  originHint?: string,
  opts?: { useShortCallback?: boolean; includeBotInvite?: boolean }
): {
  url: string;
  redirectUri: string;
  clientId: string;
  scopes: string[];
} {
  const clientId = resolveDiscordClientId();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();

  if (!clientId) {
    throw new Error(
      "DISCORD_APPLICATION_ID não configurado. Informe o Application ID / Client ID no servidor ou conecte o Bot principal."
    );
  }
  if (!clientSecret) {
    throw new Error(
      "DISCORD_CLIENT_SECRET não configurado no servidor. Adicione em Status & Credenciais para ativar o OAuth2 oficial do Discord."
    );
  }

  // Purge expired OAuth states (> 10 minutes)
  const now = Date.now();
  for (const [key, item] of pendingStates) {
    if (now - item.createdAt > 10 * 60 * 1000) {
      pendingStates.delete(key);
    }
  }

  const inspection = inspectCustomOAuthLink(cachedCustomLink, originHint);
  const callbackPath = "/auth/callback";

  const state = crypto.randomBytes(24).toString("hex");
  const redirectUri = resolveRedirectUri(originHint, callbackPath);
  pendingStates.set(state, { state, redirectUri, createdAt: now });

  const scopes = opts?.includeBotInvite ? "identify guilds bot applications.commands" : OAUTH_SCOPES;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    state,
    prompt: "consent",
  });
  if (opts?.includeBotInvite) {
    params.set("permissions", inspection.permissions || "8");
    params.set("integration_type", "0");
  }

  return {
    url: `https://discord.com/oauth2/authorize?${params.toString()}`,
    redirectUri,
    clientId,
    scopes: scopes.split(" "),
  };
}

export function setOwnerProvidedDiscordLink(rawLink: string): {
  savedLink: string | null;
  extractedClientId: string | null;
} {
  const trimmed = (rawLink || "").trim();
  if (!trimmed) {
    cachedCustomLink = null;
    try {
      if (fs.existsSync(CUSTOM_OAUTH_LINK_FILE)) fs.unlinkSync(CUSTOM_OAUTH_LINK_FILE);
    } catch {}
    return { savedLink: null, extractedClientId: resolveDiscordClientId() };
  }

  let extractedClientId: string | null = null;
  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Link deve começar com https:// ou http://");
    }
    const cid = parsed.searchParams.get("client_id");
    if (cid && /^\d{17,22}$/.test(cid)) {
      extractedClientId = cid;
      process.env.DISCORD_APPLICATION_ID = cid;
    }
  } catch (err) {
    throw new Error(`Link inválido: ${(err as Error).message}`);
  }

  cachedCustomLink = trimmed;
  try {
    fs.writeFileSync(CUSTOM_OAUTH_LINK_FILE, trimmed, { encoding: "utf8", mode: 0o600 });
  } catch {}

  return {
    savedLink: cachedCustomLink,
    extractedClientId: extractedClientId || resolveDiscordClientId(),
  };
}

export function getOAuthSetupMetadata(originHint?: string) {
  const clientId = resolveDiscordClientId();
  const inspection = inspectCustomOAuthLink(cachedCustomLink, originHint);
  const botInviteUrl = clientId
    ? `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${inspection.permissions}&integration_type=0&scope=bot%20applications.commands`
    : null;

  return {
    clientId,
    clientSecretConfigured: Boolean(process.env.DISCORD_CLIENT_SECRET?.trim()),
    redirectUri: inspection.currentApiRedirect,
    altRedirectUri: inspection.currentShortRedirect,
    botInviteUrl,
    customProvidedLink: cachedCustomLink,
    linkRedirectUri: inspection.linkRedirectUri,
    linkOriginMismatch: inspection.linkOriginMismatch,
    requestedScopes: inspection.requestedScopes,
    restrictedRpcScopes: inspection.restrictedRpcScopes,
    scopes: OAUTH_SCOPES.split(" "),
  };
}

export async function handleDiscordOAuthCallbackReq(req: Request, res: Response): Promise<void> {
  const errorParam = typeof req.query.error === "string" ? req.query.error : null;
  const errorDesc =
    typeof req.query.error_description === "string"
      ? req.query.error_description
      : "Autorização cancelada ou negada pelo usuário.";

  if (errorParam) {
    res.status(400).send(renderPopupHtml(false, errorDesc));
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code.trim() : "";
  const state = typeof req.query.state === "string" ? req.query.state.trim() : "";

  if (!code) {
    res.status(400).send(renderPopupHtml(false, "Código OAuth2 ausente."));
    return;
  }

  let effectiveRedirectUri: string | null = null;
  if (state) {
    const pending = pendingStates.get(state);
    pendingStates.delete(state);
    if (!pending || Date.now() - pending.createdAt > 10 * 60 * 1000) {
      res
        .status(400)
        .send(renderPopupHtml(false, "Sessão de autenticação expirada. Tente conectar novamente."));
      return;
    }
    effectiveRedirectUri = pending.redirectUri;
  } else {
    // Allow direct callback on /auth/callback when owner pasted Discord Developer Portal authorize URL directly
    const reqPath = (req.originalUrl || req.url || "").split("?")[0];
    if (reqPath === "/auth/callback" || reqPath === "/auth/callback/") {
      const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").trim();
      const proto = String(req.headers["x-forwarded-proto"] || (req.secure ? "https" : "http")).split(",")[0].trim();
      if (host && (host.endsWith(".run.app") || host.includes("localhost"))) {
        effectiveRedirectUri = `${proto}://${host}/auth/callback`;
      }
    }
    if (!effectiveRedirectUri) {
      res.status(400).send(renderPopupHtml(false, "Parâmetro state OAuth2 ausente."));
      return;
    }
  }

  const clientId = resolveDiscordClientId();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    res
      .status(500)
      .send(renderPopupHtml(false, "Credenciais OAuth2 do Discord não configuradas no servidor."));
    return;
  }

  try {
    const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: effectiveRedirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => "");
      throw new Error(`Erro ao validar código OAuth2 (${tokenRes.status}): ${errText.slice(0, 180)}`);
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      token_type: string;
      expires_in: number;
      refresh_token?: string;
      scope: string;
    };

    const [userRes, guildsRes] = await Promise.all([
      fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }),
      fetch("https://discord.com/api/v10/users/@me/guilds", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }),
    ]);

    if (!userRes.ok) {
      throw new Error(`Falha ao carregar perfil Discord (/users/@me): HTTP ${userRes.status}`);
    }

    const rawUser = (await userRes.json()) as any;
    const rawGuilds = guildsRes.ok ? ((await guildsRes.json()) as any[]) : [];

    const user: DiscordOAuthUser = {
      id: String(rawUser.id),
      username: String(rawUser.username),
      globalName: rawUser.global_name ? String(rawUser.global_name) : null,
      discriminator: String(rawUser.discriminator || "0"),
      avatar: rawUser.avatar ? String(rawUser.avatar) : null,
      avatarUrl: formatDiscordAvatar(rawUser),
    };

    const guilds = mapOAuthGuilds(rawGuilds);
    const sessionId = crypto.randomBytes(32).toString("hex");

    const session: StoredOAuthSession = {
      sessionId,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || null,
      tokenType: tokenData.token_type || "Bearer",
      scope: tokenData.scope || OAUTH_SCOPES,
      expiresAt: Date.now() + Number(tokenData.expires_in || 604800) * 1000,
      user,
      guilds,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Keep clean single active broadcaster account or per-session lookup
    sessionsById.set(sessionId, session);
    persistSessionsToDisk();

    const isHttps =
      req.secure ||
      req.headers["x-forwarded-proto"] === "https" ||
      effectiveRedirectUri.startsWith("https://");

    res.setHeader(
      "Set-Cookie",
      buildCookieString(sessionId, Math.max(3600, Number(tokenData.expires_in || 604800)), isHttps)
    );
    res.status(200).send(renderPopupHtml(true, "Conta Discord conectada com sucesso!", sessionId, user));
  } catch (err) {
    console.error("[Discord OAuth Callback Error]:", err);
    res.status(500).send(renderPopupHtml(false, (err as Error).message));
  }
}

function renderPopupHtml(
  success: boolean,
  message: string,
  sessionRef?: string,
  user?: DiscordOAuthUser
): string {
  const safeMsg = message.replace(/[<>&"']/g, "");
  const payload = JSON.stringify({
    type: success ? "OAUTH_AUTH_SUCCESS" : "OAUTH_AUTH_ERROR",
    sessionRef: sessionRef || null,
    user: user || null,
    message: safeMsg,
  });

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Autenticação Discord OAuth2</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #070709;
        color: #f8fafc;
        font-family: system-ui, -apple-system, sans-serif;
        padding: 24px;
        text-align: center;
      }
      .box {
        max-width: 400px;
        background: #111116;
        border: 1px solid ${success ? "rgba(220,38,38,0.45)" : "rgba(239,68,68,0.6)"};
        border-radius: 14px;
        padding: 24px;
      }
      h1 { font-size: 18px; margin: 0 0 8px; }
      p { font-size: 13px; color: #94a3b8; margin: 0; }
    </style>
  </head>
  <body>
    <div class="box">
      <h1>${success ? "Discord Conectado" : "Falha na Conexão"}</h1>
      <p>${safeMsg}</p>
    </div>
    <script>
      (function () {
        var payload = ${payload};
        if (window.opener) {
          window.opener.postMessage(payload, "*");
          setTimeout(function () { window.close(); }, ${success ? 400 : 1800});
        } else if (${success ? "true" : "false"}) {
          window.location.href = "/";
        }
      })();
    </script>
  </body>
</html>`;
}

export async function getDiscordOAuthSessionInfo(req: Request): Promise<{
  connected: boolean;
  user: DiscordOAuthUser | null;
  guilds: DiscordOAuthGuild[];
  scopes: string[];
  expiresAt: number | null;
  sessionRef: string | null;
}> {
  const sid = extractSessionIdFromReq(req);
  let session = sid ? sessionsById.get(sid) || null : null;

  // Fallback to latest active persisted session only when no explicit sid was sent (helps iframe contexts)
  if (!session && !sid && sessionsById.size > 0) {
    session = Array.from(sessionsById.values()).sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
  }

  if (!session) {
    return {
      connected: false,
      user: null,
      guilds: [],
      scopes: [],
      expiresAt: null,
      sessionRef: null,
    };
  }

  if (Date.now() > session.expiresAt - 60_000) {
    const refreshed = await refreshDiscordAccessToken(session);
    if (refreshed) session = refreshed;
  }

  // Refresh botPresence flag dynamically against live Gateway bot cache
  const botClient = getBotClient();
  const botGuildIds = new Set<string>(
    botClient && botClient.isReady() ? Array.from(botClient.guilds.cache.keys()) : []
  );

  const guilds = session.guilds.map((g) => ({
    ...g,
    botPresent: botGuildIds.has(g.id),
  }));

  return {
    connected: true,
    user: session.user,
    guilds,
    scopes: session.scope.split(/\s+/).filter(Boolean),
    expiresAt: session.expiresAt,
    sessionRef: session.sessionId,
  };
}

export async function disconnectDiscordOAuthSession(req: Request, res: Response): Promise<void> {
  const sid = extractSessionIdFromReq(req);
  const targets: StoredOAuthSession[] = [];

  if (sid && sessionsById.has(sid)) {
    targets.push(sessionsById.get(sid)!);
    sessionsById.delete(sid);
  } else if (!sid) {
    for (const s of sessionsById.values()) targets.push(s);
    sessionsById.clear();
  }

  const clientId = resolveDiscordClientId();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();

  for (const sess of targets) {
    if (clientId && clientSecret && sess.accessToken) {
      await fetch("https://discord.com/api/v10/oauth2/token/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          token: sess.accessToken,
        }),
      }).catch(() => {});
    }
  }

  persistSessionsToDisk();

  const isHttps =
    req.secure ||
    req.headers["x-forwarded-proto"] === "https" ||
    Boolean(process.env.APP_URL?.startsWith("https://"));

  res.setHeader("Set-Cookie", buildCookieString("", 0, isHttps));
  res.json({ success: true });
}

export async function getGuildVoiceChannelsForBroadcast(guildId: string): Promise<
  Array<{
    id: string;
    name: string;
    memberCount: number;
    members: Array<{ id: string; username: string; avatar: string | null; bot: boolean }>;
  }>
> {
  const client = getBotClient();
  if (!client || !client.isReady()) {
    throw new Error("Bot principal precisa estar conectado ao Gateway para listar canais de voz.");
  }

  const guild =
    client.guilds.cache.get(guildId) ||
    (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    throw new Error("O bot principal não está presente neste servidor ou o servidor não foi encontrado.");
  }

  if (guild.channels.cache.size === 0) {
    await guild.channels.fetch().catch(() => null);
  }

  const voiceChannels = Array.from(guild.channels.cache.values())
    .filter((c) => c.isVoiceBased())
    .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));

  return voiceChannels.map((vc: any) => ({
    id: vc.id,
    name: vc.name,
    memberCount: vc.members?.size || 0,
    members: vc.members
      ? Array.from(vc.members.values()).map((m: any) => ({
          id: m.id,
          username: m.displayName || m.user?.globalName || m.user?.username || "Usuário",
          avatar: m.user?.displayAvatarURL?.({ size: 128, extension: "png" }) || null,
          bot: Boolean(m.user?.bot),
        }))
      : [],
  }));
}
