import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type ExpFormat = 'carousel' | 'video';

export type ExpStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'awaiting_tiktok_confirmation'
  | 'published_tiktok'
  | 'tiktok_inbox'
  | 'tiktok_error';

export interface ExpDraftRecord {
  key: string;
  guildId: string;
  guildName: string;
  userId: string;
  userTag: string;
  involvedName: string;
  description: string;
  whatHappened: string;
  whyWrong: string;
  additionalInsults?: string;
  mediaLinks: string[];
  otherLinks: string[];
  personPhotoFile?: string | null;
  proofFiles?: string[];
  selectedFormat: ExpFormat | null;
  previewImagePath: string | null;
  updatedAt: string;
}

export type CarouselPublishMode = 'video_slideshow' | 'photo_carousel';

export interface ExpAudioTrackMeta {
  id?: string;
  artist: string;
  title: string;
  previewUrl?: string;
}

export interface ExpRecord {
  id: string;
  guildId: string;
  guildName: string;
  requesterId: string;
  requesterTag: string;
  involvedName: string;
  description: string;
  whatHappened: string;
  whyWrong: string;
  additionalInsults?: string;
  title?: string;
  information?: string;
  additionalText?: string;
  insultText?: string;
  closingText?: string;
  watermarkText?: string;
  audioTrack?: ExpAudioTrackMeta | null;
  carouselPublishMode?: CarouselPublishMode;
  mediaLinks: string[];
  otherLinks: string[];
  personPhotoFile?: string | null;
  proofFiles?: string[];
  format: ExpFormat;
  status: ExpStatus;
  expNumber: number | null;
  expCode: string | null;
  caption: string | null;
  mediaToken: string;
  generatedFiles: string[];
  handledById: string | null;
  handledByTag: string | null;
  handledAt: string | null;
  tiktokPublishId: string | null;
  tiktokPublishMode: string | null;
  tiktokStatusText: string | null;
  tiktokError: string | null;
  tiktokPostUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ExpPersistedState {
  nextExpNumber: number;
  usedNumbers: number[];
  records: Record<string, ExpRecord>;
  guildOwners: Record<string, string>;
}

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');
const EXP_STORE_FILE = path.resolve(DATA_DIR, 'exp-store.json');
const EXP_DRAFTS_FILE = path.resolve(DATA_DIR, 'exp-drafts.json');
const EXP_MEDIA_DIR = path.resolve(DATA_DIR, 'exp-media');
const EXP_DRAFT_MEDIA_DIR = path.resolve(DATA_DIR, 'exp-draft-media');

export const EXP_HASHTAGS = '#paneleiro #bot #fyb #5573 #exp';

export function formatExpCode(num: number): string {
  return `Exp ${String(num).padStart(3, '0')}`;
}

export function formatExpCaption(num: number): string {
  return `${formatExpCode(num)} ${EXP_HASHTAGS}`;
}

function ensureDirs(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(EXP_MEDIA_DIR, { recursive: true });
  fs.mkdirSync(EXP_DRAFT_MEDIA_DIR, { recursive: true });
}

function readState(): ExpPersistedState {
  ensureDirs();
  if (!fs.existsSync(EXP_STORE_FILE)) {
    return { nextExpNumber: 1, usedNumbers: [], records: {}, guildOwners: {} };
  }
  try {
    const raw = fs.readFileSync(EXP_STORE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<ExpPersistedState>;
    const used = Array.isArray(parsed.usedNumbers)
      ? parsed.usedNumbers.filter((n) => typeof n === 'number' && Number.isInteger(n) && n > 0)
      : [];
    const records =
      parsed.records && typeof parsed.records === 'object' ? parsed.records : {};
    const maxUsed = used.reduce((acc, n) => Math.max(acc, n), 0);
    const maxRecordNum = Object.values(records).reduce(
      (acc, r) => (typeof r?.expNumber === 'number' ? Math.max(acc, r.expNumber) : acc),
      0,
    );
    const nextExpNumber = Math.max(
      typeof parsed.nextExpNumber === 'number' ? parsed.nextExpNumber : 1,
      maxUsed + 1,
      maxRecordNum + 1,
    );
    return {
      nextExpNumber,
      usedNumbers: Array.from(new Set(used)),
      records,
      guildOwners:
        parsed.guildOwners && typeof parsed.guildOwners === 'object' ? parsed.guildOwners : {},
    };
  } catch {
    return { nextExpNumber: 1, usedNumbers: [], records: {}, guildOwners: {} };
  }
}

export function deleteAllExpRecords(): void {
  const state = { nextExpNumber: 1, usedNumbers: [], records: {}, guildOwners: {} };
  writeState(state);
  try {
    if (fs.existsSync(EXP_MEDIA_DIR)) {
      fs.rmSync(EXP_MEDIA_DIR, { recursive: true, force: true });
      fs.mkdirSync(EXP_MEDIA_DIR, { recursive: true });
    }
  } catch {}
}

function writeState(state: ExpPersistedState): void {
  ensureDirs();
  const tmpPath = `${EXP_STORE_FILE}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
  fs.renameSync(tmpPath, EXP_STORE_FILE);
}

function readDrafts(): Record<string, ExpDraftRecord> {
  ensureDirs();
  if (!fs.existsSync(EXP_DRAFTS_FILE)) return {};
  try {
    const raw = fs.readFileSync(EXP_DRAFTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, ExpDraftRecord>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeDrafts(drafts: Record<string, ExpDraftRecord>): void {
  ensureDirs();
  const tmpPath = `${EXP_DRAFTS_FILE}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(drafts, null, 2), 'utf-8');
  fs.renameSync(tmpPath, EXP_DRAFTS_FILE);
}

export function getDraftKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function saveExpDraft(draft: ExpDraftRecord): ExpDraftRecord {
  const drafts = readDrafts();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [key, item] of Object.entries(drafts)) {
    if (new Date(item.updatedAt).getTime() < cutoff) {
      delete drafts[key];
    }
  }
  drafts[draft.key] = draft;
  writeDrafts(drafts);
  return draft;
}

export function getExpDraft(guildId: string, userId: string): ExpDraftRecord | null {
  const drafts = readDrafts();
  return drafts[getDraftKey(guildId, userId)] ?? null;
}

export function deleteExpDraft(guildId: string, userId: string): void {
  const drafts = readDrafts();
  const key = getDraftKey(guildId, userId);
  if (drafts[key]) {
    delete drafts[key];
    writeDrafts(drafts);
  }
}

export function setGuildTikTokOwner(guildId: string, discordUserId: string): void {
  if (!guildId || !discordUserId) return;
  const state = readState();
  state.guildOwners[guildId] = discordUserId;
  writeState(state);
}

export function getGuildTikTokOwner(guildId: string): string | null {
  const state = readState();
  return state.guildOwners[guildId] ?? null;
}

export function getNextPreviewExpNumber(): number {
  const state = readState();
  const usedSet = new Set(state.usedNumbers);
  for (const rec of Object.values(state.records)) {
    if (typeof rec.expNumber === 'number') {
      usedSet.add(rec.expNumber);
    }
  }
  let candidate = Math.max(1, state.nextExpNumber);
  while (usedSet.has(candidate)) {
    candidate += 1;
  }
  return candidate;
}

export function allocateUniqueExpNumber(expId: string): {
  expNumber: number;
  expCode: string;
  caption: string;
} {
  const state = readState();
  const existing = state.records[expId];
  if (existing && typeof existing.expNumber === 'number') {
    const expNumber = existing.expNumber;
    return {
      expNumber,
      expCode: formatExpCode(expNumber),
      caption: formatExpCaption(expNumber),
    };
  }

  const usedSet = new Set(state.usedNumbers);
  for (const rec of Object.values(state.records)) {
    if (typeof rec.expNumber === 'number') {
      usedSet.add(rec.expNumber);
    }
  }

  let candidate = Math.max(1, state.nextExpNumber);
  while (usedSet.has(candidate)) {
    candidate += 1;
  }

  state.usedNumbers.push(candidate);
  state.nextExpNumber = candidate + 1;

  const expCode = formatExpCode(candidate);
  const caption = formatExpCaption(candidate);

  if (state.records[expId]) {
    state.records[expId] = {
      ...state.records[expId],
      expNumber: candidate,
      expCode,
      caption,
      updatedAt: new Date().toISOString(),
    };
  }

  writeState(state);
  return { expNumber: candidate, expCode, caption };
}

export function syncUsedExpNumbersFloor(maxKnownNumber: number): void {
  if (!Number.isInteger(maxKnownNumber) || maxKnownNumber < 1) return;
  const state = readState();
  let changed = false;
  if (state.nextExpNumber <= maxKnownNumber) {
    state.nextExpNumber = maxKnownNumber + 1;
    changed = true;
  }
  for (let i = 1; i <= maxKnownNumber; i++) {
    if (!state.usedNumbers.includes(i)) {
      state.usedNumbers.push(i);
      changed = true;
    }
  }
  if (changed) {
    writeState(state);
  }
}

export function createExpRecord(
  input: Omit<ExpRecord, 'id' | 'mediaToken' | 'createdAt' | 'updatedAt'>,
): ExpRecord {
  deleteAllExpRecords();
  const state = readState();
  state.nextExpNumber = 1;
  state.usedNumbers = [1];
  const id = `EXP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const now = new Date().toISOString();
  const record: ExpRecord = {
    ...input,
    expNumber: 1,
    expCode: formatExpCode(1),
    caption: formatExpCaption(1),
    id,
    mediaToken: crypto.randomBytes(16).toString('hex'),
    createdAt: now,
    updatedAt: now,
  };
  state.records[id] = record;
  writeState(state);
  return record;
}

export function getExpRecord(id: string): ExpRecord | null {
  const state = readState();
  return state.records[id] ?? null;
}

export function updateExpRecord(id: string, patch: Partial<ExpRecord>): ExpRecord | null {
  const state = readState();
  const current = state.records[id];
  if (!current) return null;
  const updated: ExpRecord = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  state.records[id] = updated;
  writeState(state);
  return updated;
}

export function listExpRecords(guildId?: string): ExpRecord[] {
  const state = readState();
  return Object.values(state.records)
    .filter((rec) => (!guildId ? true : rec.guildId === guildId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function upsertRestoredExpRecord(record: ExpRecord): void {
  const state = readState();
  if (!state.records[record.id]) {
    state.records[record.id] = record;
  }
  if (typeof record.expNumber === 'number' && record.expNumber > 0) {
    if (!state.usedNumbers.includes(record.expNumber)) {
      state.usedNumbers.push(record.expNumber);
    }
    if (state.nextExpNumber <= record.expNumber) {
      state.nextExpNumber = record.expNumber + 1;
    }
  }
  writeState(state);
}

export function getExpDraftMediaDir(guildId: string, userId: string): string {
  ensureDirs();
  const safeKey = `${guildId}_${userId}`.replace(/[^a-zA-Z0-9_-]/g, '');
  const dir = path.resolve(EXP_DRAFT_MEDIA_DIR, safeKey);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function clearExpDraftMediaDir(guildId: string, userId: string): void {
  const safeKey = `${guildId}_${userId}`.replace(/[^a-zA-Z0-9_-]/g, '');
  const dir = path.resolve(EXP_DRAFT_MEDIA_DIR, safeKey);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function getExpDraftMediaFilePath(guildId: string, userId: string, filename: string): string | null {
  const safeKey = `${guildId}_${userId}`.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeFile = path.basename(filename);
  if (!safeKey || !safeFile) return null;
  const dir = path.resolve(EXP_DRAFT_MEDIA_DIR, safeKey);
  const fullPath = path.resolve(dir, safeFile);
  if (!fullPath.startsWith(dir + path.sep)) return null;
  return fullPath;
}

export function promoteDraftMediaToExp(
  guildId: string,
  userId: string,
  expId: string,
  personPhotoFile: string | null | undefined,
  proofFiles: string[] | undefined,
): { personPhotoFile: string | null; proofFiles: string[] } {
  const expDir = getExpMediaDir(expId);
  let promotedPerson: string | null = null;
  const promotedProofs: string[] = [];

  if (personPhotoFile) {
    const src = getExpDraftMediaFilePath(guildId, userId, personPhotoFile);
    if (src && fs.existsSync(src)) {
      const destName = `source-person-${path.basename(personPhotoFile)}`;
      const dest = path.resolve(expDir, destName);
      fs.copyFileSync(src, dest);
      promotedPerson = destName;
    }
  }

  if (Array.isArray(proofFiles)) {
    for (let i = 0; i < proofFiles.length; i++) {
      const f = proofFiles[i];
      const src = getExpDraftMediaFilePath(guildId, userId, f);
      if (src && fs.existsSync(src)) {
        const destName = `source-proof-${i + 1}-${path.basename(f)}`;
        const dest = path.resolve(expDir, destName);
        fs.copyFileSync(src, dest);
        promotedProofs.push(destName);
      }
    }
  }

  clearExpDraftMediaDir(guildId, userId);
  return { personPhotoFile: promotedPerson, proofFiles: promotedProofs };
}

export function getExpMediaDir(expId: string): string {
  const safeId = expId.replace(/[^a-zA-Z0-9_-]/g, '');
  const dir = path.resolve(EXP_MEDIA_DIR, safeId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getExpMediaFilePath(expId: string, filename: string): string | null {
  const safeId = expId.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeFile = path.basename(filename);
  if (!safeId || !safeFile) return null;
  const dir = path.resolve(EXP_MEDIA_DIR, safeId);
  const fullPath = path.resolve(dir, safeFile);
  if (!fullPath.startsWith(dir + path.sep)) return null;
  return fullPath;
}

export function parseEvidenceLinks(raw: string): string[] {
  if (!raw.trim()) return [];
  const matches = raw.match(/https?:\/\/[^\s<>"']+/gi) || [];
  const valid: string[] = [];
  for (const rawUrl of matches) {
    const cleaned = rawUrl.replace(/[),.;]+$/, '');
    try {
      const parsed = new URL(cleaned);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') continue;
      const host = parsed.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        host.startsWith('169.254.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(host)
      ) {
        continue;
      }
      if (!valid.includes(parsed.toString())) {
        valid.push(parsed.toString());
      }
    } catch {
      // Ignore malformed URLs
    }
  }
  return valid.slice(0, 10);
}

export interface PrivacyValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Validates that at least one required text field was provided.
 */
export function validateExpNoPrivateData(fields: {
  involvedName?: string;
  description?: string;
  whatHappened?: string;
  whyWrong?: string;
  additionalInsults?: string;
  title?: string;
  information?: string;
  additionalText?: string;
  insultText?: string;
  closingText?: string;
  watermarkText?: string;
  mediaLinks?: string;
  otherLinks?: string;
}): PrivacyValidationResult {
  const combined = [
    fields.involvedName || '',
    fields.description || '',
    fields.whatHappened || '',
    fields.whyWrong || '',
    fields.additionalInsults || '',
    fields.title || '',
    fields.information || '',
    fields.additionalText || '',
    fields.insultText || '',
    fields.closingText || '',
    fields.watermarkText || '',
    fields.mediaLinks || '',
    fields.otherLinks || '',
  ]
    .join('\n')
    .trim();

  if (!combined) {
    return { ok: false, reason: 'Preencha as informações obrigatórias do relato.' };
  }

  return { ok: true };
}
