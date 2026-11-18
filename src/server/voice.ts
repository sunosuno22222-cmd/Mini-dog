import {
  joinVoiceChannel,
  getVoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  AudioPlayer,
  VoiceConnection,
} from "@discordjs/voice";
import { getBotClient } from "./bot";
import * as gtts from "google-tts-api";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

export interface VoicePlaybackEvent {
  type: "speech:start" | "speech:end" | "speech:idle";
  guildId: string;
  clipId?: string;
  timestamp: number;
  meta?: {
    kind?: string;
    displayText?: string;
    userId?: string;
    username?: string;
    avatar?: string | null;
    questionNumber?: number;
    totalQuestions?: number;
    question?: string;
    answer?: string;
    didAnswer?: boolean;
    totalPoints?: number;
    winningAnswer?: string | null;
    explanation?: string;
  };
}

const voiceEventListeners = new Set<(ev: VoicePlaybackEvent) => void>();

export function onVoicePlaybackEvent(listener: (ev: VoicePlaybackEvent) => void): () => void {
  voiceEventListeners.add(listener);
  return () => {
    voiceEventListeners.delete(listener);
  };
}

interface GuildVoiceSession {
  connection: VoiceConnection;
  player: AudioPlayer;
  channelId: string;
  channelName: string;
  queue: string[];
  isPlaying: boolean;
}

const voiceSessions = new Map<string, GuildVoiceSession>();

/**
 * Returns current voice status for a guild (including live members in the voice channel)
 */
export function getVoiceSessionStatus(guildId: string, targetChannelId?: string) {
  const session = voiceSessions.get(guildId);
  const client = getBotClient();
  const activeChannelId = session?.channelId || targetChannelId || null;

  let membersInCall: Array<{ id: string; username: string; avatar: string | null; bot: boolean }> = [];
  if (client && client.isReady() && activeChannelId) {
    const guild = client.guilds.cache.get(guildId);
    const chan = guild?.channels.cache.get(activeChannelId);
    if (chan && chan.isVoiceBased()) {
      membersInCall = chan.members.map((m) => ({
        id: m.id,
        username: m.displayName || m.user.username,
        avatar: m.user.displayAvatarURL({ size: 64 }),
        bot: Boolean(m.user.bot),
      }));
    }
  }

  if (!session) {
    return {
      connected: false,
      channelId: null,
      channelName: null,
      selfDeaf: true,
      isPlaying: false,
      membersInCall,
      serverRegion: "us-east5 (EUA)",
    };
  }

  return {
    connected: true,
    channelId: session.channelId,
    channelName: session.channelName,
    selfDeaf: true,
    isPlaying: session.isPlaying,
    membersInCall,
    serverRegion: "us-east5 (EUA)",
  };
}

/**
 * Connects the bot to a voice channel with deafened mode (escuta desligada: selfDeaf: true)
 */
export async function joinVoiceCall(guildId: string, channelId: string): Promise<{ success: boolean; channelName: string }> {
  const client = getBotClient();
  if (!client || !client.isReady()) {
    throw new Error("Bot Discord não está conectado ao Gateway.");
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    throw new Error(`Servidor ${guildId} não encontrado no bot.`);
  }

  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isVoiceBased()) {
    throw new Error(`Canal ${channelId} não é um canal de voz válido.`);
  }

  // Check if already in this voice channel
  const existing = voiceSessions.get(guildId);
  if (existing && existing.channelId === channelId) {
    return { success: true, channelName: channel.name };
  }

  // Disconnect previous connection if in a different channel
  if (existing) {
    try {
      existing.connection.destroy();
    } catch {}
    voiceSessions.delete(guildId);
  }

  console.log(`[Discord Voice] Entrando no canal de voz "${channel.name}" (${channelId}) com ESCUTA DESLIGADA (selfDeaf: true)...`);

  const connection = joinVoiceChannel({
    channelId,
    guildId,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true, // Escuta desligada
    selfMute: false, // Pode falar
  });

  const player = createAudioPlayer();
  connection.subscribe(player);

  const session: GuildVoiceSession = {
    connection,
    player,
    channelId,
    channelName: channel.name,
    queue: [],
    isPlaying: false,
  };

  voiceSessions.set(guildId, session);

  // Wait for connection to be ready
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 10_000);
    console.log(`[Discord Voice] ✅ Conectado com sucesso na call "${channel.name}"!`);
  } catch (err) {
    console.error(`[Discord Voice] Falha ao conectar no canal de voz:`, err);
    connection.destroy();
    voiceSessions.delete(guildId);
    throw new Error("Não foi possível conectar ao canal de voz dentro do tempo limite.");
  }

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      console.log(`[Discord Voice] Desconectado da call no servidor ${guild.name}`);
      try {
        connection.destroy();
      } catch {}
      voiceSessions.delete(guildId);
    }
  });

  player.on(AudioPlayerStatus.Idle, () => {
    setTimeout(() => {
      session.isPlaying = false;
      processNextInQueue(guildId);
    }, 450);
  });

  player.on("error", (error) => {
    console.error("[Discord Voice Audio Error]:", error);
    setTimeout(() => {
      session.isPlaying = false;
      processNextInQueue(guildId);
    }, 300);
  });

  return { success: true, channelName: channel.name };
}

/**
 * Leaves the voice call
 */
export function leaveVoiceCall(guildId: string): boolean {
  const session = voiceSessions.get(guildId);
  const existingConn = getVoiceConnection(guildId);

  if (session) {
    try {
      session.player.stop();
      session.connection.destroy();
    } catch {}
    voiceSessions.delete(guildId);
  } else if (existingConn) {
    try {
      existingConn.destroy();
    } catch {}
  }

  return true;
}

/**
 * Waits until all pending TTS synthesis + voice playback items finish for a guild
 */
export async function waitForVoiceQueueIdle(guildId: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const chain = speechChains.get(guildId);
    if (chain) {
      await chain.catch(() => {});
    }
    const session = voiceSessions.get(guildId);
    if (!session) return;
    if (!session.isPlaying && session.queue.length === 0) {
      return;
    }
    await new Promise((r) => setTimeout(r, 350));
  }
}

async function applyFfmpegVoiceFilter(inputBuffer: Buffer, filterChain: string): Promise<Buffer> {
  const tmpId = crypto.randomBytes(8).toString("hex");
  const inputPath = path.join(os.tmpdir(), `tts_in_${tmpId}.mp3`);
  const outputPath = path.join(os.tmpdir(), `tts_out_${tmpId}.mp3`);

  try {
    await fs.writeFile(inputPath, inputBuffer);

    await new Promise((resolve, reject) => {
      const args = [
        "-y",
        "-i", inputPath,
        "-af", filterChain,
        "-f", "mp3",
        outputPath,
      ];
      const proc = spawn("ffmpeg", args);
      let errLog = "";
      proc.stderr.on("data", (d) => { errLog += d.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve(true);
        else reject(new Error(`FFmpeg exited with code ${code}: ${errLog.slice(-300)}`));
      });
    });

    const outBuffer = await fs.readFile(outputPath);
    return outBuffer;
  } catch (err) {
    console.warn("[Voice DSP Filter Warning]:", (err as Error).message);
    return inputBuffer;
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}

async function processNextInQueue(guildId: string) {
  const session = voiceSessions.get(guildId);
  if (!session || session.queue.length === 0 || session.isPlaying) {
    return;
  }

  const audioUrl = session.queue.shift();
  if (!audioUrl) return;

  session.isPlaying = true;
  try {
    let buffer: Buffer;
    if (audioUrl.startsWith("data:audio/mpeg;base64,")) {
      const base64Data = audioUrl.split(",")[1];
      buffer = Buffer.from(base64Data, "base64");
    } else {
      const res = await fetch(audioUrl);
      if (!res.ok) throw new Error(`Falha ao obter áudio TTS: HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    }
    const resource = createAudioResource(Readable.from(buffer));
    session.player.play(resource);
  } catch (err) {
    console.error("[TTS Queue Error]:", err);
    session.isPlaying = false;
    processNextInQueue(guildId);
  }
}

export interface ClonedVoiceEntry {
  id: string;
  name: string;
  sampleBase64: string;
  mcpVoiceId?: string;
  createdAt: number;
}

const CLONED_VOICES_FILE = path.join(process.cwd(), "cloned_voices_data.json");
const clonedVoicesMap = new Map<string, ClonedVoiceEntry>();

async function loadClonedVoicesFromDisk() {
  try {
    const raw = await fs.readFile(CLONED_VOICES_FILE, "utf8");
    const arr: ClonedVoiceEntry[] = JSON.parse(raw);
    for (const v of arr) {
      clonedVoicesMap.set(v.id, v);
    }
  } catch {}
}
loadClonedVoicesFromDisk().catch(() => {});

async function saveClonedVoicesToDisk() {
  try {
    const arr = Array.from(clonedVoicesMap.values());
    await fs.writeFile(CLONED_VOICES_FILE, JSON.stringify(arr, null, 2));
  } catch (err) {
    console.error("[Cloned Voices Save Error]:", err);
  }
}

export function getAllClonedVoices(): ClonedVoiceEntry[] {
  return Array.from(clonedVoicesMap.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteClonedVoice(id: string): Promise<boolean> {
  const existing = clonedVoicesMap.get(id);
  if (!existing) return false;
  clonedVoicesMap.delete(id);
  await saveClonedVoicesToDisk();
  return true;
}

export async function cloneAndSaveVoice(
  voiceName: string,
  sampleBase64: string,
  apiKey?: string
): Promise<ClonedVoiceEntry> {
  if (!sampleBase64) {
    throw new Error("Áudio de referência não fornecido para clonagem.");
  }

  const cleanBase64 = sampleBase64.includes(",") ? sampleBase64.split(",")[1] : sampleBase64;
  const token = apiKey || process.env.ANYTOSPEECH_API_KEY || DEFAULT_ANYTOSPEECH_KEY;
  const voiceId = `clone_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  let mcpVoiceId: string | undefined = undefined;

  // Attempt voice cloning on AnyToSpeech MCP
  try {
    console.log(`[Voice Studio] Clonando voz "${voiceName}" no servidor MCP AnyToSpeech...`);
    const res = await fetch("https://anytospeech.com/api/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Authorization": `Bearer ${token}`,
        "x-app-key": token,
        "User-Agent": "ProjectPhoenix-DiscordBot/1.0",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "voice_clone",
          arguments: {
            voice_name: voiceName.trim() || "Minha Voz Clonada",
            language: "pt-BR",
            consent_confirmed: true,
            relationship: "myself",
            samples_base64: [cleanBase64],
            remove_background_noise: true,
          },
        },
        id: Date.now(),
      }),
    });

    if (res.ok) {
      const responseText = await res.text();
      let jsonStr = responseText;
      if (responseText.includes("data: ")) {
        jsonStr = responseText.slice(responseText.indexOf("data: ") + 6).trim();
      }
      const data = JSON.parse(jsonStr);
      const cloneResult = data?.result?.structuredContent || data?.result;
      if (cloneResult) {
        mcpVoiceId = cloneResult.voiceId || cloneResult.voice_id || cloneResult.id || cloneResult.cloned_voice_id;
        console.log(`[Voice Studio] ✅ Voz clonada com sucesso na API AnyToSpeech! ID: ${mcpVoiceId || voiceId}`);
      }
    }
  } catch (err) {
    console.warn("[Voice Studio MCP Clone Warning]:", (err as Error).message);
  }

  const entry: ClonedVoiceEntry = {
    id: voiceId,
    name: voiceName.trim() || "Minha Voz Clonada",
    sampleBase64,
    mcpVoiceId,
    createdAt: Date.now(),
  };

  clonedVoicesMap.set(entry.id, entry);
  await saveClonedVoicesToDisk();

  return entry;
}

export const CAPCUT_VOICES: Record<string, { id: string; name: string; desc: string }> = {
  // --- VOZES PORTUGUESAS MASCULINAS (TIKTOK PT-BR) ---
  narrator: {
    id: "br_005",
    name: "🎙️ Lucas / Narrador (PT-BR Masculino)",
    desc: "Voz masculina brasileira clássica de narrador do TikTok",
  },
  tiktok_contra: {
    id: "ICL_br_male_212M_LuizS",
    name: "🧔 Contra / Luiz (PT-BR Masculino)",
    desc: "Voz masculina brasileira diferente e expressiva do TikTok",
  },
  tiktok_bueno: {
    id: "pt_male_bueno",
    name: "⚽ Galvão Bueno (PT-BR Masculino)",
    desc: "Voz masculina brasileira icônica de locutor esportivo do TikTok",
  },
  tiktok_bv_male: {
    id: "BV531_streaming",
    name: "🎧 Bruno (PT-BR Masculino)",
    desc: "Voz masculina portuguesa alternativa do motor TikTok/ByteDance",
  },

  // --- VOZES PORTUGUESAS FEMININAS (TIKTOK PT-BR) ---
  tiktok_laizza: {
    id: "pt_female_laizza",
    name: "👩 Laizza (PT-BR Feminino)",
    desc: "Voz feminina brasileira marcante e natural do TikTok",
  },
  lhays_anime: {
    id: "pt_female_lhays",
    name: "🎀 Lhays Macedo (PT-BR Feminino)",
    desc: "Voz oficial da dubladora de animes no Brasil no TikTok",
  },
  tiktok_ivete: {
    id: "bp_female_ivete",
    name: "🎤 Ivete Sangalo (PT-BR Feminino)",
    desc: "Voz feminina brasileira carismática e animada do TikTok",
  },
  tiktok_ludmilla: {
    id: "bp_female_ludmilla",
    name: "🎶 Ludmilla (PT-BR Feminino)",
    desc: "Voz feminina brasileira estilizada e expressiva do TikTok",
  },
  garota_timida: {
    id: "br_003",
    name: "🌸 Júlia / Tímida (PT-BR Feminino)",
    desc: "Voz feminina brasileira suave do TikTok",
  },
  tiktok_br_f1: {
    id: "br_001",
    name: "✨ Camila (PT-BR Feminino 1)",
    desc: "Voz feminina brasileira padrão 1 do TikTok",
  },
  tiktok_br_f3: {
    id: "br_004",
    name: "💎 Ana (PT-BR Feminino 3)",
    desc: "Voz feminina brasileira padrão 3 do TikTok",
  },

  // --- VOZES EXCLUSIVAS ENGRAÇADAS EM PORTUGUÊS (DONO DA PARTIDA 👑) ---
  tiktok_funny_male: {
    id: "ICL_br_male_212M_LuizS",
    name: "🤡 Zé Maluco / Esquilo (PT-BR Masculina Engraçada · Exclusiva 👑)",
    desc: "Voz masculina engraçada acelerada em português exclusiva de quem começa o jogo",
  },
  tiktok_funny_male_grumpy: {
    id: "pt_male_bueno",
    name: "🐸 Pato / Voz Engrossada (PT-BR Masculina Engraçada · Exclusiva 👑)",
    desc: "Voz masculina engraçada grave e trêmula em português exclusiva de quem começa o jogo",
  },
  tiktok_funny_female: {
    id: "pt_female_laizza",
    name: "🤪 Paty Esquilo / Maluca (PT-BR Feminina Engraçada · Exclusiva 👑)",
    desc: "Voz feminina engraçada em português exclusiva de quem começa o jogo",
  },
  tiktok_funny_female_drama: {
    id: "bp_female_ivete",
    name: "🎭 Tia Dramática / Doida (PT-BR Feminina Engraçada · Exclusiva 👑)",
    desc: "Voz feminina engraçada grave e dramática em português exclusiva de quem começa o jogo",
  },

  // --- MOTORES ESPECIAIS ---
  google_tts: {
    id: "google_tts",
    name: "🤖 Voz do Google (Tradutor)",
    desc: "A voz clássica do Google Tradutor em português do Brasil",
  },
  anytospeech_mcp: {
    id: "anytospeech_mcp",
    name: "⚡ AnyToSpeech MCP Server",
    desc: "Geração ultra-rápida via protocolo MCP (AnyToSpeech API)",
  },
};

export const FUNNY_PT_VOICE_FILTERS: Record<
  string,
  { baseTikTokVoice: string; fallbackTikTokVoices: string[]; ffmpegFilter: string; label: string }
> = {
  tiktok_funny_male: {
    baseTikTokVoice: "ICL_br_male_212M_LuizS",
    fallbackTikTokVoices: ["br_005", "pt_male_bueno", "BV531_streaming"],
    ffmpegFilter: "rubberband=pitch=1.34:tempo=1.12,vibrato=f=7:d=0.22",
    label: "🤡 Zé Maluco / Esquilo (PT-BR Masculina Engraçada 👑)",
  },
  tiktok_funny_male_grumpy: {
    baseTikTokVoice: "pt_male_bueno",
    fallbackTikTokVoices: ["ICL_br_male_212M_LuizS", "br_005", "BV531_streaming"],
    ffmpegFilter: "rubberband=pitch=0.72:tempo=1.06,tremolo=f=14:d=0.35",
    label: "🐸 Pato / Voz Engrossada (PT-BR Masculina Engraçada 👑)",
  },
  tiktok_funny_female: {
    baseTikTokVoice: "pt_female_laizza",
    fallbackTikTokVoices: ["pt_female_lhays", "bp_female_ivete", "br_003"],
    ffmpegFilter: "rubberband=pitch=1.36:tempo=1.12,vibrato=f=7.5:d=0.22",
    label: "🤪 Paty Esquilo / Maluca (PT-BR Feminina Engraçada 👑)",
  },
  tiktok_funny_female_drama: {
    baseTikTokVoice: "bp_female_ivete",
    fallbackTikTokVoices: ["pt_female_laizza", "pt_female_lhays", "br_003"],
    ffmpegFilter: "rubberband=pitch=0.78:tempo=0.96,chorus=0.6:0.9:45:0.3:0.25:2",
    label: "🎭 Tia Dramática / Doida (PT-BR Feminina Engraçada 👑)",
  },
};

const DEFAULT_ANYTOSPEECH_KEY = "ats_c0a659249daf3b842f0402b44278467500e89e990f4398054bbf8da4115a6b75";

/**
 * MCP Server Integration for AnyToSpeech / Custom Fast MCP Speech Generators
 */
export async function generateSpeechViaMCP(
  text: string,
  voiceKey = "Kore",
  apiKey?: string,
  customMcpUrl = "https://anytospeech.com/api/mcp",
  sampleBase64?: string,
  expression = "neutral"
): Promise<string | null> {
  const token = apiKey || process.env.ANYTOSPEECH_API_KEY || process.env.MCP_TTS_KEY || DEFAULT_ANYTOSPEECH_KEY;
  const mcpUrl = customMcpUrl.trim() || "https://anytospeech.com/api/mcp";
  const cleanSample = sampleBase64 ? (sampleBase64.includes(",") ? sampleBase64.split(",")[1] : sampleBase64) : undefined;
  const expr = (expression || "neutral").toLowerCase();

  try {
    console.log(`[AnyToSpeech MCP] Enviando fala via MCP (${mcpUrl}) | Voz: ${voiceKey} | Expressão: ${expr} | Texto: "${text.substring(0, 40)}..."`);

    const mcpRes = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Authorization": `Bearer ${token}`,
        "x-app-key": token,
        "User-Agent": "ProjectPhoenix-DiscordBot/1.0",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "speech_synthesize",
          arguments: {
            text,
            voice: voiceKey && voiceKey !== "anytospeech_mcp" ? voiceKey : "Kore",
            voice_id: voiceKey,
            language: "pt-BR",
            emotion: expr,
            expression: expr,
            style: expr,
            voice_style: expr,
            sample_base64: cleanSample,
            samples_base64: cleanSample ? [cleanSample] : undefined,
            reference_audio_base64: cleanSample,
          },
        },
        id: Date.now(),
      }),
    });

    if (mcpRes.ok) {
      const responseText = await mcpRes.text();
      let jsonStr = responseText;
      if (responseText.includes("data: ")) {
        jsonStr = responseText.slice(responseText.indexOf("data: ") + 6).trim();
      }

      const data = JSON.parse(jsonStr);
      const resObj = data?.result?.structuredContent || data?.result;
      const structuredArtifacts = resObj?.artifacts || data?.result?.artifacts;

      if (Array.isArray(structuredArtifacts) && structuredArtifacts[0]?.url) {
        const audioUrl = structuredArtifacts[0].url;
        console.log(`[AnyToSpeech MCP] ✅ Áudio MP3 gerado com sucesso via MCP: ${audioUrl}`);
        return audioUrl;
      }

      // Check base64 audio response fields
      const audioB64 = resObj?.audio_base64 || resObj?.audioBase64 || resObj?.audio_data || data?.audio_base64;
      if (audioB64) {
        console.log(`[AnyToSpeech MCP] ✅ Áudio Base64 gerado com sucesso via MCP!`);
        return audioB64.startsWith("data:") ? audioB64 : `data:audio/mpeg;base64,${audioB64}`;
      }

      // Check direct URL fields
      const directUrl = resObj?.url || resObj?.audio_url || resObj?.audioUrl;
      if (directUrl && typeof directUrl === "string") {
        return directUrl;
      }

      // Check text fallback in content
      const textContent = data?.result?.content?.[0]?.text;
      if (textContent) {
        try {
          const inner = JSON.parse(textContent);
          if (inner.artifacts?.[0]?.url) {
            return inner.artifacts[0].url;
          }
          if (inner.audio_base64 || inner.audioBase64) {
            const b64 = inner.audio_base64 || inner.audioBase64;
            return b64.startsWith("data:") ? b64 : `data:audio/mpeg;base64,${b64}`;
          }
        } catch {}
      }
    }
  } catch (err) {
    console.warn("[AnyToSpeech MCP Warning]:", (err as Error).message);
  }

  return null;
}

async function fetchUrlAsBuffer(url: string): Promise<Buffer> {
  if (url.startsWith("data:")) {
    const base64Data = url.split(",")[1] || "";
    return Buffer.from(base64Data, "base64");
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao obter áudio TTS: HTTP ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function splitTextForTikTok(text: string, maxBytes = 220): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  if (Buffer.byteLength(normalized, "utf8") <= maxBytes) {
    return [normalized];
  }

  const chunks: string[] = [];
  const words = normalized.split(" ");
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (Buffer.byteLength(candidate, "utf8") <= maxBytes) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      if (Buffer.byteLength(word, "utf8") > maxBytes) {
        let slice = "";
        for (const ch of word) {
          if (Buffer.byteLength(slice + ch, "utf8") > maxBytes) {
            chunks.push(slice);
            slice = ch;
          } else {
            slice += ch;
          }
        }
        current = slice;
      } else {
        current = word;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function fetchTikTokTtsAudioBuffer(text: string, tiktokVoiceId: string): Promise<Buffer | null> {
  const chunks = splitTextForTikTok(text, 220);
  if (chunks.length === 0) return null;

  const chunkBuffers: Buffer[] = [];
  for (const chunk of chunks) {
    let chunkBuf: Buffer | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const ttsRes = await fetch("https://tiktok-tts.weilnet.workers.dev/api/generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: chunk,
            voice: tiktokVoiceId,
          }),
          signal: AbortSignal.timeout(9000),
        });
        if (ttsRes.ok) {
          const ttsData = (await ttsRes.json()) as { success?: boolean; data?: string; error?: string };
          if (ttsData?.success && ttsData.data) {
            chunkBuf = Buffer.from(ttsData.data, "base64");
            break;
          }
        }
      } catch (err) {
        if (attempt === 3) {
          console.warn(`[TikTok TTS] Falha na tentativa ${attempt} para voz ${tiktokVoiceId}:`, (err as Error).message);
        }
      }
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 250 * attempt));
      }
    }
    if (!chunkBuf) return null;
    chunkBuffers.push(chunkBuf);
  }

  return Buffer.concat(chunkBuffers);
}

function isRawTikTokVoiceId(voiceKey: string): boolean {
  return /^(br_|pt_|en_|es_|fr_|de_|jp_|kr_|ICL_|BV\d)/i.test(voiceKey);
}

/**
 * Generates clean MP3 audio Buffer for any text using Cloned Voices, MCP, or TikTok Neural Voices.
 */
export async function synthesizeSpeechAudio(
  text: string,
  voiceKey = "narrator",
  mcpApiKey?: string,
  expression = "neutral"
): Promise<{ mp3Buffer: Buffer; voiceUsed: string; expressionUsed: string }> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("O texto da fala não pode estar vazio.");
  }

  const clonedVoice = clonedVoicesMap.get(voiceKey);
  const presetVoice = CAPCUT_VOICES[voiceKey];
  const resolvedDirectId = presetVoice?.id || (isRawTikTokVoiceId(voiceKey) ? voiceKey : undefined);
  const voiceNameUsed = clonedVoice?.name || presetVoice?.name || resolvedDirectId || CAPCUT_VOICES["narrator"].name;
  const expr = (expression || "neutral").toLowerCase();
  console.log(`[Discord Voice] Sintetizando áudio para: "${trimmed}" (Voz: ${voiceNameUsed} | Key: ${voiceKey})`);

  let audioUrl: string | null = null;

  // Explicit Google TTS ONLY when specifically requested outside TikTok game roles
  if (voiceKey === "google_tts" || voiceKey === "google" || voiceKey === "male_google") {
    const urls = gtts.getAllAudioUrls(trimmed, {
      lang: "pt-BR",
      slow: false,
      host: "https://translate.google.com",
      splitPunct: ".?!,;:\n",
    });
    const parts: Buffer[] = [];
    for (const item of urls) {
      parts.push(await fetchUrlAsBuffer(item.url));
    }
    return {
      mp3Buffer: Buffer.concat(parts),
      voiceUsed: "Voz do Google (Tradutor)",
      expressionUsed: expr,
    };
  }

  // 1. If voiceKey matches a saved cloned voice, synthesize with cloned reference sample and expression
  if (clonedVoice) {
    console.log(`[Discord Voice] Sintetizando fala com a Voz Clonada do Usuário: "${clonedVoice.name}" (${clonedVoice.id})...`);
    audioUrl = await generateSpeechViaMCP(
      trimmed,
      clonedVoice.mcpVoiceId || clonedVoice.id,
      mcpApiKey,
      undefined,
      clonedVoice.sampleBase64,
      expr
    );

    if (!audioUrl) {
      const clonedFallback = await fetchTikTokTtsAudioBuffer(trimmed, "ICL_br_male_212M_LuizS");
      if (clonedFallback) {
        return { mp3Buffer: clonedFallback, voiceUsed: `${clonedVoice.name} (TikTok Contra)`, expressionUsed: expr };
      }
    }
  }

  // 2. Use AnyToSpeech MCP ONLY when explicitly requested via anytospeech_mcp or explicit mcpApiKey
  if (!audioUrl && (voiceKey === "anytospeech_mcp" || Boolean(mcpApiKey))) {
    audioUrl = await generateSpeechViaMCP(trimmed, "anime-girl-shy", mcpApiKey, undefined, undefined, expr);
  }

  if (audioUrl) {
    const mp3Buffer = await fetchUrlAsBuffer(audioUrl);
    return { mp3Buffer, voiceUsed: voiceNameUsed, expressionUsed: expr };
  }

  // 2.5. Funny Portuguese Exclusive Voices (synthesized in PT-BR TikTok + comedic DSP filter)
  const funnyPtConfig = FUNNY_PT_VOICE_FILTERS[voiceKey];
  if (funnyPtConfig) {
    const candidates = [funnyPtConfig.baseTikTokVoice, ...funnyPtConfig.fallbackTikTokVoices];
    for (const v of candidates) {
      const rawTikTokBuf = await fetchTikTokTtsAudioBuffer(trimmed, v);
      if (rawTikTokBuf && rawTikTokBuf.length > 0) {
        const funnyBuf = await applyFfmpegVoiceFilter(rawTikTokBuf, funnyPtConfig.ffmpegFilter);
        console.log(`[Discord Voice] 🤡 Áudio engraçado PT-BR gerado (${voiceKey} -> base ${v} | ${funnyBuf.length} bytes)!`);
        return {
          mp3Buffer: funnyBuf,
          voiceUsed: `${funnyPtConfig.label} [${v}]`,
          expressionUsed: expr,
        };
      }
    }
  }

  // 3. TikTok Portuguese Voices Only (chunked + retried so long Portuguese sentences never switch to English or Google)
  const isNarratorRequest = voiceKey === "narrator" || voiceKey === "tiktok_narrator" || voiceKey === "br_005";
  const isMaleRequest = voiceKey === "male" || voiceKey === "tiktok_male" || voiceKey === "tiktok_contra";
  const isFemaleRequest = voiceKey === "female" || voiceKey === "tiktok_female" || voiceKey === "tiktok_laizza";

  const voicesToTry = isNarratorRequest
    ? ["br_005", "ICL_br_male_212M_LuizS", "pt_male_bueno", "BV531_streaming"]
    : isMaleRequest
    ? ["ICL_br_male_212M_LuizS", "pt_male_bueno", "br_005", "BV531_streaming"]
    : isFemaleRequest
    ? ["pt_female_laizza", "pt_female_lhays", "bp_female_ivete", "bp_female_ludmilla", "br_003", "br_001", "br_004"]
    : resolvedDirectId && resolvedDirectId !== "google_tts" && resolvedDirectId !== "anytospeech_mcp"
    ? [resolvedDirectId, "br_005", "ICL_br_male_212M_LuizS", "pt_male_bueno", "pt_female_laizza", "pt_female_lhays"]
    : ["br_005", "ICL_br_male_212M_LuizS", "pt_male_bueno", "pt_female_laizza", "pt_female_lhays", "br_003"];

  for (const v of voicesToTry) {
    if (!v || v === "google_tts" || v === "anytospeech_mcp") continue;
    const tiktokBuf = await fetchTikTokTtsAudioBuffer(trimmed, v);
    if (tiktokBuf && tiktokBuf.length > 0) {
      console.log(`[Discord Voice] ✅ Áudio TikTok gerado com sucesso (${v} | ${tiktokBuf.length} bytes)!`);
      return {
        mp3Buffer: tiktokBuf,
        voiceUsed: `${voiceNameUsed} [${v}]`,
        expressionUsed: expr,
      };
    }
  }

  // Emergency fallback only if all TikTok endpoints are unreachable
  console.warn("[Discord Voice] ⚠️ Todos os endpoints TikTok falharam; usando fallback emergencial.");
  const urls = gtts.getAllAudioUrls(trimmed, {
    lang: "pt-BR",
    slow: false,
    host: "https://translate.google.com",
    splitPunct: ".?!,;:\n",
  });
  const parts: Buffer[] = [];
  for (const item of urls) {
    parts.push(await fetchUrlAsBuffer(item.url));
  }
  return {
    mp3Buffer: Buffer.concat(parts),
    voiceUsed: "Fallback Emergencial",
    expressionUsed: expr,
  };
}

/**
 * Converts MP3 buffer into OGG Opus + computes real duration and Discord waveform base64
 */
export async function convertMp3ToVoiceMessageOgg(mp3Buffer: Buffer): Promise<{
  oggBuffer: Buffer;
  durationSecs: number;
  waveform: string;
}> {
  const tmpId = crypto.randomBytes(8).toString("hex");
  const inputPath = path.join(os.tmpdir(), `vm_in_${tmpId}.mp3`);
  const oggPath = path.join(os.tmpdir(), `vm_out_${tmpId}.ogg`);
  const pcmPath = path.join(os.tmpdir(), `vm_pcm_${tmpId}.raw`);

  try {
    await fs.writeFile(inputPath, mp3Buffer);

    // 1. Convert to OGG Opus mono 48kHz (required by Discord voice messages)
    await new Promise((resolve, reject) => {
      const proc = spawn("ffmpeg", [
        "-y",
        "-i", inputPath,
        "-c:a", "libopus",
        "-b:a", "64k",
        "-ar", "48000",
        "-ac", "1",
        oggPath,
      ]);
      let errLog = "";
      proc.stderr.on("data", (d) => { errLog += d.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve(true);
        else reject(new Error(`FFmpeg Opus error (${code}): ${errLog.slice(-200)}`));
      });
    });

    // 2. Decode to 8kHz mono s16le PCM to compute duration & real waveform bars
    await new Promise((resolve, reject) => {
      const proc = spawn("ffmpeg", [
        "-y",
        "-i", inputPath,
        "-f", "s16le",
        "-ac", "1",
        "-ar", "8000",
        pcmPath,
      ]);
      let errLog = "";
      proc.stderr.on("data", (d) => { errLog += d.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve(true);
        else reject(new Error(`FFmpeg PCM error (${code}): ${errLog.slice(-200)}`));
      });
    });

    const [oggBuffer, pcmBuffer] = await Promise.all([
      fs.readFile(oggPath),
      fs.readFile(pcmPath),
    ]);

    const totalSamples = Math.floor(pcmBuffer.length / 2);
    const durationSecs = Math.max(0.5, Number((totalSamples / 8000).toFixed(2)));

    // Build 96-bar waveform (values 0..255)
    const barCount = Math.min(96, Math.max(16, Math.floor(durationSecs * 12)));
    const samplesPerBar = Math.max(1, Math.floor(totalSamples / barCount));
    const bars = new Uint8Array(barCount);

    for (let b = 0; b < barCount; b++) {
      let peak = 0;
      const start = b * samplesPerBar;
      const end = Math.min(totalSamples, start + samplesPerBar);
      for (let i = start; i < end; i++) {
        const val = Math.abs(pcmBuffer.readInt16LE(i * 2));
        if (val > peak) peak = val;
      }
      bars[b] = Math.min(255, Math.max(8, Math.round((peak / 32768) * 255)));
    }

    return {
      oggBuffer,
      durationSecs,
      waveform: Buffer.from(bars).toString("base64"),
    };
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(oggPath).catch(() => {});
    await fs.unlink(pcmPath).catch(() => {});
  }
}

/**
 * Sends an audio-only message speaking the provided text to a Discord text channel.
 * Attempts Discord's native Voice Message bubble (waveform + play button) first,
 * and falls back cleanly to uploading an .mp3 audio player attachment if needed.
 */
export async function sendVoiceAudioMessageToChannel(
  channelId: string,
  text: string,
  voiceKey = "lhays_anime",
  mcpApiKey?: string,
  expression = "neutral",
  replyToMessageId?: string
): Promise<{
  success: boolean;
  channelId: string;
  deliveryType: "voice_message" | "mp3_attachment";
  voiceUsed: string;
  expressionUsed: string;
}> {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN não configurado.");
  }

  const { mp3Buffer, voiceUsed, expressionUsed } = await synthesizeSpeechAudio(
    text,
    voiceKey,
    mcpApiKey,
    expression
  );

  // 1. Try native Discord Voice Message (flags: 8192 = IS_VOICE_MESSAGE)
  try {
    const { oggBuffer, durationSecs, waveform } = await convertMp3ToVoiceMessageOgg(mp3Buffer);

    const attachRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/attachments`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: [
          {
            filename: "voice-message.ogg",
            file_size: oggBuffer.length,
            id: "0",
          },
        ],
      }),
    });

    if (attachRes.ok) {
      const attachData = (await attachRes.json()) as {
        attachments?: Array<{ id: number; upload_url: string; upload_filename: string }>;
      };
      const target = attachData.attachments?.[0];

      if (target?.upload_url && target?.upload_filename) {
        const putRes = await fetch(target.upload_url, {
          method: "PUT",
          headers: { "Content-Type": "audio/ogg" },
          body: new Uint8Array(oggBuffer),
        });

        if (putRes.ok) {
          const msgPayload: any = {
            flags: 8192, // IS_VOICE_MESSAGE
            attachments: [
              {
                id: "0",
                filename: "voice-message.ogg",
                uploaded_filename: target.upload_filename,
                duration_secs: durationSecs,
                waveform,
              },
            ],
          };
          if (replyToMessageId) {
            msgPayload.message_reference = {
              message_id: replyToMessageId,
              fail_if_not_exists: false,
            };
          }

          const msgRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: "POST",
            headers: {
              Authorization: `Bot ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(msgPayload),
          });

          if (msgRes.ok) {
            console.log(`[Discord Audio Msg] ✅ Mensagem de voz nativa enviada no canal ${channelId} (${durationSecs}s | ${voiceUsed})`);
            return {
              success: true,
              channelId,
              deliveryType: "voice_message",
              voiceUsed,
              expressionUsed,
            };
          } else {
            const errTxt = await msgRes.text().catch(() => "");
            console.warn(`[Discord Audio Msg] Fallback para MP3 (Voice Message API ${msgRes.status}: ${errTxt.slice(0, 150)})`);
          }
        }
      }
    }
  } catch (err) {
    console.warn("[Discord Audio Msg] Fallback para MP3:", (err as Error).message);
  }

  // 2. Fallback: upload pure MP3 audio attachment with NO text content
  const client = getBotClient();
  if (client && client.isReady()) {
    const chan = await client.channels.fetch(channelId).catch(() => null);
    if (chan && chan.isTextBased() && "send" in chan) {
      await (chan as any).send({
        files: [{ attachment: mp3Buffer, name: "mensagem-de-voz.mp3" }],
        ...(replyToMessageId
          ? { reply: { messageReference: replyToMessageId, failIfNotExists: false } }
          : {}),
      });
      return {
        success: true,
        channelId,
        deliveryType: "mp3_attachment",
        voiceUsed,
        expressionUsed,
      };
    }
  }

  const form = new FormData();
  form.append(
    "files[0]",
    new Blob([new Uint8Array(mp3Buffer)], { type: "audio/mpeg" }),
    "mensagem-de-voz.mp3"
  );
  const restRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
    },
    body: form,
  });

  if (!restRes.ok) {
    const errText = await restRes.text().catch(() => "");
    throw new Error(`Falha ao enviar áudio no canal (${restRes.status}): ${errText.slice(0, 200)}`);
  }

  return {
    success: true,
    channelId,
    deliveryType: "mp3_attachment",
    voiceUsed,
    expressionUsed,
  };
}

const speechChains = new Map<string, Promise<any>>();

/**
 * Generates TTS audio for text and plays in the voice call strictly sequentially (never overlapping)
 */
export async function speakInVoiceCall(
  guildId: string,
  text: string,
  voiceChannelId?: string,
  voiceKey = "lhays_anime",
  mcpApiKey?: string,
  expression = "neutral"
): Promise<{ success: boolean; channelName: string; text: string; voiceUsed: string; expressionUsed: string }> {
  const prevChain = speechChains.get(guildId) || Promise.resolve();
  const nextTask = prevChain
    .catch(() => {})
    .then(async () => {
      const trimmed = text.trim();
      if (!trimmed) {
        throw new Error("O texto da fala não pode estar vazio.");
      }

      let session = voiceSessions.get(guildId);

      // If not currently in a call, join specified voiceChannelId or find active voice channel
      if (!session || session.connection.state.status === VoiceConnectionStatus.Destroyed) {
        if (!voiceChannelId) {
          throw new Error("Selecione um canal de voz para o bot entrar na call!");
        }
        await joinVoiceCall(guildId, voiceChannelId);
        session = voiceSessions.get(guildId);
      }

      if (!session) {
        throw new Error("Falha ao inicializar sessão de voz.");
      }

      const { mp3Buffer, voiceUsed, expressionUsed } = await synthesizeSpeechAudio(
        trimmed,
        voiceKey,
        mcpApiKey,
        expression
      );

      session.queue.push(`data:audio/mpeg;base64,${mp3Buffer.toString("base64")}`);

      if (!session.isPlaying) {
        await processNextInQueue(guildId);
      }

      return {
        success: true,
        channelName: session.channelName,
        text: trimmed,
        voiceUsed,
        expressionUsed,
      };
    });

  speechChains.set(guildId, nextTask);
  return nextTask;
}

/**
 * Queues pre-synthesized audio buffers into the voice call strictly sequentially with zero network delay
 */
export async function queuePreloadedAudioBuffersInVoiceCall(
  guildId: string,
  buffers: Buffer[],
  voiceChannelId?: string
): Promise<{ success: boolean; channelName: string }> {
  if (buffers.length === 0) return { success: true, channelName: "" };

  const prevChain = speechChains.get(guildId) || Promise.resolve();
  const nextTask = prevChain
    .catch(() => {})
    .then(async () => {
      let session = voiceSessions.get(guildId);
      if (!session || session.connection.state.status === VoiceConnectionStatus.Destroyed) {
        if (!voiceChannelId) {
          throw new Error("Selecione um canal de voz para o bot entrar na call!");
        }
        await joinVoiceCall(guildId, voiceChannelId);
        session = voiceSessions.get(guildId);
      }
      if (!session) {
        throw new Error("Falha ao inicializar sessão de voz.");
      }

      for (const buf of buffers) {
        session.queue.push(`data:audio/mpeg;base64,${buf.toString("base64")}`);
      }

      if (!session.isPlaying) {
        await processNextInQueue(guildId);
      }

      return {
        success: true,
        channelName: session.channelName,
      };
    });

  speechChains.set(guildId, nextTask);
  return nextTask;
}

/**
 * Converts any uploaded media file (MP3, OGG, WAV, MP4, AAC, FLAC, WEBM, etc.)
 * using FFmpeg into a playable Discord audio stream and broadcasts it in the call
 */
export async function playCustomMediaInVoiceCall(
  guildId: string,
  base64Data: string,
  filename: string,
  voiceChannelId?: string
): Promise<{ success: boolean; channelName: string; filename: string }> {
  if (!base64Data) {
    throw new Error("Arquivo de mídia vazio ou inválido.");
  }

  let session = voiceSessions.get(guildId);

  if (!session || session.connection.state.status === VoiceConnectionStatus.Destroyed) {
    if (!voiceChannelId) {
      throw new Error("Selecione um canal de voz para o bot entrar na call!");
    }
    await joinVoiceCall(guildId, voiceChannelId);
    session = voiceSessions.get(guildId);
  }

  if (!session) {
    throw new Error("Falha ao inicializar sessão de voz.");
  }

  const cleanBase64 = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
  const rawBuffer = Buffer.from(cleanBase64, "base64");
  const tmpId = crypto.randomBytes(8).toString("hex");
  const ext = path.extname(filename) || ".bin";
  const inputPath = path.join(os.tmpdir(), `upload_in_${tmpId}${ext}`);
  const outputPath = path.join(os.tmpdir(), `upload_out_${tmpId}.mp3`);

  try {
    await fs.writeFile(inputPath, rawBuffer);

    // Convert any audio or video container to 48kHz stereo MP3 via ffmpeg
    await new Promise((resolve, reject) => {
      const args = [
        "-y",
        "-i", inputPath,
        "-vn", // strip video tracks if MP4 or webm video was uploaded
        "-ar", "48000",
        "-ac", "2",
        "-c:a", "libmp3lame",
        "-b:a", "128k",
        outputPath
      ];
      const proc = spawn("ffmpeg", args);
      let errLog = "";
      proc.stderr.on("data", (d) => { errLog += d.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve(true);
        else reject(new Error(`Erro ao converter mídia via FFmpeg: ${errLog.slice(-200)}`));
      });
    });

    const convertedBuffer = await fs.readFile(outputPath);
    const dataUrl = `data:audio/mpeg;base64,${convertedBuffer.toString("base64")}`;

    console.log(`[Discord Voice] Reproduzindo arquivo personalizado "${filename}" na call "${session.channelName}" (${convertedBuffer.length} bytes)`);

    session.queue.push(dataUrl);

    if (!session.isPlaying) {
      await processNextInQueue(guildId);
    }

    return {
      success: true,
      channelName: session.channelName,
      filename,
    };
  } finally {
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}

/**
 * Joins a voice call and posts an announcement embed in the voice channel's text chat (or fallback text channel)
 */
export async function announceBroadcastInCall(
  guildId: string,
  voiceChannelId: string,
  mode: "screen" | "camera" | "site",
  siteUrl?: string,
  fallbackTextChannelId?: string
): Promise<{
  success: boolean;
  channelName: string;
  chatAnnounced: boolean;
  messageId?: string;
  membersInCall: Array<{ id: string; username: string; avatar: string | null; bot: boolean }>;
}> {
  const joinRes = await joinVoiceCall(guildId, voiceChannelId);
  const client = getBotClient();
  let chatAnnounced = false;
  let messageId: string | undefined;

  const modeLabel =
    mode === "camera"
      ? "Câmera ao Vivo"
      : mode === "site"
      ? `Site / Sistema (${siteUrl || "Painel"})`
      : "Compartilhamento de Tela";

  if (client && client.isReady()) {
    const guild = client.guilds.cache.get(guildId);
    const voiceChan = guild?.channels.cache.get(voiceChannelId) as any;
    const targetText =
      (voiceChan && typeof voiceChan.send === "function" ? voiceChan : null) ||
      (fallbackTextChannelId ? (guild?.channels.cache.get(fallbackTextChannelId) as any) : null);

    if (targetText && typeof targetText.send === "function") {
      try {
        const sent = await targetText.send({
          embeds: [
            {
              title: "📺 Transmissão de Bot Iniciada",
              description: `O bot entrou na call **${joinRes.channelName}** para transmissão.\n\n**Modo:** ${modeLabel}\n**Nota técnica:** Bots oficiais do Discord só transmitem áudio nativamente na call (limitação da API do Discord em qualquer país/VPN). Frames de tela/câmera podem ser sincronizados aqui no chat da call.`,
              color: 0xff1493,
              timestamp: new Date().toISOString(),
            },
          ],
        });
        chatAnnounced = true;
        messageId = sent.id;
      } catch (err) {
        console.warn("[Broadcast Announce] Não foi possível enviar aviso no chat da call:", (err as Error).message);
      }
    }
  }

  const status = getVoiceSessionStatus(guildId, voiceChannelId);
  return {
    success: true,
    channelName: joinRes.channelName,
    chatAnnounced,
    messageId,
    membersInCall: status.membersInCall,
  };
}

/**
 * Captures/receives a PNG/JPEG frame from screen share or camera and posts/edits it inside Discord call chat
 */
export async function broadcastFrameToCallChat(
  guildId: string,
  voiceChannelId: string,
  imageBase64: string,
  caption?: string,
  editMessageId?: string,
  fallbackTextChannelId?: string
): Promise<{
  success: boolean;
  messageId: string;
  channelId: string;
  channelName: string;
  discordLink: string;
}> {
  const client = getBotClient();
  if (!client || !client.isReady()) {
    throw new Error("Bot Discord não está conectado ao Gateway.");
  }

  const guild =
    client.guilds.cache.get(guildId) ||
    (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    throw new Error("Servidor não encontrado.");
  }

  const cleanBase64 = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
  if (!cleanBase64) {
    throw new Error("Frame de imagem vazio ou inválido.");
  }
  const imgBuffer = Buffer.from(cleanBase64, "base64");
  const isPng = imageBase64.startsWith("data:image/png");
  const fileName = isPng ? "transmissao-ao-vivo.png" : "transmissao-ao-vivo.jpg";

  const voiceChan =
    (guild.channels.cache.get(voiceChannelId) as any) ||
    (await guild.channels.fetch(voiceChannelId).catch(() => null));
  const fallbackChan = fallbackTextChannelId
    ? (guild.channels.cache.get(fallbackTextChannelId) as any) ||
      (await guild.channels.fetch(fallbackTextChannelId).catch(() => null))
    : null;

  const tryChannels = [voiceChan, fallbackChan].filter(
    (c) => c && typeof c.send === "function"
  );

  if (tryChannels.length === 0) {
    throw new Error("Nenhum canal com permissão de chat encontrado para enviar o frame.");
  }

  const timeLabel = new Date().toLocaleTimeString("pt-BR");
  const embedPayload = {
    title: "📺 Transmissão de Bot — Ao Vivo",
    description: caption?.trim() || `Frame atualizado às ${timeLabel}`,
    color: 0xff1493,
    image: { url: `attachment://${fileName}` },
    footer: { text: `Call: ${voiceChan?.name || "Chat"} · Atualizado ${timeLabel}` },
  };

  let lastError: Error | null = null;
  for (const chan of tryChannels) {
    try {
      if (editMessageId && chan.messages?.fetch) {
        const existing = await chan.messages.fetch(editMessageId).catch(() => null);
        if (existing) {
          try {
            const edited = await existing.edit({
              embeds: [embedPayload],
              attachments: [],
              files: [{ attachment: imgBuffer, name: fileName }],
            });
            return {
              success: true,
              messageId: edited.id,
              channelId: chan.id,
              channelName: chan.name || "Canal",
              discordLink: `https://discord.com/channels/${guildId}/${chan.id}/${edited.id}`,
            };
          } catch (editErr) {
            console.warn(
              `[Broadcast Frame] Falha ao editar mensagem ${editMessageId}, enviando nova:`,
              (editErr as Error).message
            );
          }
        }
      }

      const sent = await chan.send({
        embeds: [embedPayload],
        files: [{ attachment: imgBuffer, name: fileName }],
      });
      return {
        success: true,
        messageId: sent.id,
        channelId: chan.id,
        channelName: chan.name || "Canal",
        discordLink: `https://discord.com/channels/${guildId}/${chan.id}/${sent.id}`,
      };
    } catch (err) {
      lastError = err as Error;
      console.warn(
        `[Broadcast Frame] Falha no canal ${chan.name || chan.id}:`,
        lastError.message
      );
    }
  }

  throw new Error(
    `Não foi possível enviar a captura no chat da call: ${lastError?.message || "sem permissão de envio/anexo"}`
  );
}

