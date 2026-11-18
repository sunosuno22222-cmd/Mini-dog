import fs from 'node:fs';
import path from 'node:path';

export interface ZernioAccountRecord {
  id: string;
  discordUserId: string;
  zernioAccountId: string;
  zernioProfileId: string;
  platform: 'tiktok';
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: 'connected' | 'expired' | 'revoked';
  healthIssues?: string[];
  isDefault?: boolean;
  connectedAt: string;
  updatedAt: string;
}

export interface ZernioPublicAccountInfo {
  id: string;
  zernioAccountId: string;
  zernioProfileId: string;
  platform: 'tiktok';
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: 'connected' | 'expired' | 'revoked';
  healthIssues?: string[];
  isDefault: boolean;
  connectedAt: string;
  updatedAt: string;
}

export type ZernioPostStatus = 'draft' | 'processing' | 'published' | 'partial' | 'failed';

export interface ZernioPostHistoryRecord {
  id: string;
  zernioPostId: string;
  discordUserId: string;
  accountId: string;
  accountUsername: string;
  expId: string | null;
  expCode: string | null;
  caption: string;
  hashtags: string[];
  status: ZernioPostStatus;
  platformPostId: string | null;
  platformPostUrl: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ZernioPersistedData {
  profilesByUser: Record<string, string>;
  accounts: Record<string, ZernioAccountRecord>;
  posts: Record<string, ZernioPostHistoryRecord>;
}

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const ZERNIO_FILE = path.resolve(DATA_DIR, 'zernio-accounts.json');

function readStore(): ZernioPersistedData {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ZERNIO_FILE)) {
    return { profilesByUser: {}, accounts: {}, posts: {} };
  }
  try {
    const raw = fs.readFileSync(ZERNIO_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ZernioPersistedData> & Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return { profilesByUser: {}, accounts: {}, posts: {} };
    }
    // Support clean schema and migrate flat dictionary if present
    if (parsed.accounts && typeof parsed.accounts === 'object') {
      return {
        profilesByUser:
          parsed.profilesByUser && typeof parsed.profilesByUser === 'object'
            ? (parsed.profilesByUser as Record<string, string>)
            : {},
        accounts: parsed.accounts as Record<string, ZernioAccountRecord>,
        posts:
          parsed.posts && typeof parsed.posts === 'object'
            ? (parsed.posts as Record<string, ZernioPostHistoryRecord>)
            : {},
      };
    }
    return { profilesByUser: {}, accounts: {}, posts: {} };
  } catch {
    return { profilesByUser: {}, accounts: {}, posts: {} };
  }
}

function writeStore(data: ZernioPersistedData): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpPath = `${ZERNIO_FILE}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, ZERNIO_FILE);
}

export function getStoredProfileId(discordUserId: string): string | null {
  if (!discordUserId) return null;
  const store = readStore();
  return store.profilesByUser[discordUserId] ?? null;
}

export function setStoredProfileId(discordUserId: string, profileId: string): void {
  if (!discordUserId || !profileId) return;
  const store = readStore();
  store.profilesByUser[discordUserId] = profileId;
  writeStore(store);
}

export function getZernioAccounts(discordUserId?: string): ZernioAccountRecord[] {
  const store = readStore();
  const list = Object.values(store.accounts);
  if (!discordUserId) return list;
  return list.filter((a) => a.discordUserId === discordUserId);
}

export function getZernioAccount(idOrKey: string, discordUserId?: string): ZernioAccountRecord | null {
  const store = readStore();
  const candidates = Object.values(store.accounts);
  for (const acc of candidates) {
    if (discordUserId && acc.discordUserId !== discordUserId) continue;
    if (acc.id === idOrKey || acc.zernioAccountId === idOrKey || acc.username === idOrKey) {
      return acc;
    }
  }
  return null;
}

export function findZernioAccountOwner(zernioAccountId: string): string | null {
  const store = readStore();
  for (const acc of Object.values(store.accounts)) {
    if (acc.zernioAccountId === zernioAccountId || acc.id === zernioAccountId) {
      return acc.discordUserId;
    }
  }
  return null;
}

export function saveZernioAccount(record: ZernioAccountRecord): ZernioAccountRecord {
  const store = readStore();
  const id = record.zernioAccountId || record.id;
  const normalized: ZernioAccountRecord = {
    ...record,
    id,
    zernioAccountId: record.zernioAccountId || id,
    updatedAt: new Date().toISOString(),
  };

  const userAccounts = Object.values(store.accounts).filter(
    (a) => a.discordUserId === normalized.discordUserId,
  );
  if (userAccounts.length === 0 || normalized.isDefault) {
    normalized.isDefault = true;
    for (const a of userAccounts) {
      if (a.id !== id) {
        a.isDefault = false;
        store.accounts[a.id] = a;
      }
    }
  }

  store.accounts[id] = normalized;
  writeStore(store);
  return normalized;
}

export function setDefaultZernioAccount(idOrKey: string, discordUserId: string): boolean {
  const store = readStore();
  const target = getZernioAccount(idOrKey, discordUserId);
  if (!target) return false;

  for (const [k, v] of Object.entries(store.accounts)) {
    if (v.discordUserId === discordUserId) {
      v.isDefault = v.id === target.id || v.zernioAccountId === target.zernioAccountId;
      store.accounts[k] = v;
    }
  }
  writeStore(store);
  return true;
}

export function deleteZernioAccount(idOrKey: string, discordUserId?: string): boolean {
  const store = readStore();
  const target = getZernioAccount(idOrKey, discordUserId);
  if (!target) return false;
  if (discordUserId && target.discordUserId !== discordUserId) return false;

  delete store.accounts[target.id];
  for (const [k, v] of Object.entries(store.accounts)) {
    if (v.zernioAccountId === target.zernioAccountId && (!discordUserId || v.discordUserId === discordUserId)) {
      delete store.accounts[k];
    }
  }

  const remaining = Object.values(store.accounts).filter(
    (a) => a.discordUserId === target.discordUserId,
  );
  if (remaining.length > 0 && !remaining.some((a) => a.isDefault)) {
    remaining[0].isDefault = true;
    store.accounts[remaining[0].id] = remaining[0];
  }

  writeStore(store);
  return true;
}

export function toPublicZernioInfo(record: ZernioAccountRecord | null): ZernioPublicAccountInfo | null {
  if (!record) return null;
  return {
    id: record.id || record.zernioAccountId,
    zernioAccountId: record.zernioAccountId,
    zernioProfileId: record.zernioProfileId,
    platform: 'tiktok',
    username: record.username,
    displayName: record.displayName,
    avatarUrl: record.avatarUrl,
    status: record.status,
    healthIssues: record.healthIssues,
    isDefault: Boolean(record.isDefault),
    connectedAt: record.connectedAt,
    updatedAt: record.updatedAt,
  };
}

export function saveZernioPostHistory(record: ZernioPostHistoryRecord): ZernioPostHistoryRecord {
  const store = readStore();
  const id = record.zernioPostId || record.id;
  const saved: ZernioPostHistoryRecord = {
    ...record,
    id,
    updatedAt: new Date().toISOString(),
  };
  store.posts[id] = saved;
  writeStore(store);
  return saved;
}

export function updateZernioPostHistory(
  postId: string,
  patch: Partial<ZernioPostHistoryRecord>,
): ZernioPostHistoryRecord | null {
  const store = readStore();
  const existing = store.posts[postId];
  if (!existing) return null;
  const updated: ZernioPostHistoryRecord = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  store.posts[postId] = updated;
  writeStore(store);
  return updated;
}

export function getZernioPostHistory(discordUserId: string): ZernioPostHistoryRecord[] {
  const store = readStore();
  return Object.values(store.posts)
    .filter((p) => p.discordUserId === discordUserId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getZernioPostById(
  postId: string,
  discordUserId?: string,
): ZernioPostHistoryRecord | null {
  const store = readStore();
  const post = store.posts[postId] ?? null;
  if (!post) return null;
  if (discordUserId && post.discordUserId !== discordUserId) return null;
  return post;
}
