import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface PreferredMusicTrack {
  id: string;
  artist: string;
  title: string;
  previewUrl: string;
  artworkUrl: string | null;
  localPath: string;
  durationSec: number;
}

export interface RussianMusicCatalogItem {
  id: string;
  artist: string;
  title: string;
  previewUrl: string;
  artworkUrl: string | null;
  durationSec: number;
}

const RUSSIAN_ARTISTS = [
  'Migas',
  'Shluzov',
  '7leaf',
  'Xishqa',
  'DVRST',
  'kizaru',
  'MORGENSHTERN',
  'PHARAOH',
  'Molchat Doma',
  'IC3PEAK',
  'Scriptonite',
  'Miyagi & Andy Panda',
  'INTERWORLD',
  'Shadowraze',
  'PLAYAMANE',
  'Boulevard Depo',
  'Lida',
  'GONE.Fludd',
  'zxcursed',
] as const;

const RUSSIAN_FALLBACK_QUERIES = [
  'russian phonk',
  'russian trap',
  'russian rap',
  'russian post punk',
] as const;

const MUSIC_CACHE_DIR = path.resolve(process.cwd(), 'server', 'data', 'music-cache');
const MUSIC_HISTORY_FILE = path.resolve(process.cwd(), 'server', 'data', 'music-history.json');

interface ItunesTrackItem {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  trackTimeMillis?: number;
}

let cachedCatalog: RussianMusicCatalogItem[] = [];
let cachedCatalogAt = 0;

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function shuffleArray<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function makeTrackId(previewUrl: string): string {
  return crypto.createHash('sha1').update(previewUrl).digest('hex').slice(0, 14);
}

function readRecentTrackIds(): string[] {
  try {
    if (!fs.existsSync(MUSIC_HISTORY_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(MUSIC_HISTORY_FILE, 'utf-8')) as {
      recentIds?: string[];
    };
    return Array.isArray(parsed.recentIds) ? parsed.recentIds : [];
  } catch {
    return [];
  }
}

function recordUsedTrackId(trackId: string): void {
  try {
    fs.mkdirSync(path.dirname(MUSIC_HISTORY_FILE), { recursive: true });
    const recent = readRecentTrackIds().filter((id) => id !== trackId);
    recent.unshift(trackId);
    fs.writeFileSync(
      MUSIC_HISTORY_FILE,
      JSON.stringify({ recentIds: recent.slice(0, 20) }, null, 2),
      'utf-8',
    );
  } catch {
    // Non-blocking
  }
}

async function queryItunesTracks(term: string, exactArtistFilter?: string): Promise<ItunesTrackItem[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    const resp = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&limit=10`,
      { signal: controller.signal },
    );
    clearTimeout(timer);
    if (!resp.ok) return [];
    const data = (await resp.json()) as { results?: ItunesTrackItem[] };
    const results = Array.isArray(data.results) ? data.results : [];
    const valid = results.filter(
      (item) =>
        typeof item.previewUrl === 'string' &&
        item.previewUrl.startsWith('https://') &&
        typeof item.trackName === 'string' &&
        typeof item.artistName === 'string',
    );
    if (!exactArtistFilter) return valid;
    const needle = normalizeText(exactArtistFilter);
    const exact = valid.filter((item) => normalizeText(item.artistName || '').includes(needle));
    return exact.length > 0 ? exact : valid.slice(0, 3);
  } catch {
    return [];
  }
}

export async function downloadAudioPreview(previewUrl: string, cacheKey: string): Promise<string | null> {
  if (!previewUrl || !previewUrl.startsWith('https://')) return null;
  fs.mkdirSync(MUSIC_CACHE_DIR, { recursive: true });
  const safeKey = cacheKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const outPath = path.resolve(MUSIC_CACHE_DIR, `${safeKey}.m4a`);

  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 8_000) {
    return outPath;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const resp = await fetch(previewUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.byteLength < 8_000) return null;
    fs.writeFileSync(outPath, buf);
    return outPath;
  } catch {
    return null;
  }
}

/**
 * Queries a curated catalog of Russian music artists (phonk, trap, rap, post-punk, wave)
 * so the site can let users listen/choose OR auto-rotate a different Russian song per carousel.
 */
export async function listRussianMusicTracks(
  limit = 14,
  forceRefresh = false,
): Promise<RussianMusicCatalogItem[]> {
  if (!forceRefresh && cachedCatalog.length > 0 && Date.now() - cachedCatalogAt < 5 * 60 * 1000) {
    return cachedCatalog.slice(0, limit);
  }

  const pickedArtists = shuffleArray(RUSSIAN_ARTISTS).slice(0, 8);
  const rawBatches = await Promise.all(pickedArtists.map((artist) => queryItunesTracks(artist, artist)));
  let flat = rawBatches.flat();

  if (flat.length < 6) {
    const fallbackBatches = await Promise.all(
      shuffleArray(RUSSIAN_FALLBACK_QUERIES)
        .slice(0, 2)
        .map((q) => queryItunesTracks(q)),
    );
    flat = [...flat, ...fallbackBatches.flat()];
  }

  const deduped = new Map<string, RussianMusicCatalogItem>();
  for (const item of shuffleArray(flat)) {
    if (!item.previewUrl || !item.artistName || !item.trackName) continue;
    const id = makeTrackId(item.previewUrl);
    if (deduped.has(id)) continue;
    deduped.set(id, {
      id,
      artist: item.artistName,
      title: item.trackName,
      previewUrl: item.previewUrl,
      artworkUrl: item.artworkUrl100 || null,
      durationSec: 29,
    });
  }

  const list = Array.from(deduped.values());
  if (list.length > 0) {
    cachedCatalog = list;
    cachedCatalogAt = Date.now();
  }
  return list.slice(0, limit);
}

/**
 * Picks a Russian track (honoring an explicit choice if supplied, otherwise choosing an
 * unseen Russian track not in recent history so every EXP carousel gets a different audio).
 */
export async function selectRussianTrackForPost(preferred?: {
  id?: string;
  previewUrl?: string;
  artist?: string;
  title?: string;
} | null): Promise<PreferredMusicTrack | null> {
  if (preferred?.previewUrl && preferred.previewUrl.startsWith('https://')) {
    const id = preferred.id || makeTrackId(preferred.previewUrl);
    const localPath = await downloadAudioPreview(
      preferred.previewUrl,
      `${preferred.artist || 'ru'}_${id}`,
    );
    if (localPath) {
      recordUsedTrackId(id);
      return {
        id,
        artist: preferred.artist || 'Música Russa',
        title: preferred.title || 'Faixa Selecionada',
        previewUrl: preferred.previewUrl,
        artworkUrl: null,
        localPath,
        durationSec: 29,
      };
    }
  }

  let catalog = await listRussianMusicTracks(18, false);
  if (preferred?.id) {
    const matched = catalog.find((t) => t.id === preferred.id);
    if (matched) {
      const localPath = await downloadAudioPreview(
        matched.previewUrl,
        `${matched.artist}_${matched.id}`,
      );
      if (localPath) {
        recordUsedTrackId(matched.id);
        return { ...matched, localPath };
      }
    }
  }

  const recentIds = new Set(readRecentTrackIds());
  let unseen = catalog.filter((t) => !recentIds.has(t.id));
  if (unseen.length === 0) {
    catalog = await listRussianMusicTracks(18, true);
    unseen = catalog.filter((t) => !recentIds.has(t.id));
  }
  const pool = unseen.length > 0 ? unseen : catalog;

  for (const pick of shuffleArray(pool)) {
    const localPath = await downloadAudioPreview(pick.previewUrl, `${pick.artist}_${pick.id}`);
    if (localPath) {
      recordUsedTrackId(pick.id);
      return {
        id: pick.id,
        artist: pick.artist,
        title: pick.title,
        previewUrl: pick.previewUrl,
        artworkUrl: pick.artworkUrl,
        localPath,
        durationSec: pick.durationSec,
      };
    }
  }

  return null;
}

export async function selectRandomPreferredTrack(): Promise<PreferredMusicTrack | null> {
  return selectRussianTrackForPost(null);
}
