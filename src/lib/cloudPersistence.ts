import { signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { apiFetch } from './api';
import {
  auth,
  db,
  ensureFirestoreOnline,
  googleAuthProvider,
  handleFirestoreError,
  isOfflineFirestoreError,
  OperationType,
} from './firebase';
import type { BannerEventType, GuildItem, GuildWelcomeConfigResponse } from '../types';

async function withFirestoreReconnect<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isOfflineFirestoreError(err)) {
      await ensureFirestoreOnline();
      await new Promise((resolve) => setTimeout(resolve, 250));
      return await fn();
    }
    throw err;
  }
}

export interface PersistedBannerRule {
  enabled: boolean;
  channelId: string;
  channelName: string;
  title: string;
  message: string;
  hasImage: boolean;
  imageDataUrl: string | null;
}

export interface PersistedGuildSnapshot {
  guildId: string;
  guildName: string;
  discordUserId: string;
  welcome: PersistedBannerRule;
  leave: PersistedBannerRule;
  updatedAtMs: number;
}

interface LocalBackupStore {
  byGuild: Record<string, PersistedGuildSnapshot>;
  lastByDiscordUser: Record<string, PersistedGuildSnapshot>;
}

const LOCAL_BACKUP_KEY = 'aph_guild_backup_v1';
const MAX_CLOUD_DATA_URL_LEN = 850_000;

function sanitizeId(raw: string, maxLen = 40): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, maxLen) || 'default';
}

function readLocalBackupStore(): LocalBackupStore {
  try {
    const raw = localStorage.getItem(LOCAL_BACKUP_KEY);
    if (!raw) return { byGuild: {}, lastByDiscordUser: {} };
    const parsed = JSON.parse(raw) as Partial<LocalBackupStore>;
    return {
      byGuild: parsed.byGuild && typeof parsed.byGuild === 'object' ? parsed.byGuild : {},
      lastByDiscordUser:
        parsed.lastByDiscordUser && typeof parsed.lastByDiscordUser === 'object'
          ? parsed.lastByDiscordUser
          : {},
    };
  } catch {
    return { byGuild: {}, lastByDiscordUser: {} };
  }
}

function writeLocalBackupStore(store: LocalBackupStore): void {
  try {
    localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage quota exceeded; strip images as last resort
    try {
      const compact: LocalBackupStore = { byGuild: {}, lastByDiscordUser: {} };
      for (const [k, v] of Object.entries(store.byGuild)) {
        compact.byGuild[k] = {
          ...v,
          welcome: { ...v.welcome, imageDataUrl: null },
          leave: { ...v.leave, imageDataUrl: null },
        };
      }
      for (const [k, v] of Object.entries(store.lastByDiscordUser)) {
        compact.lastByDiscordUser[k] = {
          ...v,
          welcome: { ...v.welcome, imageDataUrl: null },
          leave: { ...v.leave, imageDataUrl: null },
        };
      }
      localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify(compact));
    } catch {
      // Ignore completely blocked storage
    }
  }
}

export function saveLocalGuildSnapshot(snapshot: PersistedGuildSnapshot): void {
  const store = readLocalBackupStore();
  store.byGuild[snapshot.guildId] = snapshot;
  if (snapshot.discordUserId) {
    store.lastByDiscordUser[snapshot.discordUserId] = snapshot;
  }
  writeLocalBackupStore(store);
}

export function loadLocalGuildSnapshot(
  guildId: string,
  discordUserId?: string | null,
): PersistedGuildSnapshot | null {
  const store = readLocalBackupStore();
  if (store.byGuild[guildId]) {
    return store.byGuild[guildId];
  }
  if (discordUserId && store.lastByDiscordUser[discordUserId]) {
    const preset = store.lastByDiscordUser[discordUserId];
    return {
      ...preset,
      guildId,
    };
  }
  return null;
}

export async function compressImageToCloudDataUrl(sourceUrl: string): Promise<string | null> {
  if (!sourceUrl) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const targetW = 960;
        const targetH = 480;
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(sourceUrl.length <= MAX_CLOUD_DATA_URL_LEN ? sourceUrl : null);
          return;
        }

        const scale = Math.max(targetW / img.width, targetH / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const dx = (targetW - drawW) / 2;
        const dy = (targetH - drawH) / 2;
        ctx.drawImage(img, dx, dy, drawW, drawH);

        for (const quality of [0.86, 0.72, 0.56]) {
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          if (dataUrl.length <= MAX_CLOUD_DATA_URL_LEN) {
            resolve(dataUrl);
            return;
          }
        }
        resolve(null);
      } catch {
        resolve(sourceUrl.length <= MAX_CLOUD_DATA_URL_LEN ? sourceUrl : null);
      }
    };
    img.onerror = () => {
      resolve(sourceUrl.startsWith('data:image/') && sourceUrl.length <= MAX_CLOUD_DATA_URL_LEN ? sourceUrl : null);
    };
    img.src = sourceUrl;
  });
}

export async function fetchAuthorizedImageAsCloudDataUrl(imageUrl: string): Promise<string | null> {
  try {
    const resp = await apiFetch(imageUrl);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const objUrl = URL.createObjectURL(blob);
    try {
      return await compressImageToCloudDataUrl(objUrl);
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  } catch {
    return null;
  }
}

export async function signInCloudBackup(): Promise<User> {
  const credential = await signInWithPopup(auth, googleAuthProvider);
  return credential.user;
}

export async function signOutCloudBackup(): Promise<void> {
  await signOut(auth);
}

export async function ensureCloudUserProfile(
  firebaseUser: User,
  discordUserId: string,
): Promise<void> {
  const uid = sanitizeId(firebaseUser.uid, 128);
  const userPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  try {
    await withFirestoreReconnect(async () => {
      const snap = await getDoc(userRef);
      const email = (firebaseUser.email || '').slice(0, 254);
      const displayName = (firebaseUser.displayName || '').slice(0, 120);
      const cleanDiscordId = discordUserId.slice(0, 40);

      if (!snap.exists()) {
        await setDoc(userRef, {
          ownerId: uid,
          email,
          displayName,
          discordUserId: cleanDiscordId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const existing = snap.data();
        const preservedDiscordId =
          cleanDiscordId ||
          (typeof existing.discordUserId === 'string' ? existing.discordUserId : '');
        if (
          existing.discordUserId !== preservedDiscordId ||
          existing.email !== email ||
          existing.displayName !== displayName
        ) {
          await updateDoc(userRef, {
            email,
            displayName,
            discordUserId: preservedDiscordId,
            updatedAt: serverTimestamp(),
          });
        }
      }
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }
}

async function saveCloudAsset(
  uid: string,
  guildId: string,
  eventType: BannerEventType,
  dataUrl: string | null,
): Promise<void> {
  const assetPath = `users/${uid}/guildConfigs/${guildId}/assets/${eventType}`;
  const assetRef = doc(db, 'users', uid, 'guildConfigs', guildId, 'assets', eventType);

  if (!dataUrl) {
    try {
      const existing = await getDoc(assetRef);
      if (existing.exists()) {
        await deleteDoc(assetRef);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, assetPath);
    }
    return;
  }

  const boundedDataUrl = dataUrl.slice(0, MAX_CLOUD_DATA_URL_LEN);

  try {
    const existing = await getDoc(assetRef);
    if (!existing.exists()) {
      await setDoc(assetRef, {
        ownerId: uid,
        guildId,
        eventType,
        dataUrl: boundedDataUrl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(assetRef, {
        dataUrl: boundedDataUrl,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, assetPath);
  }
}

export async function saveGuildSnapshotToCloud(
  firebaseUser: User,
  snapshot: PersistedGuildSnapshot,
): Promise<void> {
  const uid = sanitizeId(firebaseUser.uid, 128);
  const guildId = sanitizeId(snapshot.guildId, 40);
  await ensureCloudUserProfile(firebaseUser, snapshot.discordUserId);

  const configPath = `users/${uid}/guildConfigs/${guildId}`;
  const configRef = doc(db, 'users', uid, 'guildConfigs', guildId);

  const serializeRule = (r: PersistedBannerRule) => ({
    enabled: Boolean(r.enabled),
    channelId: (r.channelId || '').slice(0, 40),
    channelName: (r.channelName || '').slice(0, 120),
    title: (r.title || '').slice(0, 60),
    message: (r.message || '').slice(0, 300),
    hasImage: Boolean(r.imageDataUrl),
  });

  try {
    const existing = await getDoc(configRef);
    const cleanDiscordId = (snapshot.discordUserId || '').slice(0, 40);
    if (!existing.exists()) {
      await setDoc(configRef, {
        ownerId: uid,
        guildId,
        guildName: (snapshot.guildName || '').slice(0, 120),
        discordUserId: cleanDiscordId,
        welcome: serializeRule(snapshot.welcome),
        leave: serializeRule(snapshot.leave),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const prevData = existing.data();
      const preservedDiscordId =
        cleanDiscordId ||
        (typeof prevData.discordUserId === 'string' ? prevData.discordUserId : '');
      await updateDoc(configRef, {
        guildName: (snapshot.guildName || '').slice(0, 120),
        discordUserId: preservedDiscordId,
        welcome: serializeRule(snapshot.welcome),
        leave: serializeRule(snapshot.leave),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, configPath);
  }

  await saveCloudAsset(uid, guildId, 'welcome', snapshot.welcome.imageDataUrl);
  await saveCloudAsset(uid, guildId, 'leave', snapshot.leave.imageDataUrl);
}

async function loadCloudAsset(
  uid: string,
  guildId: string,
  eventType: BannerEventType,
): Promise<string | null> {
  const assetPath = `users/${uid}/guildConfigs/${guildId}/assets/${eventType}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'guildConfigs', guildId, 'assets', eventType));
    if (!snap.exists()) return null;
    const data = snap.data();
    return typeof data.dataUrl === 'string' ? data.dataUrl : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, assetPath);
  }
}

export async function loadGuildSnapshotFromCloud(
  firebaseUser: User,
  guildId: string,
): Promise<PersistedGuildSnapshot | null> {
  const uid = sanitizeId(firebaseUser.uid, 128);
  const cleanGuildId = sanitizeId(guildId, 40);
  const configPath = `users/${uid}/guildConfigs/${cleanGuildId}`;

  try {
    const snap = await getDoc(doc(db, 'users', uid, 'guildConfigs', cleanGuildId));
    if (!snap.exists()) return null;
    const data = snap.data();

    const welcomeData = (data.welcome || {}) as Record<string, unknown>;
    const leaveData = (data.leave || {}) as Record<string, unknown>;

    const [welcomeImg, leaveImg] = await Promise.all([
      welcomeData.hasImage ? loadCloudAsset(uid, cleanGuildId, 'welcome') : Promise.resolve(null),
      leaveData.hasImage ? loadCloudAsset(uid, cleanGuildId, 'leave') : Promise.resolve(null),
    ]);

    const updatedAtTs = data.updatedAt as { toMillis?: () => number } | undefined;

    return {
      guildId: cleanGuildId,
      guildName: typeof data.guildName === 'string' ? data.guildName : '',
      discordUserId: typeof data.discordUserId === 'string' ? data.discordUserId : '',
      welcome: {
        enabled: Boolean(welcomeData.enabled),
        channelId: typeof welcomeData.channelId === 'string' ? welcomeData.channelId : '',
        channelName: typeof welcomeData.channelName === 'string' ? welcomeData.channelName : '',
        title: typeof welcomeData.title === 'string' ? welcomeData.title : 'BEM-VINDO',
        message: typeof welcomeData.message === 'string' ? welcomeData.message : '',
        hasImage: Boolean(welcomeImg),
        imageDataUrl: welcomeImg,
      },
      leave: {
        enabled: Boolean(leaveData.enabled),
        channelId: typeof leaveData.channelId === 'string' ? leaveData.channelId : '',
        channelName: typeof leaveData.channelName === 'string' ? leaveData.channelName : '',
        title: typeof leaveData.title === 'string' ? leaveData.title : 'ATÉ LOGO',
        message: typeof leaveData.message === 'string' ? leaveData.message : '',
        hasImage: Boolean(leaveImg),
        imageDataUrl: leaveImg,
      },
      updatedAtMs: typeof updatedAtTs?.toMillis === 'function' ? updatedAtTs.toMillis() : Date.now(),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, configPath);
  }
}

export async function restoreSnapshotToBackend(
  guildId: string,
  snapshot: PersistedGuildSnapshot,
): Promise<GuildWelcomeConfigResponse | null> {
  try {
    const resp = await apiFetch(`/api/guilds/${guildId}/welcome-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        welcome: {
          enabled: snapshot.welcome.enabled,
          channelId: snapshot.welcome.channelId || null,
          channelName: snapshot.welcome.channelName || undefined,
          title: snapshot.welcome.title,
          message: snapshot.welcome.message,
          ...(snapshot.welcome.imageDataUrl
            ? { imageDataUrl: snapshot.welcome.imageDataUrl }
            : {}),
        },
        leave: {
          enabled: snapshot.leave.enabled,
          channelId: snapshot.leave.channelId || null,
          channelName: snapshot.leave.channelName || undefined,
          title: snapshot.leave.title,
          message: snapshot.leave.message,
          ...(snapshot.leave.imageDataUrl ? { imageDataUrl: snapshot.leave.imageDataUrl } : {}),
        },
      }),
    });

    if (!resp.ok) return null;
    return (await resp.json()) as GuildWelcomeConfigResponse;
  } catch {
    return null;
  }
}

/**
 * Syncs all managed guilds between the Express bot backend, Firestore cloud backup, and local mirror.
 * - If the backend lost its ephemeral config after a container restart (`hasSavedConfig === false`),
 *   restores from Firestore (first) or localStorage backup immediately so the Discord bot resumes working.
 * - If the backend has a saved config and Firestore doesn't (e.g. user just linked Google cloud backup),
 *   pushes it up to Firestore cleanly.
 */
export async function syncManagedGuildsWithCloud(
  guilds: GuildItem[],
  discordUserId: string,
  firebaseUser: User | null,
): Promise<number> {
  let restoredCount = 0;

  let cloudDocsByGuild: Record<string, Record<string, unknown>> = {};
  if (firebaseUser) {
    const uid = sanitizeId(firebaseUser.uid, 128);
    const listPath = `users/${uid}/guildConfigs`;
    try {
      const snap = await withFirestoreReconnect(async () => {
        const q = query(collection(db, 'users', uid, 'guildConfigs'), where('ownerId', '==', uid));
        return await getDocs(q);
      });
      for (const d of snap.docs) {
        cloudDocsByGuild[d.id] = d.data();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, listPath);
    }
  }

  for (const guild of guilds) {
    try {
      const resp = await apiFetch(`/api/guilds/${guild.id}/welcome-config`);
      if (!resp.ok) continue;
      const backendCfg = (await resp.json()) as GuildWelcomeConfigResponse;

      const cloudDoc = cloudDocsByGuild[guild.id];
      const cloudUpdatedAtTs = cloudDoc?.updatedAt as { toMillis?: () => number } | undefined;
      const cloudUpdatedAtMs =
        typeof cloudUpdatedAtTs?.toMillis === 'function' ? cloudUpdatedAtTs.toMillis() : 0;
      const backendUpdatedAtMs = Date.parse(backendCfg.updatedAt || '') || 0;
      const cloudIsNewer = Boolean(cloudDoc && cloudUpdatedAtMs > backendUpdatedAtMs + 5000);

      if (!backendCfg.hasSavedConfig || cloudIsNewer) {
        let snapshot: PersistedGuildSnapshot | null = null;
        if (firebaseUser && cloudDoc) {
          snapshot = await loadGuildSnapshotFromCloud(firebaseUser, guild.id);
        }
        if (!snapshot && !backendCfg.hasSavedConfig) {
          snapshot = loadLocalGuildSnapshot(guild.id, discordUserId);
        }

        if (snapshot && (snapshot.welcome.enabled || snapshot.leave.enabled || snapshot.welcome.channelId || snapshot.welcome.imageDataUrl)) {
          const restored = await restoreSnapshotToBackend(guild.id, snapshot);
          if (restored) {
            saveLocalGuildSnapshot({ ...snapshot, guildId: guild.id, guildName: guild.name, discordUserId });
            restoredCount += 1;
          }
        }
      } else if (firebaseUser && !cloudDoc) {
        const [welcomeImg, leaveImg] = await Promise.all([
          backendCfg.welcome.imageUrl
            ? fetchAuthorizedImageAsCloudDataUrl(backendCfg.welcome.imageUrl)
            : Promise.resolve(null),
          backendCfg.leave.imageUrl
            ? fetchAuthorizedImageAsCloudDataUrl(backendCfg.leave.imageUrl)
            : Promise.resolve(null),
        ]);

        const snapshot: PersistedGuildSnapshot = {
          guildId: guild.id,
          guildName: guild.name,
          discordUserId,
          welcome: {
            enabled: backendCfg.welcome.enabled,
            channelId: backendCfg.welcome.channelId ?? '',
            channelName: '',
            title: backendCfg.welcome.title,
            message: backendCfg.welcome.message,
            hasImage: Boolean(welcomeImg),
            imageDataUrl: welcomeImg,
          },
          leave: {
            enabled: backendCfg.leave.enabled,
            channelId: backendCfg.leave.channelId ?? '',
            channelName: '',
            title: backendCfg.leave.title,
            message: backendCfg.leave.message,
            hasImage: Boolean(leaveImg),
            imageDataUrl: leaveImg,
          },
          updatedAtMs: Date.now(),
        };

        await saveGuildSnapshotToCloud(firebaseUser, snapshot);
        saveLocalGuildSnapshot(snapshot);
      }
    } catch {
      // Continue syncing remaining guilds cleanly
    }
  }

  return restoredCount;
}

export async function syncExpRecordsWithCloud(
  firebaseUser: User | null,
  discordUserId: string,
  backendRecords: Array<{
    id: string;
    guildId: string;
    guildName: string;
    expNumber: number | null;
    expCode: string | null;
    format: 'carousel' | 'video';
    status: string;
    involvedName: string;
    description: string;
    whatHappened: string;
    whyWrong: string;
    tiktokPublishId: string | null;
    tiktokStatusText: string | null;
    createdAt: string;
    updatedAt: string;
  }>,
): Promise<boolean> {
  if (!firebaseUser) return false;
  const uid = sanitizeId(firebaseUser.uid, 128);
  await ensureCloudUserProfile(firebaseUser, discordUserId);

  const listPath = `users/${uid}/expRecords`;
  const cloudById: Record<string, Record<string, unknown>> = {};

  try {
    const q = query(collection(db, 'users', uid, 'expRecords'), where('ownerId', '==', uid));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      cloudById[d.id] = d.data();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, listPath);
  }

  // Push new or updated backend EXP records to Firestore
  for (const rec of backendRecords) {
    const cleanExpId = sanitizeId(rec.id, 40);
    const cleanGuildId = sanitizeId(rec.guildId, 40);
    const recPath = `users/${uid}/expRecords/${cleanExpId}`;
    const ref = doc(db, 'users', uid, 'expRecords', cleanExpId);
    const existingCloud = cloudById[cleanExpId];

    const mutableFields = {
      expNumber: typeof rec.expNumber === 'number' ? rec.expNumber : 0,
      expCode: (rec.expCode || '').slice(0, 32),
      status: (rec.status || 'pending').slice(0, 48),
      tiktokPublishId: (rec.tiktokPublishId || '').slice(0, 128),
      tiktokStatusText: (rec.tiktokStatusText || '').slice(0, 300),
      updatedAt: serverTimestamp(),
    };

    try {
      if (!existingCloud) {
        await setDoc(ref, {
          ownerId: uid,
          expId: cleanExpId,
          guildId: cleanGuildId,
          guildName: (rec.guildName || 'Servidor').slice(0, 120),
          format: rec.format === 'video' ? 'video' : 'carousel',
          involvedName: (rec.involvedName || '').slice(0, 100),
          description: (rec.description || '').slice(0, 240),
          whatHappened: (rec.whatHappened || '').slice(0, 1200),
          whyWrong: (rec.whyWrong || '').slice(0, 800),
          ...mutableFields,
          createdAt: serverTimestamp(),
        });
      } else if (
        existingCloud.status !== mutableFields.status ||
        existingCloud.expNumber !== mutableFields.expNumber ||
        existingCloud.tiktokPublishId !== mutableFields.tiktokPublishId
      ) {
        await updateDoc(ref, mutableFields);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, recPath);
    }
  }

  // Restore missing EXP records & monotonic floor back to backend if backend restarted
  const backendIds = new Set(backendRecords.map((r) => r.id));
  const missingInBackend = Object.values(cloudById).filter(
    (c) => typeof c.expId === 'string' && !backendIds.has(c.expId),
  );
  const maxCloudNumber = Object.values(cloudById).reduce(
    (acc, c) => (typeof c.expNumber === 'number' ? Math.max(acc, c.expNumber) : acc),
    0,
  );

  if (missingInBackend.length > 0 || maxCloudNumber > 0) {
    await apiFetch('/api/exp/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        maxExpNumber: maxCloudNumber,
        records: missingInBackend.map((c) => ({
          id: c.expId,
          guildId: c.guildId,
          guildName: c.guildName,
          expNumber: typeof c.expNumber === 'number' && c.expNumber > 0 ? c.expNumber : null,
          expCode: typeof c.expCode === 'string' && c.expCode ? c.expCode : null,
          format: c.format === 'video' ? 'video' : 'carousel',
          status: typeof c.status === 'string' ? c.status : 'pending',
          involvedName: typeof c.involvedName === 'string' ? c.involvedName : '',
          description: typeof c.description === 'string' ? c.description : '',
          whatHappened: typeof c.whatHappened === 'string' ? c.whatHappened : '',
          whyWrong: typeof c.whyWrong === 'string' ? c.whyWrong : '',
          tiktokPublishId:
            typeof c.tiktokPublishId === 'string' && c.tiktokPublishId ? c.tiktokPublishId : null,
          tiktokStatusText:
            typeof c.tiktokStatusText === 'string' && c.tiktokStatusText
              ? c.tiktokStatusText
              : null,
        })),
      }),
    }).catch(() => {});
    return missingInBackend.length > 0;
  }

  return false;
}

