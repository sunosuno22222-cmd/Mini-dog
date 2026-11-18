import fs from 'node:fs';
import path from 'node:path';

export interface DiscordUser {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
}

export interface SessionRecord {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  user: DiscordUser;
  createdAt: number;
}

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const SESSIONS_FILE = path.resolve(DATA_DIR, 'sessions.json');
const MAX_SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function ensureDataDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readAllSessions(): Record<string, SessionRecord> {
  ensureDataDir();
  if (!fs.existsSync(SESSIONS_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, SessionRecord>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAllSessions(records: Record<string, SessionRecord>): void {
  ensureDataDir();
  const tmpPath = `${SESSIONS_FILE}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(records, null, 2), 'utf-8');
  fs.renameSync(tmpPath, SESSIONS_FILE);
}

export function getStoredSession(sessionId: string): SessionRecord | null {
  const all = readAllSessions();
  const record = all[sessionId];
  if (!record) return null;

  if (Date.now() - (record.createdAt || 0) > MAX_SESSION_AGE_MS) {
    delete all[sessionId];
    writeAllSessions(all);
    return null;
  }

  return record;
}

export function setStoredSession(sessionId: string, record: SessionRecord): void {
  const all = readAllSessions();
  const cutoff = Date.now() - MAX_SESSION_AGE_MS;
  for (const [id, item] of Object.entries(all)) {
    if ((item.createdAt || 0) < cutoff) {
      delete all[id];
    }
  }
  all[sessionId] = record;
  writeAllSessions(all);
}

export function deleteStoredSession(sessionId: string): void {
  const all = readAllSessions();
  if (sessionId in all) {
    delete all[sessionId];
    writeAllSessions(all);
  }
}
