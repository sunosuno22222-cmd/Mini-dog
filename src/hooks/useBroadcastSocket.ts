import { useEffect, useRef, useState } from "react";

export type BroadcastSceneId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

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

export interface LiveBroadcastState {
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
  connectedClients?: number;
}

const DEFAULT_STATE: LiveBroadcastState = {
  scene: 1,
  sceneLabel: "AGUARDANDO",
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
  updatedAt: 0,
};

export function useBroadcastSocket() {
  const [state, setState] = useState<LiveBroadcastState>(DEFAULT_STATE);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryDelayRef = useRef(1000);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;

    // Initial REST snapshot so UI is immediately synced
    fetch("/api/broadcast/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!unmountedRef.current && data?.state) {
          setState(data.state);
        }
      })
      .catch(() => {});

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    const connect = () => {
      if (unmountedRef.current) return;
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${proto}//${window.location.host}/ws/broadcast`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (unmountedRef.current) {
            ws.close();
            return;
          }
          setWsConnected(true);
          retryDelayRef.current = 1000;
          if (pingTimer) clearInterval(pingTimer);
          pingTimer = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, 20_000);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg?.state) {
              setState({
                ...msg.state,
                connectedClients:
                  typeof msg.connectedClients === "number"
                    ? msg.connectedClients
                    : msg.state.connectedClients,
              });
            }
          } catch {}
        };

        ws.onclose = () => {
          setWsConnected(false);
          if (pingTimer) {
            clearInterval(pingTimer);
            pingTimer = null;
          }
          if (!unmountedRef.current) {
            const delay = retryDelayRef.current;
            retryDelayRef.current = Math.min(8000, retryDelayRef.current * 2);
            reconnectTimer = setTimeout(connect, delay);
          }
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        const delay = retryDelayRef.current;
        retryDelayRef.current = Math.min(8000, retryDelayRef.current * 2);
        reconnectTimer = setTimeout(connect, delay);
      }
    };

    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pingTimer) clearInterval(pingTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  return { state, setState, wsConnected };
}
