import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";
import { getBotClient } from "./bot";
import { onVoicePlaybackEvent, VoicePlaybackEvent } from "./voice";
import { triggerServerStageFrameRefresh } from "./serverScreen";

export type BroadcastSceneId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const SCENE_LABELS: Record<BroadcastSceneId, string> = {
  1: "AGUARDANDO",
  2: "ABERTURA",
  3: "FALA DO BOT",
  4: "PERGUNTAS",
  5: "RESPOSTAS RECEBIDAS",
  6: "REVELAÇÃO DAS RESPOSTAS",
  7: "CLASSIFICAÇÃO",
  8: "VENCEDOR",
};

export interface BroadcastParticipant {
  userId: string;
  username: string;
  avatar: string | null;
  answered: boolean;
  answeredAt: number | null;
  totalPoints: number;
  lastRoundPoints: number;
}

export interface BroadcastLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatar: string | null;
  totalPoints: number;
  lastRoundPoints: number;
}

export interface BroadcastState {
  scene: BroadcastSceneId;
  sceneLabel: string;
  matchActive: boolean;
  guildId: string | null;
  guildName: string | null;
  voiceChannelId: string | null;
  voiceChannelName: string | null;
  targetGuildId: string | null;
  targetVoiceChannelId: string | null;
  resolution: "1920x1080" | "1280x720";
  broadcastPrepared: boolean;
  botSpeaking: boolean;
  botSpeech: {
    clipId: string;
    text: string;
    kind: string;
    startedAt: number;
  } | null;
  question: {
    number: number;
    total: number;
    text: string;
    deadlineAt: number | null;
  } | null;
  participants: BroadcastParticipant[];
  lastAnsweredUserId: string | null;
  reveal: {
    clipId: string;
    userId: string;
    username: string;
    avatar: string | null;
    questionNumber: number;
    answer: string;
    didAnswer: boolean;
    startedAt: number;
  } | null;
  leaderboard: BroadcastLeaderboardEntry[];
  winner: {
    mode: "round" | "final";
    roundNumber?: number;
    userId: string;
    username: string;
    avatar: string | null;
    totalPoints: number;
    winningAnswer: string | null;
    explanation: string;
  } | null;
  testMode: boolean;
  updatedAt: number;
}

export type CallGameBroadcastEvent =
  | {
      type: "lobby_open";
      guildId: string;
      guildName?: string | null;
      voiceChannelId: string;
      voiceChannelName: string;
    }
  | {
      type: "lobby_ready_update";
      guildId: string;
      players: Array<{ userId: string; username: string; avatar: string | null }>;
    }
  | {
      type: "match_opening";
      guildId: string;
      guildName?: string | null;
      voiceChannelId: string;
      voiceChannelName: string;
      players: Array<{ userId: string; username: string; avatar: string | null }>;
    }
  | {
      type: "round_question";
      guildId: string;
      questionNumber: number;
      totalQuestions: number;
      question: string;
      deadlineAt: number | null;
    }
  | {
      type: "player_answered";
      guildId: string;
      userId: string;
      username: string;
      answeredAt: number;
    }
  | {
      type: "round_scored";
      guildId: string;
      roundNumber: number;
      scores: Array<{
        userId: string;
        username: string;
        avatar: string | null;
        totalPoints: number;
        roundPoints: number;
      }>;
      winner: {
        userId: string | null;
        username: string | null;
        avatar: string | null;
        totalPoints: number;
        winningAnswer: string | null;
        explanation: string;
      } | null;
    }
  | {
      type: "match_ranking";
      guildId: string;
      leaderboard: BroadcastLeaderboardEntry[];
    }
  | {
      type: "match_finished";
      guildId: string;
      leaderboard: BroadcastLeaderboardEntry[];
      champion: {
        userId: string;
        username: string;
        avatar: string | null;
        totalPoints: number;
        winningAnswer: string | null;
        explanation: string;
      } | null;
    }
  | {
      type: "match_stopped";
      guildId: string;
    };

interface HubSingleton {
  state: BroadcastState;
  wss: WebSocketServer | null;
  clients: Set<WebSocket>;
  voiceUnsub: (() => void) | null;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  attachedServers: WeakSet<object>;
}

const gHub = globalThis as any;

function createInitialState(): BroadcastState {
  return {
    scene: 1,
    sceneLabel: SCENE_LABELS[1],
    matchActive: false,
    guildId: null,
    guildName: null,
    voiceChannelId: null,
    voiceChannelName: null,
    targetGuildId: null,
    targetVoiceChannelId: null,
    resolution: "1920x1080",
    broadcastPrepared: false,
    botSpeaking: false,
    botSpeech: null,
    question: null,
    participants: [],
    lastAnsweredUserId: null,
    reveal: null,
    leaderboard: [],
    winner: null,
    testMode: false,
    updatedAt: Date.now(),
  };
}

function getSingleton(): HubSingleton {
  if (!gHub.__broadcastHub) {
    const wss = new WebSocketServer({ noServer: true });
    const hub: HubSingleton = {
      state: createInitialState(),
      wss,
      clients: new Set<WebSocket>(),
      voiceUnsub: null,
      heartbeatTimer: null,
      attachedServers: new WeakSet<object>(),
    };

    wss.on("connection", (ws: WebSocket) => {
      hub.clients.add(ws);
      try {
        ws.send(
          JSON.stringify({
            type: "state_sync",
            state: hub.state,
            connectedClients: hub.clients.size,
          })
        );
      } catch {}

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString("utf8"));
          if (msg?.type === "ping") {
            ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
          } else if (msg?.type === "request_sync") {
            ws.send(
              JSON.stringify({
                type: "state_sync",
                state: hub.state,
                connectedClients: hub.clients.size,
              })
            );
          }
        } catch {}
      });

      ws.on("close", () => {
        hub.clients.delete(ws);
      });
      ws.on("error", () => {
        hub.clients.delete(ws);
      });
    });

    hub.heartbeatTimer = setInterval(() => {
      for (const client of hub.clients) {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.ping();
          } catch {}
        }
      }
    }, 25_000);

    gHub.__broadcastHub = hub;
  }

  const hub: HubSingleton = gHub.__broadcastHub;

  // Ensure voice playback subscription always points to current module's handler after SSR reload
  if (hub.voiceUnsub) {
    hub.voiceUnsub();
  }
  hub.voiceUnsub = onVoicePlaybackEvent((ev) => {
    handleVoicePlaybackEvent(ev);
  });

  return hub;
}

function setScene(state: BroadcastState, scene: BroadcastSceneId) {
  state.scene = scene;
  state.sceneLabel = SCENE_LABELS[scene];
}

function broadcastStateUpdate(eventType = "state_update"): void {
  const hub = getSingleton();
  hub.state.updatedAt = Date.now();
  const payload = JSON.stringify({
    type: eventType,
    state: hub.state,
    connectedClients: hub.clients.size,
  });
  for (const client of hub.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch {}
    }
  }
  triggerServerStageFrameRefresh();
}

function resolveGuildName(guildId?: string | null): string | null {
  if (!guildId) return null;
  const client = getBotClient();
  return client?.guilds.cache.get(guildId)?.name || null;
}

function isGuildWatchedByBroadcast(state: BroadcastState, guildId: string): boolean {
  if (!state.targetGuildId) return true;
  return state.targetGuildId === guildId;
}

function handleVoicePlaybackEvent(ev: VoicePlaybackEvent): void {
  const hub = getSingleton();
  const state = hub.state;

  if (!isGuildWatchedByBroadcast(state, ev.guildId)) return;

  const meta = ev.meta;

  if (ev.type === "speech:start" && meta) {
    // Do not interrupt an admin preview test with unrelated lobby pings unless real match
    if (state.testMode && meta.kind === "general") return;
    state.testMode = false;

    const text = (meta.displayText || "").trim();
    state.botSpeaking = true;
    state.botSpeech = text
      ? {
          clipId: ev.clipId || `${Date.now()}`,
          text,
          kind: meta.kind || "general",
          startedAt: ev.timestamp,
        }
      : null;

    switch (meta.kind) {
      case "answer_reveal": {
        setScene(state, 6);
        state.reveal = {
          clipId: ev.clipId || `${Date.now()}`,
          userId: meta.userId || "",
          username: meta.username || "Jogador",
          avatar: meta.avatar ?? null,
          questionNumber: meta.questionNumber || state.question?.number || 1,
          answer: meta.answer || "(Sem resposta)",
          didAnswer: meta.didAnswer !== false,
          startedAt: ev.timestamp,
        };
        broadcastStateUpdate("reveal_start");
        return;
      }
      case "question": {
        setScene(state, 4);
        if (meta.question) {
          state.question = {
            number: meta.questionNumber || 1,
            total: meta.totalQuestions || 4,
            text: meta.question,
            deadlineAt: state.question?.deadlineAt || null,
          };
        }
        broadcastStateUpdate("question_spoken");
        return;
      }
      case "round_winner": {
        setScene(state, 8);
        state.winner = {
          mode: "round",
          roundNumber: meta.questionNumber || state.question?.number || 1,
          userId: meta.userId || "",
          username: meta.username || "Vencedor",
          avatar: meta.avatar ?? null,
          totalPoints: meta.totalPoints ?? 0,
          winningAnswer: meta.winningAnswer ?? null,
          explanation: meta.explanation || "",
        };
        broadcastStateUpdate("round_winner_spoken");
        return;
      }
      case "final_winner": {
        setScene(state, 8);
        state.winner = {
          mode: "final",
          userId: meta.userId || "",
          username: meta.username || "Campeão",
          avatar: meta.avatar ?? null,
          totalPoints: meta.totalPoints ?? 0,
          winningAnswer: meta.winningAnswer ?? null,
          explanation: meta.explanation || "",
        };
        broadcastStateUpdate("final_winner_spoken");
        return;
      }
      case "leaderboard": {
        setScene(state, 7);
        broadcastStateUpdate("leaderboard_spoken");
        return;
      }
      case "announcement":
      case "lobby_speech": {
        setScene(state, 3);
        broadcastStateUpdate("bot_speech_start");
        return;
      }
      case "ack": {
        // Quick "OK" when a player answers privately: do NOT wipe Scene 4/5 answer checkmarks
        broadcastStateUpdate("speech_ack");
        return;
      }
      default: {
        // Generic TTS outside match: show Scene 3
        if (!state.matchActive && text) {
          setScene(state, 3);
        }
        broadcastStateUpdate("bot_speech_start");
        return;
      }
    }
  }

  if (ev.type === "speech:end") {
    state.botSpeaking = false;
    const endedKind = meta?.kind;

    if (endedKind === "question" && state.matchActive) {
      // As soon as the bot finishes speaking the question, switch cleanly to Scene 5 (answers status list)
      setScene(state, 5);
      broadcastStateUpdate("answers_waiting");
      return;
    }

    if (endedKind === "round_winner" && state.matchActive && state.leaderboard.length > 0) {
      // After speaking round winner & explanation, display cumulative Classification (Scene 7)
      setScene(state, 7);
      broadcastStateUpdate("round_classification");
      return;
    }

    broadcastStateUpdate("speech_end");
    return;
  }

  if (ev.type === "speech:idle") {
    state.botSpeaking = false;
    state.botSpeech = null;

    if (!state.matchActive && state.scene === 3) {
      setScene(state, 1);
      broadcastStateUpdate("idle_waiting");
    }
  }
}

export function emitCallGameBroadcastEvent(ev: CallGameBroadcastEvent): void {
  const hub = getSingleton();
  const state = hub.state;

  if (!isGuildWatchedByBroadcast(state, ev.guildId)) return;
  state.testMode = false;

  switch (ev.type) {
    case "lobby_open": {
      state.matchActive = false;
      state.guildId = ev.guildId;
      state.guildName = ev.guildName || resolveGuildName(ev.guildId);
      state.voiceChannelId = ev.voiceChannelId;
      state.voiceChannelName = ev.voiceChannelName;
      state.question = null;
      state.reveal = null;
      state.winner = null;
      state.leaderboard = [];
      state.participants = [];
      state.lastAnsweredUserId = null;
      setScene(state, 1);
      broadcastStateUpdate("lobby_open");
      return;
    }
    case "lobby_ready_update": {
      if (!state.matchActive) {
        state.participants = ev.players.map((p) => ({
          userId: p.userId,
          username: p.username,
          avatar: p.avatar,
          answered: false,
          answeredAt: null,
          totalPoints: 0,
          lastRoundPoints: 0,
        }));
        broadcastStateUpdate("lobby_ready_update");
      }
      return;
    }
    case "match_opening": {
      state.matchActive = true;
      state.guildId = ev.guildId;
      state.guildName = ev.guildName || resolveGuildName(ev.guildId);
      state.voiceChannelId = ev.voiceChannelId;
      state.voiceChannelName = ev.voiceChannelName;
      state.question = null;
      state.reveal = null;
      state.winner = null;
      state.lastAnsweredUserId = null;
      state.participants = ev.players.map((p) => ({
        userId: p.userId,
        username: p.username,
        avatar: p.avatar,
        answered: false,
        answeredAt: null,
        totalPoints: 0,
        lastRoundPoints: 0,
      }));
      state.leaderboard = ev.players.map((p, i) => ({
        rank: i + 1,
        userId: p.userId,
        username: p.username,
        avatar: p.avatar,
        totalPoints: 0,
        lastRoundPoints: 0,
      }));
      setScene(state, 2);
      broadcastStateUpdate("match_opening");
      return;
    }
    case "round_question": {
      state.reveal = null;
      state.lastAnsweredUserId = null;
      state.participants = state.participants.map((p) => ({
        ...p,
        answered: false,
        answeredAt: null,
      }));
      state.question = {
        number: ev.questionNumber,
        total: ev.totalQuestions,
        text: ev.question,
        deadlineAt: ev.deadlineAt,
      };
      setScene(state, 4);
      broadcastStateUpdate("round_question");
      return;
    }
    case "player_answered": {
      state.lastAnsweredUserId = ev.userId;
      const existing = state.participants.find((p) => p.userId === ev.userId);
      if (existing) {
        existing.answered = true;
        existing.answeredAt = ev.answeredAt;
      } else {
        state.participants.push({
          userId: ev.userId,
          username: ev.username,
          avatar: null,
          answered: true,
          answeredAt: ev.answeredAt,
          totalPoints: 0,
          lastRoundPoints: 0,
        });
      }
      // Show Scene 5 right away on first player response so real-time checkmarks appear live
      if (state.scene === 4 || state.scene === 5) {
        setScene(state, 5);
      }
      broadcastStateUpdate("player_answered");
      return;
    }
    case "round_scored": {
      const scoreMap = new Map(ev.scores.map((s) => [s.userId, s]));
      state.participants = state.participants.map((p) => {
        const s = scoreMap.get(p.userId);
        return s
          ? {
              ...p,
              avatar: s.avatar || p.avatar,
              totalPoints: s.totalPoints,
              lastRoundPoints: s.roundPoints,
            }
          : p;
      });
      const sorted = [...ev.scores].sort((a, b) => b.totalPoints - a.totalPoints);
      state.leaderboard = sorted.map((s, idx) => ({
        rank: idx + 1,
        userId: s.userId,
        username: s.username,
        avatar: s.avatar,
        totalPoints: s.totalPoints,
        lastRoundPoints: s.roundPoints,
      }));
      if (ev.winner && ev.winner.userId) {
        state.winner = {
          mode: "round",
          roundNumber: ev.roundNumber,
          userId: ev.winner.userId,
          username: ev.winner.username || "Vencedor",
          avatar: ev.winner.avatar,
          totalPoints: ev.winner.totalPoints,
          winningAnswer: ev.winner.winningAnswer,
          explanation: ev.winner.explanation,
        };
      }
      broadcastStateUpdate("round_scored");
      return;
    }
    case "match_ranking": {
      state.leaderboard = ev.leaderboard;
      setScene(state, 7);
      broadcastStateUpdate("match_ranking");
      return;
    }
    case "match_finished": {
      state.matchActive = false;
      state.leaderboard = ev.leaderboard;
      if (ev.champion) {
        state.winner = {
          mode: "final",
          userId: ev.champion.userId,
          username: ev.champion.username,
          avatar: ev.champion.avatar,
          totalPoints: ev.champion.totalPoints,
          winningAnswer: ev.champion.winningAnswer,
          explanation: ev.champion.explanation,
        };
        setScene(state, 8);
      } else {
        setScene(state, 7);
      }
      broadcastStateUpdate("match_finished");
      return;
    }
    case "match_stopped": {
      state.matchActive = false;
      state.botSpeaking = false;
      state.botSpeech = null;
      state.question = null;
      state.reveal = null;
      state.winner = null;
      state.lastAnsweredUserId = null;
      setScene(state, 1);
      broadcastStateUpdate("match_stopped");
      return;
    }
  }
}

export function getBroadcastState(): BroadcastState & { connectedClients: number } {
  const hub = getSingleton();
  return {
    ...hub.state,
    connectedClients: hub.clients.size,
  };
}

export function updateBroadcastConfig(params: {
  targetGuildId?: string | null;
  targetVoiceChannelId?: string | null;
  voiceChannelName?: string | null;
  resolution?: "1920x1080" | "1280x720";
  broadcastPrepared?: boolean;
}): BroadcastState {
  const hub = getSingleton();
  const s = hub.state;
  if (params.targetGuildId !== undefined) {
    s.targetGuildId = params.targetGuildId || null;
    s.guildId = params.targetGuildId || s.guildId;
    s.guildName = resolveGuildName(params.targetGuildId);
  }
  if (params.targetVoiceChannelId !== undefined) {
    s.targetVoiceChannelId = params.targetVoiceChannelId || null;
    s.voiceChannelId = params.targetVoiceChannelId || s.voiceChannelId;
  }
  if (params.voiceChannelName !== undefined) {
    s.voiceChannelName = params.voiceChannelName || null;
  }
  if (params.resolution === "1920x1080" || params.resolution === "1280x720") {
    s.resolution = params.resolution;
  }
  if (typeof params.broadcastPrepared === "boolean") {
    s.broadcastPrepared = params.broadcastPrepared;
  }
  broadcastStateUpdate("config_updated");
  return s;
}

export function triggerTestBroadcastScene(sceneId: BroadcastSceneId): BroadcastState {
  const hub = getSingleton();
  const s = hub.state;

  // Use real connected voice members / bot profile if available (never fabricate fake match winners permanently)
  const client = getBotClient();
  const targetGuildId = s.targetGuildId || s.guildId || client?.guilds.cache.first()?.id || null;
  const guild = targetGuildId ? client?.guilds.cache.get(targetGuildId) : undefined;
  const voiceChanId = s.targetVoiceChannelId || s.voiceChannelId;
  const voiceChan = voiceChanId ? guild?.channels.cache.get(voiceChanId) : undefined;

  let realUsers: Array<{ userId: string; username: string; avatar: string | null }> = [];
  if (voiceChan && voiceChan.isVoiceBased()) {
    realUsers = Array.from(voiceChan.members.values())
      .filter((m) => !m.user.bot)
      .slice(0, 6)
      .map((m) => ({
        userId: m.id,
        username: m.displayName || m.user.globalName || m.user.username,
        avatar: m.user.displayAvatarURL({ size: 256, extension: "png" }),
      }));
  }
  if (realUsers.length === 0 && client?.user) {
    realUsers = [
      {
        userId: client.user.id,
        username: client.user.username,
        avatar: client.user.displayAvatarURL({ size: 256, extension: "png" }),
      },
    ];
  }

  s.testMode = true;
  setScene(s, sceneId);

  if (sceneId === 1) {
    s.testMode = false;
    s.botSpeaking = false;
    s.botSpeech = null;
    s.question = null;
    s.reveal = null;
    s.winner = null;
  } else if (sceneId === 2) {
    s.participants = realUsers.map((u) => ({
      ...u,
      answered: false,
      answeredAt: null,
      totalPoints: 0,
      lastRoundPoints: 0,
    }));
  } else if (sceneId === 3) {
    s.botSpeaking = true;
    s.botSpeech = {
      clipId: `preview_${Date.now()}`,
      text: "Olá a todos, o jogo foi iniciado!\nRespondam cada pergunta apenas no seu canal privado.",
      kind: "announcement",
      startedAt: Date.now(),
    };
  } else if (sceneId === 4) {
    s.question = {
      number: 1,
      total: 4,
      text: "Se você perdesse seu celular e sua carteira em outra cidade durante uma viagem, o que faria primeiro?",
      deadlineAt: Date.now() + 60_000,
    };
  } else if (sceneId === 5) {
    s.question = {
      number: 1,
      total: 4,
      text: "Se você ficasse preso dentro de um elevador sozinho e sem sinal no celular, o que você faria?",
      deadlineAt: Date.now() + 45_000,
    };
    s.participants = realUsers.map((u, idx) => ({
      ...u,
      answered: idx % 2 === 0,
      answeredAt: idx % 2 === 0 ? Date.now() : null,
      totalPoints: 0,
      lastRoundPoints: 0,
    }));
    s.lastAnsweredUserId = realUsers[0]?.userId || null;
  } else if (sceneId === 6) {
    const sample = realUsers[0];
    s.reveal = {
      clipId: `preview_rev_${Date.now()}`,
      userId: sample?.userId || "preview",
      username: sample?.username || "Participante",
      avatar: sample?.avatar || null,
      questionNumber: 1,
      answer:
        "Eu acionaria o botão de emergência pelo interfone do elevador, manteria a calma para economizar energia e aguardaria o resgate técnico.",
      didAnswer: true,
      startedAt: Date.now(),
    };
  } else if (sceneId === 7) {
    s.leaderboard = realUsers.map((u, idx) => ({
      rank: idx + 1,
      userId: u.userId,
      username: u.username,
      avatar: u.avatar,
      totalPoints: Math.max(40, 280 - idx * 45),
      lastRoundPoints: Math.max(30, 95 - idx * 15),
    }));
  } else if (sceneId === 8) {
    const champ = realUsers[0];
    s.winner = {
      mode: "final",
      userId: champ?.userId || "preview",
      username: champ?.username || "Vencedor",
      avatar: champ?.avatar || null,
      totalPoints: 345,
      winningAnswer:
        "Bloquear os cartões imediatamente pelo telefone de emergência e registrar boletim com segurança.",
      explanation:
        "Plano mais prático, seguro e inteligente apresentado durante toda a partida.",
    };
  }

  broadcastStateUpdate("test_scene");
  return s;
}

export function stopAndResetBroadcast(): BroadcastState {
  const hub = getSingleton();
  const prevTargetGuild = hub.state.targetGuildId;
  const prevTargetChannel = hub.state.targetVoiceChannelId;
  const prevVoiceName = hub.state.voiceChannelName;
  const prevRes = hub.state.resolution;

  hub.state = {
    ...createInitialState(),
    targetGuildId: prevTargetGuild,
    targetVoiceChannelId: prevTargetChannel,
    voiceChannelName: prevVoiceName,
    resolution: prevRes,
    broadcastPrepared: false,
  };
  broadcastStateUpdate("broadcast_stopped");
  return hub.state;
}

export function attachBroadcastWebSocketServer(httpServer: any): void {
  if (!httpServer || typeof httpServer.on !== "function") return;
  const hub = getSingleton();
  if (hub.attachedServers.has(httpServer)) return;
  hub.attachedServers.add(httpServer);

  httpServer.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    try {
      const reqUrl = request.url || "/";
      const pathname = reqUrl.split("?")[0];
      if (pathname !== "/ws/broadcast") {
        return;
      }

      hub.wss?.handleUpgrade(request, socket, head, (ws) => {
        hub.wss?.emit("connection", ws, request);
      });
    } catch (err) {
      console.error("[Broadcast WS Upgrade Error]:", err);
    }
  });

  console.log("[Broadcast Hub] ✅ WebSocket /ws/broadcast anexado ao servidor HTTP.");
}
