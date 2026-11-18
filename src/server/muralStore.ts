import fs from 'node:fs';
import path from 'node:path';

export type MuralRequestStatus = 'pending' | 'accepted' | 'rejected' | 'deleted';
export type MuralAppealStatus = 'pending' | 'accepted' | 'rejected';

export interface MuralRequestRecord {
  id: string;
  guildId: string;
  guildName: string;
  muralChannelId: string;
  requesterId: string;
  requesterTag: string;
  targetUserId: string;
  targetUserTag: string;
  targetDisplayName?: string;
  targetAvatarUrl: string;
  title?: string;
  observation?: string;
  reason: string | null;
  status: MuralRequestStatus;
  handledById: string | null;
  handledByTag: string | null;
  reportText: string | null;
  publishedChannelId?: string | null;
  publishedMessageId?: string | null;
  createdAt: string;
  handledAt: string | null;
}

export interface MuralAppealRecord {
  id: string;
  muralId: string;
  guildId: string;
  guildName: string;
  appellantId: string;
  appellantTag: string;
  reason: string;
  status: MuralAppealStatus;
  handledById: string | null;
  handledByTag: string | null;
  createdAt: string;
  handledAt: string | null;
}

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const MURAL_FILE = path.resolve(DATA_DIR, 'mural-requests.json');
const APPEALS_FILE = path.resolve(DATA_DIR, 'mural-appeals.json');

function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJsonMap<T>(filePath: string): Record<string, T> {
  ensureDir();
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, T>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeJsonMap<T>(filePath: string, data: Record<string, T>): void {
  ensureDir();
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export function createMuralRequest(record: MuralRequestRecord): MuralRequestRecord {
  const all = readJsonMap<MuralRequestRecord>(MURAL_FILE);
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  for (const [key, item] of Object.entries(all)) {
    if (item.status !== 'accepted' && new Date(item.createdAt).getTime() < cutoff) {
      delete all[key];
    }
  }
  all[record.id] = record;
  writeJsonMap(MURAL_FILE, all);
  return record;
}

export function getMuralRequest(id: string): MuralRequestRecord | null {
  const all = readJsonMap<MuralRequestRecord>(MURAL_FILE);
  return all[id] ?? null;
}

export function updateMuralRequest(
  id: string,
  patch: Partial<MuralRequestRecord>,
): MuralRequestRecord | null {
  const all = readJsonMap<MuralRequestRecord>(MURAL_FILE);
  const existing = all[id];
  if (!existing) return null;
  const updated: MuralRequestRecord = { ...existing, ...patch };
  all[id] = updated;
  writeJsonMap(MURAL_FILE, all);
  return updated;
}

export function deleteMuralRequest(id: string): void {
  const all = readJsonMap<MuralRequestRecord>(MURAL_FILE);
  if (all[id]) {
    delete all[id];
    writeJsonMap(MURAL_FILE, all);
  }
}

export function getPublishedMuralsForGuild(guildId: string): MuralRequestRecord[] {
  const all = readJsonMap<MuralRequestRecord>(MURAL_FILE);
  return Object.values(all)
    .filter(
      (item) =>
        item.guildId === guildId &&
        item.status === 'accepted' &&
        Boolean(item.publishedMessageId) &&
        Boolean(item.publishedChannelId),
    )
    .sort((a, b) => new Date(b.handledAt || b.createdAt).getTime() - new Date(a.handledAt || a.createdAt).getTime());
}

export function createMuralAppeal(record: MuralAppealRecord): MuralAppealRecord {
  const all = readJsonMap<MuralAppealRecord>(APPEALS_FILE);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const [key, item] of Object.entries(all)) {
    if (new Date(item.createdAt).getTime() < cutoff) {
      delete all[key];
    }
  }
  all[record.id] = record;
  writeJsonMap(APPEALS_FILE, all);
  return record;
}

export function getMuralAppeal(id: string): MuralAppealRecord | null {
  const all = readJsonMap<MuralAppealRecord>(APPEALS_FILE);
  return all[id] ?? null;
}

export function updateMuralAppeal(
  id: string,
  patch: Partial<MuralAppealRecord>,
): MuralAppealRecord | null {
  const all = readJsonMap<MuralAppealRecord>(APPEALS_FILE);
  const existing = all[id];
  if (!existing) return null;
  const updated: MuralAppealRecord = { ...existing, ...patch };
  all[id] = updated;
  writeJsonMap(APPEALS_FILE, all);
  return updated;
}

export function deleteMuralAppeal(id: string): void {
  const all = readJsonMap<MuralAppealRecord>(APPEALS_FILE);
  if (all[id]) {
    delete all[id];
    writeJsonMap(APPEALS_FILE, all);
  }
}
