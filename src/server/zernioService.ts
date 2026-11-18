import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  deleteZernioAccount,
  findZernioAccountOwner,
  getStoredProfileId,
  getZernioAccount,
  getZernioAccounts,
  getZernioPostById,
  saveZernioAccount,
  saveZernioPostHistory,
  setStoredProfileId,
  updateZernioPostHistory,
  type ZernioAccountRecord,
  type ZernioPostHistoryRecord,
  type ZernioPostStatus,
} from './zernioStore.ts';

const ZERNIO_BASE_URL = 'https://zernio.com/api/v1';

export type TikTokPrivacyLevel =
  | 'PUBLIC_TO_EVERYONE'
  | 'MUTUAL_FOLLOW_FRIENDS'
  | 'SELF_ONLY';

interface PendingOAuthSession {
  state: string;
  discordUserId: string;
  profileId: string;
  knownAccountIds: Set<string>;
  createdAt: number;
}

interface CompletedOAuthSession {
  status: 'success' | 'error';
  account?: ZernioAccountRecord;
  error?: string;
  createdAt: number;
}

const pendingOAuthSessions = new Map<string, PendingOAuthSession>();
const completedOAuthSessions = new Map<string, CompletedOAuthSession>();
const PENDING_OAUTH_FILE = path.resolve(process.cwd(), 'server', 'data', 'zernio-pending.json');

interface PersistedPendingEntry {
  state: string;
  discordUserId: string;
  profileId: string;
  knownAccountIds: string[];
  createdAt: number;
}

function loadPendingSessionsFromDisk(): void {
  try {
    if (!fs.existsSync(PENDING_OAUTH_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(PENDING_OAUTH_FILE, 'utf-8')) as Record<string, PersistedPendingEntry>;
    if (!raw || typeof raw !== 'object') return;
    for (const [k, v] of Object.entries(raw)) {
      if (v && v.state && v.discordUserId && v.profileId && !pendingOAuthSessions.has(k)) {
        pendingOAuthSessions.set(k, {
          state: v.state,
          discordUserId: v.discordUserId,
          profileId: v.profileId,
          knownAccountIds: new Set(Array.isArray(v.knownAccountIds) ? v.knownAccountIds : []),
          createdAt: v.createdAt || Date.now(),
        });
      }
    }
  } catch {
    // Ignore unreadable pending cache
  }
}

function persistPendingSessionsToDisk(): void {
  try {
    fs.mkdirSync(path.dirname(PENDING_OAUTH_FILE), { recursive: true });
    const obj: Record<string, PersistedPendingEntry> = {};
    for (const [k, v] of pendingOAuthSessions.entries()) {
      obj[k] = {
        state: v.state,
        discordUserId: v.discordUserId,
        profileId: v.profileId,
        knownAccountIds: Array.from(v.knownAccountIds),
        createdAt: v.createdAt,
      };
    }
    fs.writeFileSync(PENDING_OAUTH_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch {
    // Ignore disk cache write failures
  }
}

loadPendingSessionsFromDisk();

function pruneOAuthSessions(): void {
  const cutoff = Date.now() - 30 * 60 * 1000;
  let changed = false;
  for (const [k, v] of pendingOAuthSessions.entries()) {
    if (v.createdAt < cutoff) {
      pendingOAuthSessions.delete(k);
      changed = true;
    }
  }
  if (changed) persistPendingSessionsToDisk();
  for (const [k, v] of completedOAuthSessions.entries()) {
    if (v.createdAt < cutoff) completedOAuthSessions.delete(k);
  }
}

const ZERNIO_KEY_FILE = path.join(process.cwd(), '.zernio-key.txt');

export function hydrateZernioEnvFromDisk(): string {
  const envKey = process.env.ZERNIO_API_KEY?.trim();
  if (envKey) {
    try {
      if (!fs.existsSync(ZERNIO_KEY_FILE) || fs.readFileSync(ZERNIO_KEY_FILE, 'utf8').trim() !== envKey) {
        fs.writeFileSync(ZERNIO_KEY_FILE, envKey, 'utf8');
      }
    } catch {}
    return envKey;
  }
  try {
    if (fs.existsSync(ZERNIO_KEY_FILE)) {
      const diskKey = fs.readFileSync(ZERNIO_KEY_FILE, 'utf8').trim();
      if (diskKey) {
        process.env.ZERNIO_API_KEY = diskKey;
        return diskKey;
      }
    }
  } catch {}
  return '';
}

hydrateZernioEnvFromDisk();

export function isZernioConfigured(): boolean {
  return Boolean(getZernioApiKey());
}

export function getZernioApiKey(): string {
  return hydrateZernioEnvFromDisk();
}

export function saveZernioApiKey(apiKey: string): void {
  const clean = (apiKey || '').trim();
  fs.writeFileSync(ZERNIO_KEY_FILE, clean, 'utf8');
  process.env.ZERNIO_API_KEY = clean;
}

export function getZernioKeyStatus(): { configured: boolean; maskedKey: string } {
  const key = getZernioApiKey();
  if (!key) {
    return { configured: false, maskedKey: '' };
  }
  const masked = key.length > 8 ? `${key.slice(0, 4)}••••${key.slice(-4)}` : '••••••••';
  return { configured: true, maskedKey: masked };
}

export async function testZernioApiKey(keyToTest?: string): Promise<{ ok: boolean; profilesCount?: number; error?: string }> {
  const key = (keyToTest || getZernioApiKey()).trim();
  if (!key) {
    return { ok: false, error: 'Chave ZERNIO_API_KEY não informada.' };
  }
  try {
    const resp = await fetch(`${ZERNIO_BASE_URL}/profiles`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    });
    if (!resp.ok) {
      return { ok: false, error: await parseZernioError(resp, 'Chave de API do Zernio inválida ou sem permissão') };
    }
    const json = (await resp.json()) as { profiles?: unknown[]; data?: unknown[] };
    const count = Array.isArray(json.profiles) ? json.profiles.length : Array.isArray(json.data) ? json.data.length : 0;
    return { ok: true, profilesCount: count };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro ao testar comunicação com a API Zernio.' };
  }
}

function getZernioHeaders(withJsonBody = true): Record<string, string> {
  const apiKey = getZernioApiKey();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
    'User-Agent': '573Panel/1.0',
  };
  if (withJsonBody) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

async function parseZernioError(resp: Response, fallbackMsg: string): Promise<string> {
  const text = await resp.text().catch(() => '');
  if (!text) return `${fallbackMsg} (HTTP ${resp.status})`;
  try {
    const parsed = JSON.parse(text) as {
      error?: string;
      message?: string;
      details?: string | Record<string, unknown>;
      code?: string;
    };
    if (parsed.code === 'PAYMENT_REQUIRED' || resp.status === 402) {
      return 'O plano gratuito do Zernio permite no máximo 2 contas conectadas. Use a conta TikTok já vinculada abaixo ou remova uma duplicada no Zernio para conectar outra.';
    }
    const detailsText = typeof parsed.details === 'string' ? parsed.details : '';
    const msg = parsed.error || parsed.message || detailsText;
    return msg ? `${msg} (HTTP ${resp.status})` : `${fallbackMsg} (HTTP ${resp.status})`;
  } catch {
    return `${fallbackMsg} (HTTP ${resp.status}): ${text.slice(0, 240)}`;
  }
}

interface ZernioProfileApiItem {
  _id?: string;
  id?: string;
  name?: string;
  externalId?: string | null;
  isDefault?: boolean;
}

interface ZernioAccountApiItem {
  _id?: string;
  id?: string;
  profileId?: string | { _id?: string; id?: string; name?: string; externalId?: string };
  platform?: string;
  platformUserId?: string;
  username?: string;
  displayName?: string;
  name?: string;
  profilePicture?: string;
  avatarUrl?: string;
  avatar_url?: string;
  isActive?: boolean;
  status?: string;
  platformStatus?: string;
  needsReconnect?: boolean;
  needsReconnection?: boolean;
  issues?: string[];
}

function extractId(item?: { _id?: string; id?: string } | null): string {
  return (item?._id || item?.id || '').trim();
}

async function listZernioProfiles(): Promise<ZernioProfileApiItem[]> {
  const resp = await fetch(`${ZERNIO_BASE_URL}/profiles`, {
    method: 'GET',
    headers: getZernioHeaders(false),
  });
  if (!resp.ok) {
    throw new Error(await parseZernioError(resp, 'Falha ao consultar perfis no Zernio'));
  }
  const json = (await resp.json()) as {
    profiles?: ZernioProfileApiItem[];
    data?: ZernioProfileApiItem[];
  };
  return Array.isArray(json.profiles)
    ? json.profiles
    : Array.isArray(json.data)
      ? json.data
      : [];
}

/**
 * Ensures a Zernio profile exists for this Discord user.
 * Reuses existing profile by stored ID or externalId/name, creates a dedicated profile if allowed by plan,
 * or safely reuses the workspace default profile if the plan limits profile count while keeping per-user account isolation locally.
 */
export async function ensureZernioProfile(discordUserId: string): Promise<string> {
  const apiKey = getZernioApiKey();
  if (!apiKey) {
    throw new Error(
      'ZERNIO_API_KEY não configurada no servidor. Configure a variável de ambiente ZERNIO_API_KEY para ativar a integração.',
    );
  }

  const profiles = await listZernioProfiles();
  const storedId = getStoredProfileId(discordUserId);
  if (storedId) {
    const stillExists = profiles.find((p) => extractId(p) === storedId);
    if (stillExists) return storedId;
  }

  const expectedExternalId = `discord:${discordUserId}`;
  const expectedName = `Discord ${discordUserId}`;
  const matched = profiles.find(
    (p) => p.externalId === expectedExternalId || p.name === expectedName,
  );
  if (matched) {
    const id = extractId(matched);
    if (id) {
      setStoredProfileId(discordUserId, id);
      return id;
    }
  }

  // Try creating a dedicated profile for this Discord user
  const createResp = await fetch(`${ZERNIO_BASE_URL}/profiles`, {
    method: 'POST',
    headers: getZernioHeaders(true),
    body: JSON.stringify({
      name: expectedName,
      description: `Contas vinculadas ao usuário Discord ${discordUserId}`,
      externalId: expectedExternalId,
    }),
  });

  if (createResp.ok) {
    const createdJson = (await createResp.json()) as {
      profile?: ZernioProfileApiItem;
      data?: ZernioProfileApiItem;
      _id?: string;
      id?: string;
    };
    const createdProfile = createdJson.profile || createdJson.data || createdJson;
    const newId = extractId(createdProfile);
    if (newId) {
      setStoredProfileId(discordUserId, newId);
      return newId;
    }
  }

  // Fallback to default/first profile on single-profile Zernio plans
  const defaultProfile = profiles.find((p) => p.isDefault) || profiles[0];
  const fallbackId = extractId(defaultProfile);
  if (fallbackId) {
    setStoredProfileId(discordUserId, fallbackId);
    return fallbackId;
  }

  throw new Error(await parseZernioError(createResp, 'Falha ao criar/localizar perfil no Zernio'));
}

function extractAccountProfileId(item: ZernioAccountApiItem): string {
  if (typeof item.profileId === 'string') return item.profileId.trim();
  if (item.profileId && typeof item.profileId === 'object') {
    return (item.profileId._id || item.profileId.id || '').trim();
  }
  return '';
}

async function listAllZernioTikTokAccounts(): Promise<ZernioAccountApiItem[]> {
  const url = `${ZERNIO_BASE_URL}/accounts?platform=tiktok`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: getZernioHeaders(false),
  });
  if (!resp.ok) {
    throw new Error(await parseZernioError(resp, 'Falha ao listar contas TikTok no Zernio'));
  }
  const json = (await resp.json()) as {
    accounts?: ZernioAccountApiItem[];
    data?: ZernioAccountApiItem[];
  };
  const list = Array.isArray(json.accounts)
    ? json.accounts
    : Array.isArray(json.data)
      ? json.data
      : [];
  return list.filter((a) => !a.platform || a.platform.toLowerCase() === 'tiktok');
}

async function listZernioTikTokAccounts(profileId: string): Promise<ZernioAccountApiItem[]> {
  const url = `${ZERNIO_BASE_URL}/accounts?profileId=${encodeURIComponent(profileId)}&platform=tiktok`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: getZernioHeaders(false),
  });
  if (!resp.ok) {
    throw new Error(await parseZernioError(resp, 'Falha ao listar contas TikTok no Zernio'));
  }
  const json = (await resp.json()) as {
    accounts?: ZernioAccountApiItem[];
    data?: ZernioAccountApiItem[];
  };
  const list = Array.isArray(json.accounts)
    ? json.accounts
    : Array.isArray(json.data)
      ? json.data
      : [];
  return list.filter((a) => !a.platform || a.platform.toLowerCase() === 'tiktok');
}

function mapApiAccountStatus(item: ZernioAccountApiItem): 'connected' | 'expired' | 'revoked' {
  const s = (item.status || item.platformStatus || '').toLowerCase();
  if (s === 'revoked' || s === 'disconnected') return 'revoked';
  if (s === 'expired' || s === 'error' || item.needsReconnect || item.needsReconnection) return 'expired';
  if (item.isActive === false) return 'expired';
  return 'connected';
}

function saveApiAccountForUser(
  discordUserId: string,
  profileId: string,
  item: ZernioAccountApiItem,
): ZernioAccountRecord | null {
  const zernioAccountId = extractId(item);
  if (!zernioAccountId) return null;

  // Prevent hijacking an account explicitly owned by a different Discord user
  const existingOwner = findZernioAccountOwner(zernioAccountId);
  if (existingOwner && existingOwner !== discordUserId) {
    return null;
  }

  const existing = getZernioAccount(zernioAccountId, discordUserId);
  const rawUsername = (item.username || item.displayName || item.name || `tiktok_${zernioAccountId.slice(-6)}`).replace(
    /^@+/,
    '',
  );

  const resolvedProfileId = extractAccountProfileId(item) || profileId;

  return saveZernioAccount({
    id: zernioAccountId,
    discordUserId,
    zernioAccountId,
    zernioProfileId: resolvedProfileId,
    platform: 'tiktok',
    username: rawUsername,
    displayName: item.displayName || item.name || `@${rawUsername}`,
    avatarUrl: item.profilePicture || item.avatarUrl || item.avatar_url || null,
    status: mapApiAccountStatus(item),
    healthIssues: Array.isArray(item.issues) ? item.issues : undefined,
    isDefault: existing?.isDefault,
    connectedAt: existing?.connectedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export async function startZernioTikTokConnect(
  discordUserId: string,
  callbackBaseUrl: string,
): Promise<{ ok: boolean; authUrl?: string; state?: string; error?: string }> {
  if (!isZernioConfigured()) {
    return {
      ok: false,
      error:
        'ZERNIO_API_KEY não configurada no servidor. Defina ZERNIO_API_KEY nas variáveis de ambiente para conectar contas TikTok.',
    };
  }

  pruneOAuthSessions();

  try {
    const profileId = await ensureZernioProfile(discordUserId);
    const existingRemote = await listZernioTikTokAccounts(profileId).catch(() => []);
    const knownAccountIds = new Set(existingRemote.map((a) => extractId(a)).filter(Boolean));

    const state = crypto.randomBytes(16).toString('hex');
    pendingOAuthSessions.set(state, {
      state,
      discordUserId,
      profileId,
      knownAccountIds,
      createdAt: Date.now(),
    });
    persistPendingSessionsToDisk();

    const callbackUrl = new URL(callbackBaseUrl);
    callbackUrl.searchParams.set('state', state);

    const connectEndpoint = `${ZERNIO_BASE_URL}/connect/tiktok?profileId=${encodeURIComponent(
      profileId,
    )}&redirect_url=${encodeURIComponent(callbackUrl.toString())}`;

    const resp = await fetch(connectEndpoint, {
      method: 'GET',
      headers: getZernioHeaders(false),
    });

    if (!resp.ok) {
      pendingOAuthSessions.delete(state);
      persistPendingSessionsToDisk();
      await syncZernioAccountsForUser(discordUserId).catch(() => []);
      return {
        ok: false,
        error: await parseZernioError(resp, 'Zernio recusou a solicitação de autorização OAuth'),
      };
    }

    const json = (await resp.json()) as {
      authUrl?: string;
      url?: string;
      auth_url?: string;
    };
    const authUrl = json.authUrl || json.url || json.auth_url;
    if (!authUrl) {
      pendingOAuthSessions.delete(state);
      persistPendingSessionsToDisk();
      return {
        ok: false,
        error: 'A API do Zernio não retornou o link de autorização OAuth (authUrl).',
      };
    }

    return { ok: true, authUrl, state };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro ao iniciar conexão OAuth com Zernio.',
    };
  }
}

export async function completeZernioOAuthCallback(params: {
  state?: string;
  accountId?: string;
  username?: string;
  error?: string;
  errorDescription?: string;
}): Promise<{
  ok: boolean;
  state?: string;
  account?: ZernioAccountRecord;
  error?: string;
}> {
  pruneOAuthSessions();
  loadPendingSessionsFromDisk();
  const state = (params.state || '').trim();
  let pending = state ? pendingOAuthSessions.get(state) : undefined;

  if (!pending) {
    // Attempt recovery via workspace accounts if server reloaded during OAuth flow
    try {
      const allRemote = await listAllZernioTikTokAccounts();
      const matchedRemote = params.accountId
        ? allRemote.find((a) => extractId(a) === params.accountId)
        : params.username
          ? allRemote.find((a) => (a.username || '').toLowerCase() === params.username!.replace(/^@+/, '').toLowerCase())
          : allRemote[allRemote.length - 1];
      if (matchedRemote) {
        const profId = extractAccountProfileId(matchedRemote) || 'default';
        const saved = saveApiAccountForUser('panel-owner', profId, matchedRemote);
        if (saved) {
          if (state) {
            completedOAuthSessions.set(state, {
              status: 'success',
              account: saved,
              createdAt: Date.now(),
            });
          }
          return { ok: true, state, account: saved };
        }
      }
    } catch {
      // Fall through to invalid session response
    }
    return {
      ok: false,
      state,
      error: 'Sessão OAuth inválida ou expirada. Tente clicar em Conectar TikTok novamente.',
    };
  }

  pendingOAuthSessions.delete(state);
  persistPendingSessionsToDisk();

  if (params.error) {
    const errText = params.errorDescription || params.error || 'Autorização recusada no TikTok.';
    completedOAuthSessions.set(state, {
      status: 'error',
      error: errText,
      createdAt: Date.now(),
    });
    return { ok: false, state, error: errText };
  }

  try {
    const remoteAccounts = await listZernioTikTokAccounts(pending.profileId);

    let matched: ZernioAccountApiItem | undefined;
    if (params.accountId) {
      matched = remoteAccounts.find((a) => extractId(a) === params.accountId);
    }
    if (!matched && params.username) {
      const cleanU = params.username.replace(/^@+/, '').toLowerCase();
      matched = remoteAccounts.find(
        (a) => (a.username || '').replace(/^@+/, '').toLowerCase() === cleanU,
      );
    }
    if (!matched) {
      // Find newly added account on this profile
      matched = remoteAccounts.find((a) => {
        const id = extractId(a);
        return Boolean(id) && !pending.knownAccountIds.has(id);
      });
    }
    if (!matched && remoteAccounts.length > 0) {
      // Handle reconnection/refresh of an existing account owned by this user or only account in profile
      matched =
        remoteAccounts.find((a) => {
          const owner = findZernioAccountOwner(extractId(a));
          return !owner || owner === pending.discordUserId;
        }) || undefined;
    }

    if (!matched) {
      // Fallback: if callback carried accountId & username directly, persist & verify on next sync
      if (params.accountId) {
        const saved = saveZernioAccount({
          id: params.accountId,
          discordUserId: pending.discordUserId,
          zernioAccountId: params.accountId,
          zernioProfileId: pending.profileId,
          platform: 'tiktok',
          username: (params.username || `tiktok_${params.accountId.slice(-6)}`).replace(/^@+/, ''),
          displayName: params.username ? `@${params.username.replace(/^@+/, '')}` : 'TikTok',
          avatarUrl: null,
          status: 'connected',
          connectedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        completedOAuthSessions.set(state, {
          status: 'success',
          account: saved,
          createdAt: Date.now(),
        });
        return { ok: true, state, account: saved };
      }

      const msg = 'Nenhuma conta TikTok autorizada foi encontrada no retorno do Zernio.';
      completedOAuthSessions.set(state, { status: 'error', error: msg, createdAt: Date.now() });
      return { ok: false, state, error: msg };
    }

    const saved = saveApiAccountForUser(pending.discordUserId, pending.profileId, matched);
    if (!saved) {
      const msg = 'Esta conta TikTok já está vinculada a outro usuário Discord.';
      completedOAuthSessions.set(state, { status: 'error', error: msg, createdAt: Date.now() });
      return { ok: false, state, error: msg };
    }

    completedOAuthSessions.set(state, {
      status: 'success',
      account: saved,
      createdAt: Date.now(),
    });
    return { ok: true, state, account: saved };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao confirmar conta conectada no Zernio.';
    completedOAuthSessions.set(state, { status: 'error', error: msg, createdAt: Date.now() });
    return { ok: false, state, error: msg };
  }
}

export function pollZernioOAuthState(state: string): {
  completed: boolean;
  status?: 'success' | 'error';
  account?: ZernioAccountRecord;
  error?: string;
} {
  pruneOAuthSessions();
  const done = completedOAuthSessions.get(state);
  if (done) {
    return {
      completed: true,
      status: done.status,
      account: done.account,
      error: done.error,
    };
  }
  return { completed: false };
}

export async function syncZernioAccountsForUser(
  discordUserId: string,
): Promise<ZernioAccountRecord[]> {
  if (!isZernioConfigured()) {
    return getZernioAccounts(discordUserId);
  }

  try {
    const localAccounts = getZernioAccounts(discordUserId);
    const storedProfileId = getStoredProfileId(discordUserId);

    // Fetch all active TikTok accounts across the Zernio API workspace
    const allRemote = await listAllZernioTikTokAccounts().catch(() => [] as ZernioAccountApiItem[]);
    const remoteById = new Map(allRemote.map((r) => [extractId(r), r]));

    // 1. Update status for any locally tracked accounts
    for (const local of localAccounts) {
      const match = remoteById.get(local.zernioAccountId);
      if (match) {
        saveApiAccountForUser(discordUserId, local.zernioProfileId, match);
      }
    }

    // 2. Auto-import accounts already connected to this user's Zernio profile
    if (storedProfileId) {
      for (const remote of allRemote) {
        if (extractAccountProfileId(remote) === storedProfileId && mapApiAccountStatus(remote) !== 'revoked') {
          saveApiAccountForUser(discordUserId, storedProfileId, remote);
        }
      }
    }

    // 3. If user still has 0 local accounts (e.g., callback landed on another owner or store reset),
    // discover active workspace TikTok accounts not claimed locally (deduplicating identical usernames).
    const afterProfileSync = getZernioAccounts(discordUserId);
    if (afterProfileSync.length === 0 && allRemote.length > 0) {
      const seenUsernames = new Set<string>();
      const sortedRemote = [...allRemote].sort((a, b) => {
        const profA = extractAccountProfileId(a) === storedProfileId ? 1 : 0;
        const profB = extractAccountProfileId(b) === storedProfileId ? 1 : 0;
        return profB - profA;
      });
      for (const remote of sortedRemote) {
        if (mapApiAccountStatus(remote) === 'revoked') continue;
        const id = extractId(remote);
        const owner = findZernioAccountOwner(id);
        if (owner && owner !== discordUserId) continue;
        const uname = (remote.username || id).replace(/^@+/, '').toLowerCase();
        if (seenUsernames.has(uname)) continue;
        seenUsernames.add(uname);
        saveApiAccountForUser(discordUserId, extractAccountProfileId(remote) || storedProfileId || 'default', remote);
      }
    }
  } catch {
    // Keep last known local records if Zernio API is temporarily unreachable
  }

  return getZernioAccounts(discordUserId);
}

export async function verifyZernioAccountHealth(
  accountIdOrKey: string,
  discordUserId: string,
): Promise<{ valid: boolean; status?: 'connected' | 'expired' | 'revoked'; reason?: string }> {
  const account = getZernioAccount(accountIdOrKey, discordUserId);
  if (!account) {
    return { valid: false, reason: 'Conta TikTok não encontrada para o seu usuário.' };
  }

  if (!isZernioConfigured()) {
    return {
      valid: false,
      reason: 'ZERNIO_API_KEY não configurada no servidor.',
    };
  }

  try {
    const healthResp = await fetch(
      `${ZERNIO_BASE_URL}/accounts/${encodeURIComponent(account.zernioAccountId)}/health`,
      {
        method: 'GET',
        headers: getZernioHeaders(false),
      },
    );

    if (healthResp.ok) {
      const json = (await healthResp.json()) as {
        canPost?: boolean;
        status?: string;
        needsReconnect?: boolean;
        issues?: string[];
      };
      const issues = Array.isArray(json.issues) ? json.issues : [];
      const healthStatus = (json.status || '').toLowerCase();

      if (json.canPost === false || json.needsReconnect || healthStatus === 'error') {
        account.status = 'expired';
        account.healthIssues = issues;
        saveZernioAccount(account);
        return {
          valid: false,
          status: 'expired',
          reason:
            issues.length > 0
              ? `Autorização TikTok requer atenção: ${issues.join('; ')}`
              : 'Autorização expirada ou revogada no Zernio. Clique em Conectar TikTok para renovar.',
        };
      }

      account.status = 'connected';
      account.healthIssues = issues;
      saveZernioAccount(account);
      return { valid: true, status: 'connected' };
    }

    if (healthResp.status === 401 || healthResp.status === 403) {
      return {
        valid: false,
        reason: await parseZernioError(healthResp, 'Chave ZERNIO_API_KEY inválida ou sem permissão'),
      };
    }

    // Fallback: inspect GET /v1/accounts for the profile
    if (account.zernioProfileId) {
      const remoteList = await listZernioTikTokAccounts(account.zernioProfileId);
      const found = remoteList.find((a) => extractId(a) === account.zernioAccountId);
      if (!found) {
        account.status = 'revoked';
        saveZernioAccount(account);
        return {
          valid: false,
          status: 'revoked',
          reason: 'Esta conta foi desconectada no Zernio. Reconecte via OAuth.',
        };
      }
      const nextStatus = mapApiAccountStatus(found);
      account.status = nextStatus;
      saveZernioAccount(account);
      if (nextStatus !== 'connected') {
        return {
          valid: false,
          status: nextStatus,
          reason: 'Token expirado no Zernio. Clique em Conectar TikTok para renovar o acesso.',
        };
      }
      return { valid: true, status: 'connected' };
    }

    return {
      valid: false,
      reason: await parseZernioError(healthResp, 'Não foi possível validar a saúde da conta no Zernio'),
    };
  } catch (err) {
    return {
      valid: false,
      reason: err instanceof Error ? err.message : 'Erro de comunicação ao verificar conta no Zernio.',
    };
  }
}

export async function disconnectZernioAccount(
  accountIdOrKey: string,
  discordUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const account = getZernioAccount(accountIdOrKey, discordUserId);
  if (!account) {
    return { ok: false, error: 'Conta não encontrada ou sem permissão para desconectar.' };
  }

  if (isZernioConfigured()) {
    try {
      const resp = await fetch(
        `${ZERNIO_BASE_URL}/accounts/${encodeURIComponent(account.zernioAccountId)}`,
        {
          method: 'DELETE',
          headers: getZernioHeaders(false),
        },
      );
      if (!resp.ok && resp.status !== 404) {
        return {
          ok: false,
          error: await parseZernioError(resp, 'Zernio recusou a desconexão da conta'),
        };
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Erro ao desconectar conta no Zernio.',
      };
    }
  }

  deleteZernioAccount(account.id, discordUserId);
  return { ok: true };
}

export async function uploadMediaToZernio(params: {
  filePath?: string;
  buffer?: Buffer;
  filename: string;
  contentType?: string;
}): Promise<string> {
  if (!isZernioConfigured()) {
    throw new Error('ZERNIO_API_KEY não configurada no servidor.');
  }

  let dataBuffer: Buffer;
  if (params.buffer) {
    dataBuffer = params.buffer;
  } else if (params.filePath && fs.existsSync(params.filePath)) {
    dataBuffer = fs.readFileSync(params.filePath);
  } else {
    throw new Error('Arquivo de mídia não encontrado para envio ao Zernio.');
  }

  if (dataBuffer.byteLength === 0) {
    throw new Error('Arquivo de mídia está vazio.');
  }

  const contentType = params.contentType || 'video/mp4';
  const safeFilename = path.basename(params.filename || 'media.mp4');

  const presignResp = await fetch(`${ZERNIO_BASE_URL}/media/presign`, {
    method: 'POST',
    headers: getZernioHeaders(true),
    body: JSON.stringify({
      filename: safeFilename,
      contentType,
      size: dataBuffer.byteLength,
    }),
  });

  if (!presignResp.ok) {
    throw new Error(await parseZernioError(presignResp, 'Falha ao solicitar URL de upload no Zernio'));
  }

  const presignJson = (await presignResp.json()) as {
    uploadUrl?: string;
    publicUrl?: string;
  };

  if (!presignJson.uploadUrl || !presignJson.publicUrl) {
    throw new Error('Zernio /v1/media/presign não retornou uploadUrl e publicUrl.');
  }

  const putResp = await fetch(presignJson.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(dataBuffer.byteLength),
    },
    body: new Uint8Array(dataBuffer),
  });

  if (!putResp.ok) {
    const errText = await putResp.text().catch(() => '');
    throw new Error(
      `Falha ao enviar arquivo para o armazenamento do Zernio (HTTP ${putResp.status}): ${errText.slice(0, 160)}`,
    );
  }

  return presignJson.publicUrl;
}

export async function uploadVideoToZernio(params: {
  filePath?: string;
  buffer?: Buffer;
  filename: string;
  contentType?: string;
}): Promise<string> {
  return uploadMediaToZernio(params);
}

export function buildTikTokContentText(caption: string, hashtags: string[]): string {
  const cleanCaption = caption.trim();
  const normalizedTags = hashtags
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`));

  const missingTags = normalizedTags.filter(
    (tag) => !cleanCaption.toLowerCase().includes(tag.toLowerCase()),
  );

  if (missingTags.length === 0) return cleanCaption;
  if (!cleanCaption) return missingTags.join(' ');
  return `${cleanCaption}\n\n${missingTags.join(' ')}`;
}

export interface ZernioPublishParams {
  discordUserId: string;
  accountId?: string | null;
  videoPath?: string;
  videoBuffer?: Buffer;
  imagePaths?: string[];
  mediaMode?: 'video' | 'photo_carousel';
  filename?: string;
  caption: string;
  hashtags: string[];
  privacyLevel?: TikTokPrivacyLevel;
  draft?: boolean;
  expId?: string | null;
  expCode?: string | null;
}

export interface ZernioPublishOutcome {
  ok: boolean;
  postId?: string;
  status: ZernioPostStatus;
  platformPostId?: string | null;
  platformPostUrl?: string | null;
  statusText: string;
  error?: string;
  historyRecord?: ZernioPostHistoryRecord;
}

interface ZernioPostApiPlatform {
  platform?: string;
  accountId?: string;
  status?: string;
  platformPostId?: string;
  platformPostUrl?: string;
  error?: string;
  message?: string;
}

interface ZernioPostApiObject {
  _id?: string;
  id?: string;
  status?: string;
  platforms?: ZernioPostApiPlatform[];
  error?: string;
}

function normalizePostStatus(raw?: string): ZernioPostStatus {
  const s = (raw || '').toLowerCase();
  if (s === 'published' || s === 'posted' || s === 'success') return 'published';
  if (s === 'partial') return 'partial';
  if (s === 'failed' || s === 'error') return 'failed';
  if (s === 'draft') return 'draft';
  return 'processing';
}

export async function publishPostViaZernio(params: ZernioPublishParams): Promise<ZernioPublishOutcome> {
  if (!isZernioConfigured()) {
    return {
      ok: false,
      status: 'failed',
      statusText: 'ZERNIO_API_KEY não configurada.',
      error:
        'ZERNIO_API_KEY não configurada no servidor. Configure a variável de ambiente ZERNIO_API_KEY antes de publicar.',
    };
  }

  const userAccounts = getZernioAccounts(params.discordUserId);
  if (userAccounts.length === 0) {
    return {
      ok: false,
      status: 'failed',
      statusText: 'Nenhuma conta TikTok conectada.',
      error: 'Conecte uma conta TikTok via Zernio OAuth antes de publicar.',
    };
  }

  let targetAccount: ZernioAccountRecord | undefined;
  if (params.accountId) {
    targetAccount = userAccounts.find(
      (a) => a.id === params.accountId || a.zernioAccountId === params.accountId,
    );
    if (!targetAccount) {
      return {
        ok: false,
        status: 'failed',
        statusText: 'Conta TikTok não autorizada.',
        error: 'A conta TikTok selecionada não pertence ao seu usuário Discord.',
      };
    }
  } else {
    targetAccount = userAccounts.find((a) => a.isDefault) || userAccounts[0];
  }

  if (targetAccount.status === 'revoked') {
    return {
      ok: false,
      status: 'failed',
      statusText: 'Conta desconectada no Zernio.',
      error: `A conta @${targetAccount.username} foi revogada. Reconecte via Zernio OAuth.`,
    };
  }

  try {
    const fullContent = buildTikTokContentText(params.caption, params.hashtags);
    const isPhotoCarousel =
      params.mediaMode === 'photo_carousel' &&
      Array.isArray(params.imagePaths) &&
      params.imagePaths.length > 0;

    let mediaItems: Array<{ type: 'video' | 'image'; url: string }>;
    let tiktokSettings: Record<string, unknown>;

    if (isPhotoCarousel && params.imagePaths) {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < params.imagePaths.length; i++) {
        const imgPath = params.imagePaths[i];
        const ext = path.extname(imgPath).toLowerCase();
        const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        const url = await uploadMediaToZernio({
          filePath: imgPath,
          filename: path.basename(imgPath) || `slide-${i + 1}.jpg`,
          contentType,
        });
        uploadedUrls.push(url);
      }

      mediaItems = uploadedUrls.map((url) => ({ type: 'image', url }));
      tiktokSettings = {
        media_type: 'photo',
        privacy_level: params.privacyLevel || 'PUBLIC_TO_EVERYONE',
        allow_comment: true,
        content_preview_confirmed: true,
        express_consent_given: true,
        photo_cover_index: 0,
        auto_add_music: true,
        description: fullContent,
        ...(params.draft ? { draft: true } : {}),
      };
    } else {
      const publicVideoUrl = await uploadMediaToZernio({
        filePath: params.videoPath,
        buffer: params.videoBuffer,
        filename: params.filename || 'exp-video.mp4',
        contentType: 'video/mp4',
      });

      mediaItems = [{ type: 'video', url: publicVideoUrl }];
      tiktokSettings = {
        privacy_level: params.privacyLevel || 'PUBLIC_TO_EVERYONE',
        allow_comment: true,
        allow_duet: true,
        allow_stitch: true,
        content_preview_confirmed: true,
        express_consent_given: true,
        ...(params.draft ? { draft: true } : {}),
      };
    }

    const payload: Record<string, unknown> = {
      content: fullContent,
      mediaItems,
      platforms: [
        {
          platform: 'tiktok',
          accountId: targetAccount.zernioAccountId,
        },
      ],
      publishNow: true,
      tiktokSettings,
    };

    const resp = await fetch(`${ZERNIO_BASE_URL}/posts`, {
      method: 'POST',
      headers: getZernioHeaders(true),
      body: JSON.stringify(payload),
    });

    if (!resp.ok && resp.status !== 207) {
      const errMsg = await parseZernioError(resp, 'Zernio API recusou a publicação');
      const localFailId = `fail_${crypto.randomBytes(6).toString('hex')}`;
      const historyRecord = saveZernioPostHistory({
        id: localFailId,
        zernioPostId: localFailId,
        discordUserId: params.discordUserId,
        accountId: targetAccount.zernioAccountId,
        accountUsername: targetAccount.username,
        expId: params.expId ?? null,
        expCode: params.expCode ?? null,
        caption: fullContent,
        hashtags: params.hashtags,
        status: 'failed',
        platformPostId: null,
        platformPostUrl: null,
        error: errMsg,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return {
        ok: false,
        status: 'failed',
        statusText: `Falha ao publicar no TikTok (@${targetAccount.username})`,
        error: errMsg,
        historyRecord,
      };
    }

    const json = (await resp.json()) as {
      post?: ZernioPostApiObject;
      data?: ZernioPostApiObject;
      _id?: string;
      id?: string;
      status?: string;
      platforms?: ZernioPostApiPlatform[];
    };

    const postObj: ZernioPostApiObject = json.post || json.data || json;
    const postId = extractId(postObj) || `z_post_${Date.now()}`;
    const tiktokPlatform =
      postObj.platforms?.find((p) => (p.platform || '').toLowerCase() === 'tiktok') ||
      postObj.platforms?.[0];

    const resolvedStatus = normalizePostStatus(tiktokPlatform?.status || postObj.status);
    const platformError = tiktokPlatform?.error || postObj.error || null;
    const platformPostId = tiktokPlatform?.platformPostId || null;
    const platformPostUrl = tiktokPlatform?.platformPostUrl || null;

    let statusText = '';
    if (resolvedStatus === 'published') {
      statusText = `Publicado com sucesso no TikTok (@${targetAccount.username}) via Zernio`;
    } else if (resolvedStatus === 'draft') {
      statusText = `Enviado como rascunho no TikTok (@${targetAccount.username}) via Zernio`;
    } else if (resolvedStatus === 'failed' || resolvedStatus === 'partial' || resp.status === 207) {
      statusText = platformError
        ? `Erro na publicação (@${targetAccount.username}): ${platformError}`
        : `Publicação falhou parcialmente no TikTok (@${targetAccount.username})`;
    } else {
      statusText = `Enviado para processamento no Zernio (@${targetAccount.username})`;
    }

    const historyRecord = saveZernioPostHistory({
      id: postId,
      zernioPostId: postId,
      discordUserId: params.discordUserId,
      accountId: targetAccount.zernioAccountId,
      accountUsername: targetAccount.username,
      expId: params.expId ?? null,
      expCode: params.expCode ?? null,
      caption: fullContent,
      hashtags: params.hashtags,
      status: resolvedStatus,
      platformPostId,
      platformPostUrl,
      error: platformError,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const isSuccess = resolvedStatus !== 'failed';
    return {
      ok: isSuccess,
      postId,
      status: resolvedStatus,
      platformPostId,
      platformPostUrl,
      statusText,
      error: platformError || undefined,
      historyRecord,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Erro ao publicar vídeo via Zernio.';
    return {
      ok: false,
      status: 'failed',
      statusText: 'Erro de comunicação com Zernio.',
      error: errMsg,
    };
  }
}

export async function refreshZernioPostStatus(
  postId: string,
  discordUserId: string,
): Promise<{
  ok: boolean;
  post?: ZernioPostHistoryRecord;
  error?: string;
}> {
  const existing = getZernioPostById(postId, discordUserId);
  if (!existing) {
    return { ok: false, error: 'Publicação não encontrada para o seu usuário.' };
  }

  if (postId.startsWith('fail_')) {
    return { ok: true, post: existing };
  }

  if (!isZernioConfigured()) {
    return { ok: false, error: 'ZERNIO_API_KEY não configurada no servidor.' };
  }

  try {
    const resp = await fetch(`${ZERNIO_BASE_URL}/posts/${encodeURIComponent(postId)}`, {
      method: 'GET',
      headers: getZernioHeaders(false),
    });

    if (!resp.ok) {
      return {
        ok: false,
        error: await parseZernioError(resp, 'Não foi possível consultar o status no Zernio'),
      };
    }

    const json = (await resp.json()) as {
      post?: ZernioPostApiObject;
      data?: ZernioPostApiObject;
    } & ZernioPostApiObject;

    const postObj = json.post || json.data || json;
    const tiktokPlatform =
      postObj.platforms?.find((p) => (p.platform || '').toLowerCase() === 'tiktok') ||
      postObj.platforms?.[0];

    const updatedStatus = normalizePostStatus(tiktokPlatform?.status || postObj.status);
    const updated = updateZernioPostHistory(postId, {
      status: updatedStatus,
      platformPostId: tiktokPlatform?.platformPostId || existing.platformPostId,
      platformPostUrl: tiktokPlatform?.platformPostUrl || existing.platformPostUrl,
      error: tiktokPlatform?.error || postObj.error || null,
    });

    return { ok: true, post: updated || existing };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro ao consultar status da publicação.',
    };
  }
}

export async function retryZernioPost(
  postId: string,
  discordUserId: string,
): Promise<{
  ok: boolean;
  post?: ZernioPostHistoryRecord;
  error?: string;
}> {
  const existing = getZernioPostById(postId, discordUserId);
  if (!existing) {
    return { ok: false, error: 'Publicação não encontrada para o seu usuário.' };
  }

  if (postId.startsWith('fail_')) {
    return {
      ok: false,
      error: 'Esta tentativa falhou antes de gerar um Post ID no Zernio. Envie novamente.',
    };
  }

  if (!isZernioConfigured()) {
    return { ok: false, error: 'ZERNIO_API_KEY não configurada no servidor.' };
  }

  try {
    const resp = await fetch(`${ZERNIO_BASE_URL}/posts/${encodeURIComponent(postId)}/retry`, {
      method: 'POST',
      headers: getZernioHeaders(true),
      body: JSON.stringify({}),
    });

    if (!resp.ok && resp.status !== 207) {
      return {
        ok: false,
        error: await parseZernioError(resp, 'Não foi possível reenviar a publicação no Zernio'),
      };
    }

    const refreshed = await refreshZernioPostStatus(postId, discordUserId);
    return refreshed.ok ? refreshed : { ok: true, post: existing };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro ao tentar reenviar publicação.',
    };
  }
}
