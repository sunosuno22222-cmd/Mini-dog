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
 * Returns current voice status for a guild
 */
export function getVoiceSessionStatus(guildId: string) {
  const session = voiceSessions.get(guildId);
  if (!session) {
    return {
      connected: false,
      channelId: null,
      channelName: null,
      selfDeaf: true,
      isPlaying: false,
    };
  }

  return {
    connected: true,
    channelId: session.channelId,
    channelName: session.channelName,
    selfDeaf: true,
    isPlaying: session.isPlaying,
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
    session.isPlaying = false;
    processNextInQueue(guildId);
  });

  player.on("error", (error) => {
    console.error("[Discord Voice Audio Error]:", error);
    session.isPlaying = false;
    processNextInQueue(guildId);
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

async function applyFairyVoiceFilter(inputBuffer: Buffer): Promise<Buffer> {
  const tmpId = crypto.randomBytes(8).toString("hex");
  const inputPath = path.join(os.tmpdir(), `tts_in_${tmpId}.mp3`);
  const outputPath = path.join(os.tmpdir(), `tts_out_${tmpId}.mp3`);

  try {
    await fs.writeFile(inputPath, inputBuffer);
    
    await new Promise((resolve, reject) => {
      const args = [
        "-y",
        "-i", inputPath,
        "-filter:a", "asetrate=24000*1.38,aresample=24000,atempo=0.95",
        outputPath
      ];
      const proc = spawn("ffmpeg", args);
      let errLog = "";
      proc.stderr.on("data", (d) => { errLog += d.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve(true);
        else reject(new Error(`FFmpeg exited with code ${code}: ${errLog}`));
      });
    });

    const outBuffer = await fs.readFile(outputPath);
    return outBuffer;
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

export const CAPCUT_VOICES: Record<string, { id: string; name: string; desc: string }> = {
  lhays_anime: {
    id: "pt_female_lhays",
    name: "Dubladora Anime BR (Lhays)",
    desc: "Voz oficial da dubladora de animes no Brasil (CapCut/TikTok)",
  },
  br_menina: {
    id: "br_004",
    name: "Menina Fofa BR (Aguda)",
    desc: "Voz jovem, aguda e animada em português do Brasil",
  },
  br_suave: {
    id: "br_003",
    name: "Fadinha Suave BR (Júlia)",
    desc: "Voz calma, tímida e doce em português do Brasil",
  },
  laizza: {
    id: "pt_female_laizza",
    name: "Garota Expressiva (Laízza)",
    desc: "Voz jovem e alegre em português",
  },
  tianmei: {
    id: "zh_female_tianmei",
    name: "Tianmei (Chinesa Anime)",
    desc: "Voz anime chinesa doce falando frases em português",
  },
};

/**
 * Generates TTS audio for text using official CapCut / TikTok TTS Portuguese voices and plays in the voice call
 */
export async function speakInVoiceCall(
  guildId: string,
  text: string,
  voiceChannelId?: string,
  voiceKey = "lhays_anime"
): Promise<{ success: boolean; channelName: string; text: string; voiceUsed: string }> {
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

  const targetVoice = CAPCUT_VOICES[voiceKey] || CAPCUT_VOICES["lhays_anime"];
  console.log(`[Discord Voice] Gerando fala com voz oficial CapCut PT: ${targetVoice.name} (${targetVoice.id}) para: "${trimmed}"`);

  let audioUrl: string | null = null;
  const voicesToTry = [
    targetVoice.id,
    "pt_female_lhays",
    "br_004",
    "br_003",
    "pt_female_laizza",
    "zh_female_tianmei",
  ];

  for (const v of voicesToTry) {
    try {
      const ttsRes = await fetch("https://tiktok-tts.weilnet.workers.dev/api/generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          voice: v,
        }),
      });
      const ttsData = await ttsRes.json();
      if (ttsData && ttsData.success && ttsData.data) {
        audioUrl = `data:audio/mpeg;base64,${ttsData.data}`;
        console.log(`[Discord Voice] ✅ Áudio gerado com sucesso via CapCut/TikTok TTS (${v})!`);
        break;
      }
    } catch (err) {
      console.warn(`[CapCut TTS] Falha ao tentar voz ${v}:`, (err as Error).message);
    }
  }

  if (audioUrl) {
    session.queue.push(audioUrl);
  } else {
    console.warn("[Discord Voice] Fallback para Google TTS (gtts) com filtro de fada");
    const urls = gtts.getAllAudioUrls(trimmed, {
      lang: "pt-BR",
      slow: false,
      host: "https://translate.google.com",
      splitPunct: ".?!,;:\n",
    });
    for (const item of urls) {
      session.queue.push(item.url);
    }
  }

  if (!session.isPlaying) {
    await processNextInQueue(guildId);
  }

  return {
    success: true,
    channelName: session.channelName,
    text: trimmed,
    voiceUsed: targetVoice.name,
  };
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
