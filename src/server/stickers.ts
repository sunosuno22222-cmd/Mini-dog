import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { Guild, User } from "discord.js";
import { getBotClient } from "./bot";

const execFileAsync = promisify(execFile);

export type StaticStickerKey =
  | "crown"
  | "ready"
  | "wait"
  | "reply"
  | "mic"
  | "trophy"
  | "lock";

interface CachedAppEmoji {
  id: string;
  name: string;
  tag: string;
}

interface StickerRuntimeStore {
  appId: string | null;
  appEmojisLoaded: boolean;
  byName: Map<string, CachedAppEmoji>;
  avatarSignatureByUser: Map<string, string>;
}

const gAny = globalThis as any;
if (!gAny.__callGameStickerStore) {
  gAny.__callGameStickerStore = {
    appId: null,
    appEmojisLoaded: false,
    byName: new Map<string, CachedAppEmoji>(),
    avatarSignatureByUser: new Map<string, string>(),
  } satisfies StickerRuntimeStore;
}
const store: StickerRuntimeStore = gAny.__callGameStickerStore;

const FALLBACK_GLYPHS: Record<StaticStickerKey, string> = {
  crown: "👑",
  ready: "✅",
  wait: "⏳",
  reply: "📩",
  mic: "🎙️",
  trophy: "🏆",
  lock: "🔒",
};

const STATIC_EMOJI_PREFIX = "fg_";

function getStaticEmojiName(key: StaticStickerKey): string {
  return `${STATIC_EMOJI_PREFIX}${key}`;
}

export function getUserAvatarEmojiName(userId: string): string {
  // Discord emoji name max 32 chars, alphanumeric + underscore only
  const cleanId = userId.replace(/[^0-9]/g, "").slice(-14) || "user";
  return `fg_u_${cleanId}`;
}

async function discordApiRequest<T = any>(
  endpoint: string,
  init: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) {
    return { ok: false, status: 0, data: null, text: "Token ausente" };
  }
  const res = await fetch(`https://discord.com/api/v10${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text().catch(() => "");
  let data: T | null = null;
  try {
    data = text ? (JSON.parse(text) as T) : null;
  } catch {}
  return { ok: res.ok, status: res.status, data, text };
}

async function resolveAppId(): Promise<string | null> {
  if (store.appId) return store.appId;
  const client = getBotClient();
  if (client?.application?.id) {
    store.appId = client.application.id;
    return store.appId;
  }
  if (client?.user?.id) {
    store.appId = client.user.id;
    return store.appId;
  }
  const res = await discordApiRequest<{ id?: string }>("/applications/@me");
  if (res.ok && res.data?.id) {
    store.appId = res.data.id;
    return store.appId;
  }
  return null;
}

async function loadExistingApplicationEmojis(forceRefresh = false): Promise<void> {
  if (store.appEmojisLoaded && !forceRefresh) return;
  const appId = await resolveAppId();
  if (!appId) return;

  const res = await discordApiRequest<{ items?: Array<{ id: string; name: string }> }>(
    `/applications/${appId}/emojis`
  );
  if (res.ok && res.data?.items) {
    store.byName.clear();
    for (const item of res.data.items) {
      if (item.id && item.name) {
        store.byName.set(item.name, {
          id: item.id,
          name: item.name,
          tag: `<:${item.name}:${item.id}>`,
        });
      }
    }
    store.appEmojisLoaded = true;
  }
}

async function renderStaticBadgePng(key: StaticStickerKey): Promise<Buffer> {
  const outFile = path.join(os.tmpdir(), `fg_${key}_${crypto.randomUUID()}.png`);
  try {
    let drawArgs: string[] = [];
    switch (key) {
      case "crown":
        drawArgs = [
          "-fill", "#fbbf24", "-stroke", "#fef3c7", "-strokewidth", "3",
          "-draw", "polygon 18,90 12,38 42,60 64,22 86,60 116,38 110,90",
          "-fill", "#f59e0b", "-stroke", "none",
          "-draw", "roundrectangle 18,92 110,108 6,6",
        ];
        break;
      case "ready":
        drawArgs = [
          "-fill", "#10b981", "-stroke", "#d1fae5", "-strokewidth", "4",
          "-draw", "circle 64,64 64,10",
          "-fill", "none", "-stroke", "#ffffff", "-strokewidth", "11",
          "-draw", "stroke-linecap round stroke-linejoin round polyline 40,66 56,82 88,46",
        ];
        break;
      case "wait":
        drawArgs = [
          "-fill", "#334155", "-stroke", "#94a3b8", "-strokewidth", "5",
          "-draw", "circle 64,64 64,10",
          "-fill", "none", "-stroke", "#f8fafc", "-strokewidth", "9",
          "-draw", "stroke-linecap round stroke-linejoin round polyline 64,34 64,64 84,76",
        ];
        break;
      case "reply":
        drawArgs = [
          "-fill", "#6366f1", "-stroke", "#e0e7ff", "-strokewidth", "4",
          "-draw", "roundrectangle 14,24 114,94 20,20",
          "-fill", "#6366f1", "-stroke", "none",
          "-draw", "polygon 36,92 24,114 60,92",
          "-fill", "none", "-stroke", "#ffffff", "-strokewidth", "8",
          "-draw", "stroke-linecap round stroke-linejoin round polyline 42,60 58,74 88,44",
        ];
        break;
      case "mic":
        drawArgs = [
          "-fill", "#ec4899", "-stroke", "#fce7f3", "-strokewidth", "4",
          "-draw", "roundrectangle 44,16 84,74 20,20",
          "-fill", "none", "-stroke", "#f8fafc", "-strokewidth", "8",
          "-draw", "stroke-linecap round arc 30,36 98,90 0,180",
          "-draw", "line 64,90 64,112",
          "-draw", "line 44,112 84,112",
        ];
        break;
      case "trophy":
        drawArgs = [
          "-fill", "#f59e0b", "-stroke", "#fef3c7", "-strokewidth", "3",
          "-draw", "polygon 32,24 96,24 88,68 64,82 40,68",
          "-fill", "none", "-stroke", "#fbbf24", "-strokewidth", "7",
          "-draw", "arc 16,28 38,58 90,270",
          "-draw", "arc 90,28 112,58 270,90",
          "-fill", "#fbbf24", "-stroke", "none",
          "-draw", "rectangle 56,80 72,100",
          "-draw", "roundrectangle 38,100 90,114 5,5",
        ];
        break;
      case "lock":
        drawArgs = [
          "-fill", "none", "-stroke", "#cbd5e1", "-strokewidth", "10",
          "-draw", "arc 40,18 88,64 180,360",
          "-fill", "#475569", "-stroke", "#cbd5e1", "-strokewidth", "4",
          "-draw", "roundrectangle 26,52 102,110 14,14",
          "-fill", "#fbbf24", "-stroke", "none",
          "-draw", "circle 64,78 64,70",
          "-draw", "rectangle 60,78 68,94",
        ];
        break;
    }

    await execFileAsync("convert", [
      "-size",
      "128x128",
      "xc:none",
      ...drawArgs,
      outFile,
    ]);
    return await fs.readFile(outFile);
  } finally {
    await fs.unlink(outFile).catch(() => {});
  }
}

async function renderCircularAvatarPng(
  avatarBuffer: Buffer,
  ringColor = "#94a3b8"
): Promise<Buffer> {
  const id = crypto.randomUUID();
  const inFile = path.join(os.tmpdir(), `av_in_${id}.png`);
  const outFile = path.join(os.tmpdir(), `av_out_${id}.png`);
  try {
    await fs.writeFile(inFile, avatarBuffer);
    await execFileAsync("convert", [
      inFile,
      "-resize",
      "128x128^",
      "-gravity",
      "center",
      "-extent",
      "128x128",
      "-alpha",
      "set",
      "(",
      "-size",
      "128x128",
      "xc:black",
      "-fill",
      "white",
      "-draw",
      "circle 64,64 64,4",
      ")",
      "-compose",
      "CopyOpacity",
      "-composite",
      "-stroke",
      ringColor,
      "-strokewidth",
      "5",
      "-fill",
      "none",
      "-draw",
      "circle 64,64 64,4",
      outFile,
    ]);
    return await fs.readFile(outFile);
  } finally {
    await fs.unlink(inFile).catch(() => {});
    await fs.unlink(outFile).catch(() => {});
  }
}

async function uploadApplicationEmoji(
  name: string,
  pngBuffer: Buffer,
  guildFallback?: Guild
): Promise<CachedAppEmoji | null> {
  const appId = await resolveAppId();
  const dataUri = `data:image/png;base64,${pngBuffer.toString("base64")}`;

  if (appId) {
    const existing = store.byName.get(name);
    if (existing) {
      await discordApiRequest(`/applications/${appId}/emojis/${existing.id}`, {
        method: "DELETE",
      }).catch(() => {});
      store.byName.delete(name);
    }

    const res = await discordApiRequest<{ id?: string; name?: string }>(
      `/applications/${appId}/emojis`,
      {
        method: "POST",
        body: JSON.stringify({ name, image: dataUri }),
      }
    );

    if (res.ok && res.data?.id) {
      const entry: CachedAppEmoji = {
        id: res.data.id,
        name: res.data.name || name,
        tag: `<:${res.data.name || name}:${res.data.id}>`,
      };
      store.byName.set(entry.name, entry);
      return entry;
    }

    // If name already existed remotely (400), refresh cache and return it
    if (res.status === 400) {
      await loadExistingApplicationEmojis(true);
      const refreshed = store.byName.get(name);
      if (refreshed) return refreshed;
    }
  }

  // Optional Guild emoji fallback if Application Emoji failed
  if (guildFallback) {
    try {
      const existingGuildEmoji = guildFallback.emojis.cache.find((e) => e.name === name);
      if (existingGuildEmoji) {
        const entry: CachedAppEmoji = {
          id: existingGuildEmoji.id,
          name: existingGuildEmoji.name || name,
          tag: `<:${existingGuildEmoji.name || name}:${existingGuildEmoji.id}>`,
        };
        store.byName.set(name, entry);
        return entry;
      }
      const created = await guildFallback.emojis.create({
        attachment: pngBuffer,
        name,
        reason: "Figurinha transparente personalizada do Jogo da Call",
      });
      const entry: CachedAppEmoji = {
        id: created.id,
        name: created.name || name,
        tag: `<:${created.name || name}:${created.id}>`,
      };
      store.byName.set(name, entry);
      return entry;
    } catch {}
  }

  return null;
}

/**
 * Ensures all static transparent game stickers exist and returns their inline tags.
 */
export async function ensureGameStickersReady(guild?: Guild): Promise<Record<StaticStickerKey, string>> {
  await loadExistingApplicationEmojis();

  const keys: StaticStickerKey[] = ["crown", "ready", "wait", "reply", "mic", "trophy", "lock"];
  const result = { ...FALLBACK_GLYPHS } as Record<StaticStickerKey, string>;

  await Promise.all(
    keys.map(async (key) => {
      const name = getStaticEmojiName(key);
      const cached = store.byName.get(name);
      if (cached) {
        result[key] = cached.tag;
        return;
      }
      try {
        const png = await renderStaticBadgePng(key);
        const uploaded = await uploadApplicationEmoji(name, png, guild);
        if (uploaded) {
          result[key] = uploaded.tag;
        }
      } catch (err) {
        console.warn(`[Stickers] Falha ao criar figurinha ${name}:`, (err as Error).message);
      }
    })
  );

  return result;
}

export function getStickerTag(key: StaticStickerKey): string {
  const cached = store.byName.get(getStaticEmojiName(key));
  return cached ? cached.tag : FALLBACK_GLYPHS[key];
}

/**
 * Generates and caches a transparent circular profile-picture sticker for a Discord user.
 */
export async function ensureUserAvatarSticker(
  user: User,
  guild?: Guild,
  isOwner = false
): Promise<string> {
  await loadExistingApplicationEmojis();

  const emojiName = getUserAvatarEmojiName(user.id);
  const avatarUrl = user.displayAvatarURL({ extension: "png", size: 256 });
  const signature = `${avatarUrl}|${isOwner ? "owner" : "player"}`;

  const existing = store.byName.get(emojiName);
  const lastSig = store.avatarSignatureByUser.get(user.id);
  if (existing && lastSig === signature) {
    return existing.tag;
  }

  // If already uploaded in Discord from previous run and no avatar change detected yet
  if (existing && !lastSig) {
    store.avatarSignatureByUser.set(user.id, signature);
    return existing.tag;
  }

  try {
    const imgRes = await fetch(avatarUrl, { signal: AbortSignal.timeout(8000) });
    if (imgRes.ok) {
      const rawBuf = Buffer.from(await imgRes.arrayBuffer());
      const ringColor = isOwner ? "#fbbf24" : "#64748b";
      const circPng = await renderCircularAvatarPng(rawBuf, ringColor);
      const uploaded = await uploadApplicationEmoji(emojiName, circPng, guild);
      if (uploaded) {
        store.avatarSignatureByUser.set(user.id, signature);
        return uploaded.tag;
      }
    }
  } catch (err) {
    console.warn(`[Stickers] Falha ao gerar figurinha do avatar de ${user.username}:`, (err as Error).message);
  }

  return existing ? existing.tag : isOwner ? getStickerTag("crown") : "👤";
}

export function getCachedUserAvatarSticker(userId: string, isOwner = false): string {
  const existing = store.byName.get(getUserAvatarEmojiName(userId));
  if (existing) return existing.tag;
  return isOwner ? getStickerTag("crown") : "👤";
}

/**
 * Formats a clean record/ficha line:
 * "(fig) user: detail" -> "<:sticker:id> **user**: detail"
 */
export function formatFichaRecord(
  figTag: string,
  userName: string,
  detail?: string
): string {
  const cleanName = userName.trim() || "Jogador";
  return detail !== undefined && detail.length > 0
    ? `${figTag} **${cleanName}**: ${detail}`
    : `${figTag} **${cleanName}**:`;
}

/**
 * Parses "(fig) username:" or "(fig:key) label:" syntax in templates into bolded structured records.
 */
export function formatStructuredLines(
  rawText: string,
  userStickerResolver?: (username: string) => string
): string {
  return rawText.replace(
    /\(fig(?::([a-z0-9_]+))?\)\s*([^:\n]+):/gi,
    (_full, key: string | undefined, label: string) => {
      const cleanLabel = label.trim();
      let fig = "▫️";
      if (key && key in FALLBACK_GLYPHS) {
        fig = getStickerTag(key as StaticStickerKey);
      } else if (userStickerResolver) {
        fig = userStickerResolver(cleanLabel);
      }
      return `${fig} **${cleanLabel}**:`;
    }
  );
}
