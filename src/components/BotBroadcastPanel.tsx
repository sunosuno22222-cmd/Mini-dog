import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Monitor,
  Camera,
  Globe,
  Headphones,
  PhoneOff,
  Send,
  Volume2,
  Maximize2,
  RefreshCw,
  Users,
  Info,
  StopCircle,
  Image as ImageIcon,
  CheckCircle2,
  FlipHorizontal,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  MousePointerClick,
  Play,
  Server,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface GuildChannel {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
}

interface CallMember {
  id: string;
  username: string;
  avatar: string | null;
  bot: boolean;
}

interface VoiceStatus {
  connected: boolean;
  channelId: string | null;
  channelName: string | null;
  selfDeaf: boolean;
  isPlaying: boolean;
  membersInCall?: CallMember[];
  serverRegion?: string;
}

interface ServerBroadcastState {
  active: boolean;
  guildId: string;
  voiceChannelId: string;
  url: string;
  title: string;
  intervalSeconds: number;
  startedAt: number;
  lastUpdatedAt: number | null;
  framesSent: number;
  messageId: string | null;
  discordChannelName: string | null;
  discordLink?: string | null;
  lastError: string | null;
  lastFrameBase64: string | null;
}

interface BotBroadcastPanelProps {
  password: string;
  guildId: string | null;
  channels: GuildChannel[];
  voiceChannelId: string;
  setVoiceChannelId: (id: string) => void;
  voiceStatus: VoiceStatus;
  joiningVoice: boolean;
  onJoinCall: (channelId?: string) => Promise<void>;
  onLeaveCall: () => Promise<void>;
  onRefreshVoiceStatus: (channelId?: string) => Promise<void>;
  selectedVoice: string;
  selectedExpression: string;
  mcpApiKey?: string;
}

type BroadcastMode = "server_site" | "screen" | "camera";

export function BotBroadcastPanel({
  password,
  guildId,
  channels,
  voiceChannelId,
  setVoiceChannelId,
  voiceStatus,
  joiningVoice,
  onJoinCall,
  onLeaveCall,
  onRefreshVoiceStatus,
  selectedVoice,
  selectedExpression,
  mcpApiKey,
}: BotBroadcastPanelProps) {
  const voiceChannels = channels.filter((c) => c.type === 2 || c.type === 13);
  const textChannels = channels.filter((c) => c.type === 0 || c.type === 5);

  const supportsLocalScreen =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);

  const [mode, setMode] = useState<BroadcastMode>("server_site");
  const [streamActive, setStreamActive] = useState(false);
  const [mirrorCamera, setMirrorCamera] = useState(true);
  const [startingMedia, setStartingMedia] = useState(false);

  // Persistent Server-Side Chromium Broadcast State (runs 24h independent of user's phone!)
  const [serverUrlInput, setServerUrlInput] = useState("https://pt.wikipedia.org");
  const [serverIntervalSecs, setServerIntervalSecs] = useState(5);
  const [serverState, setServerState] = useState<ServerBroadcastState | null>(null);
  const [startingServerBroadcast, setStartingServerBroadcast] = useState(false);
  const [interactingServer, setInteractingServer] = useState(false);
  const [remoteTypeText, setRemoteTypeText] = useState("");

  // Discord call chat sync state (for local camera / local screen mode)
  const [fallbackTextChannelId, setFallbackTextChannelId] = useState(
    textChannels[0]?.id || ""
  );
  const [frameCaption, setFrameCaption] = useState("");
  const [sendingFrame, setSendingFrame] = useState(false);
  const [autoSyncChat, setAutoSyncChat] = useState(false);
  const [syncedMessageId, setSyncedMessageId] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Quick voice TTS while presenting
  const [quickSpeech, setQuickSpeech] = useState("");
  const [speakingQuick, setSpeakingQuick] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!fallbackTextChannelId && textChannels[0]?.id) {
      setFallbackTextChannelId(textChannels[0].id);
    }
  }, [textChannels, fallbackTextChannelId]);

  const fetchServerBroadcastStatus = async (refresh = false) => {
    try {
      const res = await fetch("/api/discord/broadcast/server-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, refresh }),
      });
      const data = await res.json();
      if (data.success && data.state) {
        setServerState(data.state);
        if (data.state.active && data.state.url) {
          setServerUrlInput((prev) => (prev === "https://pt.wikipedia.org" ? data.state.url : prev));
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchServerBroadcastStatus(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll live server screenshot while active and viewing panel
  useEffect(() => {
    if (!serverState?.active) return;
    const timer = setInterval(() => {
      fetchServerBroadcastStatus(true);
    }, 4500);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverState?.active]);

  // Keep members list fresh when switching selected call
  useEffect(() => {
    if (guildId && voiceChannelId) {
      onRefreshVoiceStatus(voiceChannelId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceChannelId, guildId]);

  const stopLocalMediaTracks = () => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((t) => t.stop());
      activeStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStreamActive(false);
    setAutoSyncChat(false);
  };

  useEffect(() => {
    return () => {
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Start Persistent Server-Side Chromium Website Share
  const handleStartServerBroadcast = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!guildId || !voiceChannelId) {
      toast.error("Selecione uma call primeiro!");
      return;
    }
    if (!serverUrlInput.trim()) {
      toast.error("Digite a URL do site que o bot deve abrir e compartilhar.");
      return;
    }
    stopLocalMediaTracks();
    setMode("server_site");
    setStartingServerBroadcast(true);
    try {
      const res = await fetch("/api/discord/broadcast/server-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          guildId,
          channelId: voiceChannelId,
          url: serverUrlInput.trim(),
          fallbackTextChannelId: fallbackTextChannelId || undefined,
          intervalSeconds: serverIntervalSecs,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao iniciar transmissão no servidor.");
      setServerState(data.state);
      await onRefreshVoiceStatus(voiceChannelId);
      if (data.state?.lastError) {
        toast.warning(`Navegador aberto, mas falhou ao enviar no Discord: ${data.state.lastError}`);
      } else {
        toast.success(
          `Transmissão iniciada! Captura enviada no chat de "${data.state.discordChannelName || "call"}" e continua atualizando mesmo se você sair.`
        );
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setStartingServerBroadcast(false);
    }
  };

  const handleStopServerBroadcast = async () => {
    setStartingServerBroadcast(true);
    try {
      const res = await fetch("/api/discord/broadcast/server-stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.state) setServerState(data.state);
      toast.info("Transmissão contínua do servidor encerrada.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setStartingServerBroadcast(false);
    }
  };

  const handleRemoteInteract = async (payload: {
    type: "click" | "scroll" | "back" | "reload" | "type";
    x?: number;
    y?: number;
    deltaY?: number;
    text?: string;
  }) => {
    if (!serverState?.active || interactingServer) return;
    setInteractingServer(true);
    try {
      const res = await fetch("/api/discord/broadcast/server-interact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao interagir com a página.");
      if (data.state) setServerState(data.state);
      if (payload.type === "type") setRemoteTypeText("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setInteractingServer(false);
    }
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!serverState?.active || interactingServer) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1280;
    const y = ((e.clientY - rect.top) / rect.height) * 720;
    handleRemoteInteract({ type: "click", x, y });
  };

  const startScreenShare = async () => {
    if (!supportsLocalScreen) {
      setMode("server_site");
      toast.info(
        "Seu celular não permite captura de tela local — use o modo 'Tela do Servidor (24h)' que funciona direto sem depender do celular!"
      );
      return;
    }
    setStartingMedia(true);
    try {
      stopLocalMediaTracks();
      setMode("screen");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: true,
      });
      activeStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        stopLocalMediaTracks();
        toast.info("Compartilhamento de tela encerrado.");
      });
      setStreamActive(true);
      setSyncedMessageId(null);
      toast.success("Tela local compartilhada ao vivo!");
    } catch (err) {
      const msg = (err as Error).message || "Compartilhamento cancelado.";
      if (!msg.toLowerCase().includes("cancel") && !msg.toLowerCase().includes("permission")) {
        toast.error(`Erro ao compartilhar tela: ${msg}`);
      }
    } finally {
      setStartingMedia(false);
    }
  };

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Seu navegador não suporta acesso à câmera (getUserMedia).");
      return;
    }
    setStartingMedia(true);
    try {
      stopLocalMediaTracks();
      setMode("camera");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      activeStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        stopLocalMediaTracks();
      });
      setStreamActive(true);
      setSyncedMessageId(null);
      toast.success("Câmera ligada no palco!");
    } catch (err) {
      toast.error(`Não foi possível abrir a câmera: ${(err as Error).message}`);
    } finally {
      setStartingMedia(false);
    }
  };

  const handleEnterCallOnly = async () => {
    if (!guildId || !voiceChannelId) {
      toast.error("Selecione uma call primeiro!");
      return;
    }
    await onJoinCall(voiceChannelId);
    await onRefreshVoiceStatus(voiceChannelId);
  };

  const captureVideoFrameDataUrl = (): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    const canvas = document.createElement("canvas");
    const maxW = 1280;
    const scale = Math.min(1, maxW / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    if (mode === "camera" && mirrorCamera) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  };

  const handleSendFrameToCallChat = async (silent = false) => {
    if (!guildId || !voiceChannelId) {
      if (!silent) toast.error("Selecione uma call primeiro.");
      return;
    }
    const frame = captureVideoFrameDataUrl();
    if (!frame) {
      if (!silent) toast.error("Ligue a Câmera ou Tela Local antes de capturar.");
      return;
    }
    setSendingFrame(true);
    try {
      const res = await fetch("/api/discord/broadcast/send-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          guildId,
          channelId: voiceChannelId,
          imageBase64: frame,
          caption:
            frameCaption.trim() ||
            (mode === "camera" ? "Câmera ao vivo via Transmissão de Bot" : "Tela compartilhada ao vivo"),
          editMessageId: syncedMessageId || undefined,
          fallbackTextChannelId: fallbackTextChannelId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao enviar captura.");
      setSyncedMessageId(data.messageId);
      setLastSyncTime(new Date().toLocaleTimeString("pt-BR"));
      if (!silent) toast.success(`Captura enviada no chat de "${data.channelName}"!`);
    } catch (err) {
      setAutoSyncChat(false);
      if (!silent) toast.error((err as Error).message);
    } finally {
      setSendingFrame(false);
    }
  };

  useEffect(() => {
    if (!autoSyncChat || !streamActive || mode === "server_site") return;
    const timer = setInterval(() => {
      handleSendFrameToCallChat(true);
    }, 5000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSyncChat, streamActive, mode, syncedMessageId, voiceChannelId, guildId]);

  const handleQuickSpeakInCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickSpeech.trim() || !guildId) return;
    setSpeakingQuick(true);
    try {
      const res = await fetch("/api/discord/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          guildId,
          channelId: voiceChannelId || undefined,
          text: quickSpeech.trim(),
          voice: selectedVoice,
          expression: selectedExpression,
          mcpApiKey: mcpApiKey?.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao falar na call.");
      setQuickSpeech("");
      toast.success(`Áudio transmitido na call "${data.channelName}"!`);
      onRefreshVoiceStatus(voiceChannelId);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSpeakingQuick(false);
    }
  };

  const handleFullscreen = () => {
    if (stageRef.current?.requestFullscreen) {
      stageRef.current.requestFullscreen().catch(() => {});
    }
  };

  const selectedCallName =
    voiceChannels.find((c) => c.id === voiceChannelId)?.name || "Selecione uma call";

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            Transmissão de Bot
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            O bot abre um navegador real no servidor dos EUA, entra na call e continua compartilhando o site mesmo se você fechar o celular.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-300 tabular-nums shrink-0">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              voiceStatus.connected ? "bg-emerald-400" : "bg-slate-500"
            }`}
          />
          <span>
            {voiceStatus.connected ? `Na call: ${voiceStatus.channelName}` : "Fora da call"}
          </span>
          <span className="text-slate-600">·</span>
          <span className="font-mono text-[11px] text-cyan-300">
            {voiceStatus.serverRegion || "us-east5 (EUA)"}
          </span>
        </div>
      </div>

      {/* Honest Technical Explanation */}
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-xs text-slate-200 flex items-start gap-3">
        <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <p>
            <strong>Importante sobre a tela dentro da call do Discord:</strong> O Discord <strong>não libera "Ao Vivo / Go Live" nem vídeo na câmera para contas de Bot</strong> (é uma trava da própria plataforma do Discord para todos os bots oficiais).
          </p>
          <p className="text-slate-300">
            Por isso, quando você inicia a transmissão, o bot entra na call com <strong>áudio</strong> e envia/atualiza a imagem ao vivo da tela direto no <strong>chat embutido da call no Discord</strong> (ou no chat de apoio ao lado), continuando no ar 24h mesmo se você sair do site.
          </p>
        </div>
      </div>

      {/* Step 1: Call Selection */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0f131d] p-4 space-y-4">
        <div className="grid sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-6">
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              1. Selecionar Call (Canal de Voz)
            </label>
            <select
              value={voiceChannelId}
              onChange={(e) => setVoiceChannelId(e.target.value)}
              className="h-10 w-full rounded-lg border border-white/[0.1] bg-[#141926] px-3 text-xs text-white focus:outline-none focus:border-pink-500"
            >
              {voiceChannels.length === 0 ? (
                <option value="">Nenhum canal de voz encontrado</option>
              ) : (
                voiceChannels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="sm:col-span-3">
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Chat de apoio (fallback)
            </label>
            <select
              value={fallbackTextChannelId}
              onChange={(e) => setFallbackTextChannelId(e.target.value)}
              className="h-10 w-full rounded-lg border border-white/[0.1] bg-[#141926] px-3 text-xs text-slate-200 focus:outline-none focus:border-pink-500"
            >
              {textChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3 flex items-center gap-2">
            <Button
              type="button"
              onClick={handleEnterCallOnly}
              disabled={joiningVoice || !voiceChannelId}
              className="flex-1 h-10 bg-pink-600 hover:bg-pink-500 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              <Headphones className="h-3.5 w-3.5 mr-1.5" />
              {joiningVoice ? "Entrando..." : "Entrar na Call"}
            </Button>

            {voiceStatus.connected && (
              <Button
                type="button"
                variant="destructive"
                onClick={onLeaveCall}
                className="h-10 px-3 text-xs cursor-pointer shrink-0"
                title="Sair da call"
              >
                <PhoneOff className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Members in call */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-white/[0.06] text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <Users className="h-3.5 w-3.5 text-slate-400" />
            <span>
              Na call <strong className="text-slate-200">{selectedCallName}</strong>:
            </span>
            {voiceStatus.membersInCall && voiceStatus.membersInCall.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {voiceStatus.membersInCall.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1.5 text-slate-200 font-medium">
                    {m.avatar && (
                      <img src={m.avatar} alt={m.username} className="h-4 w-4 rounded-full object-cover" />
                    )}
                    <span>{m.username}</span>
                    {m.bot && <span className="text-[10px] font-mono text-pink-400">(bot)</span>}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-slate-500">Ninguém conectado ainda</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => onRefreshVoiceStatus(voiceChannelId)}
            className="text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
          >
            <RefreshCw className="h-3 w-3" /> Atualizar
          </button>
        </div>
      </div>

      {/* Step 2: Source Switcher & Live Stage */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0f131d] p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#090b11] border border-white/[0.08]">
            <button
              type="button"
              onClick={() => {
                stopLocalMediaTracks();
                setMode("server_site");
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                mode === "server_site"
                  ? "bg-cyan-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Server className="h-3.5 w-3.5" /> Tela do Servidor (24h · Sem Celular)
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("camera");
                startCamera();
              }}
              disabled={startingMedia}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                mode === "camera"
                  ? "bg-pink-600 text-white"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Camera className="h-3.5 w-3.5" /> Abrir Câmera
            </button>

            {supportsLocalScreen && (
              <button
                type="button"
                onClick={() => {
                  setMode("screen");
                  startScreenShare();
                }}
                disabled={startingMedia}
                className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  mode === "screen"
                    ? "bg-pink-600 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Monitor className="h-3.5 w-3.5" /> Tela Local (PC)
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {mode === "camera" && streamActive && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setMirrorCamera((v) => !v)}
                className="h-8 text-xs border-white/[0.1] bg-[#141926] text-slate-200 cursor-pointer"
              >
                <FlipHorizontal className="h-3.5 w-3.5 mr-1.5" />
                {mirrorCamera ? "Espelho Ativo" : "Sem Espelho"}
              </Button>
            )}
            {mode !== "server_site" && streamActive && (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={stopLocalMediaTracks}
                className="h-8 text-xs cursor-pointer"
              >
                <StopCircle className="h-3.5 w-3.5 mr-1.5" /> Parar
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleFullscreen}
              className="h-8 text-xs border-white/[0.1] bg-[#141926] text-slate-200 cursor-pointer"
              title="Tela cheia"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Server-Side Persistent Browser Controls */}
        {mode === "server_site" && (
          <form onSubmit={handleStartServerBroadcast} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={serverUrlInput}
                onChange={(e) => setServerUrlInput(e.target.value)}
                placeholder="https://youtube.com ou qualquer site/sistema..."
                className="h-10 text-xs font-mono bg-[#141926] border-white/[0.1] text-white flex-1"
              />
              <select
                value={serverIntervalSecs}
                onChange={(e) => setServerIntervalSecs(Number(e.target.value))}
                className="h-10 rounded-lg border border-white/[0.1] bg-[#141926] px-2.5 text-xs text-slate-200"
                title="Intervalo de atualização no Discord"
              >
                <option value={3}>Atualizar a cada 3s</option>
                <option value={5}>Atualizar a cada 5s</option>
                <option value={10}>Atualizar a cada 10s</option>
                <option value={15}>Atualizar a cada 15s</option>
              </select>
              <Button
                type="submit"
                disabled={startingServerBroadcast || !voiceChannelId}
                className="h-10 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold px-4 cursor-pointer shrink-0 whitespace-nowrap"
              >
                <Play className="h-3.5 w-3.5 mr-1.5" />
                {startingServerBroadcast
                  ? "Iniciando Navegador..."
                  : serverState?.active
                  ? "Trocar Site / Reiniciar"
                  : "Iniciar Transmissão 24h"}
              </Button>
              {serverState?.active && (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={startingServerBroadcast}
                  onClick={handleStopServerBroadcast}
                  className="h-10 px-4 text-xs font-semibold cursor-pointer shrink-0"
                >
                  <StopCircle className="h-3.5 w-3.5 mr-1.5" /> Parar 24h
                </Button>
              )}
            </div>

            {serverState?.active && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-200">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="truncate">
                      Rodando no servidor agora: <strong>{serverState.title || serverState.url}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-[11px] tabular-nums">
                      {serverState.framesSent} frames enviados
                      {serverState.discordChannelName ? ` em #${serverState.discordChannelName}` : ""}
                    </span>
                    {serverState.discordLink && (
                      <a
                        href={serverState.discordLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300 hover:text-cyan-200 underline"
                      >
                        Abrir no Discord <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>

                {serverState.lastError && (
                  <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Erro ao enviar captura para o Discord:</strong> {serverState.lastError}
                    </span>
                  </div>
                )}
              </div>
            )}
          </form>
        )}

        {/* 16:9 Live Broadcast Viewport */}
        <div
          ref={stageRef}
          className="relative w-full aspect-video rounded-xl overflow-hidden bg-[#07090f] border border-white/[0.08] flex items-center justify-center"
        >
          {/* Server-Side Chromium Live View (Click directly to interact remotely!) */}
          {mode === "server_site" && serverState?.active && serverState.lastFrameBase64 && (
            <div className="relative w-full h-full group">
              <img
                src={serverState.lastFrameBase64}
                alt={serverState.title || "Tela do Bot"}
                onClick={handleImageClick}
                className="w-full h-full object-contain cursor-crosshair select-none"
                title="Toque em qualquer ponto da tela para clicar no site remoto"
              />
              <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded bg-black/75 text-[11px] text-slate-200 flex items-center gap-1.5 pointer-events-none">
                <MousePointerClick className="h-3.5 w-3.5 text-cyan-400" />
                <span>Toque na imagem para clicar no site · Servidor EUA ativo</span>
              </div>
            </div>
          )}

          {/* Local Camera / Screen Video */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-contain ${
              streamActive && mode !== "server_site" ? "block" : "hidden"
            } ${mode === "camera" && mirrorCamera ? "-scale-x-100" : ""}`}
          />

          {/* Idle State */}
          {((mode === "server_site" && (!serverState?.active || !serverState.lastFrameBase64)) ||
            (mode !== "server_site" && !streamActive)) && (
            <div className="text-center p-6 max-w-md space-y-3">
              <div className="h-12 w-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto">
                {mode === "camera" ? (
                  <Camera className="h-6 w-6 text-pink-400" />
                ) : (
                  <Globe className="h-6 w-6 text-cyan-400" />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white">
                  {mode === "camera"
                    ? "Câmera desligada"
                    : mode === "screen"
                    ? "Tela local não iniciada"
                    : "Transmissão 24h aguardando URL"}
                </p>
                <p className="text-xs text-slate-400">
                  {mode === "camera"
                    ? "Clique abaixo para ligar sua câmera ao vivo."
                    : mode === "screen"
                    ? "Escolha uma tela ou janela do seu navegador."
                    : "Digite qualquer site acima e clique em Iniciar Transmissão 24h. Você pode fechar o celular depois que ele continua compartilhando."}
                </p>
              </div>
              {mode === "camera" && (
                <Button
                  type="button"
                  onClick={startCamera}
                  disabled={startingMedia}
                  className="bg-pink-600 hover:bg-pink-500 text-white text-xs font-semibold cursor-pointer"
                >
                  <Camera className="h-3.5 w-3.5 mr-1.5" /> Ligar Câmera Agora
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Remote Browser Controls when Server Broadcast is Active */}
        {mode === "server_site" && serverState?.active && (
          <div className="rounded-xl border border-white/[0.08] bg-[#141926] p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={interactingServer}
                  onClick={() => handleRemoteInteract({ type: "back" })}
                  className="h-8 text-xs border-white/[0.1] bg-[#090b11] text-slate-200 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Voltar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={interactingServer}
                  onClick={() => handleRemoteInteract({ type: "reload" })}
                  className="h-8 text-xs border-white/[0.1] bg-[#090b11] text-slate-200 cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Recarregar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={interactingServer}
                  onClick={() => handleRemoteInteract({ type: "scroll", deltaY: -450 })}
                  className="h-8 text-xs border-white/[0.1] bg-[#090b11] text-slate-200 cursor-pointer"
                >
                  <ArrowUp className="h-3.5 w-3.5 mr-1" /> Subir
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={interactingServer}
                  onClick={() => handleRemoteInteract({ type: "scroll", deltaY: 450 })}
                  className="h-8 text-xs border-white/[0.1] bg-[#090b11] text-slate-200 cursor-pointer"
                >
                  <ArrowDown className="h-3.5 w-3.5 mr-1" /> Descer
                </Button>
              </div>

              {serverState.lastUpdatedAt && (
                <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                  Último envio ao Discord:{" "}
                  {new Date(serverState.lastUpdatedAt).toLocaleTimeString("pt-BR")}
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <Input
                value={remoteTypeText}
                onChange={(e) => setRemoteTypeText(e.target.value)}
                placeholder="Digitar texto e apertar Enter no site aberto (ex: pesquisa)..."
                className="h-8 text-xs bg-[#090b11] border-white/[0.1] text-white flex-1"
              />
              <Button
                type="button"
                size="sm"
                disabled={interactingServer || !remoteTypeText.trim()}
                onClick={() => handleRemoteInteract({ type: "type", text: remoteTypeText })}
                className="h-8 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold px-3 cursor-pointer"
              >
                Digitar + Enter
              </Button>
            </div>
          </div>
        )}

        {/* Sync Frame to Discord Call Chat (when using Camera / Local Screen) */}
        {mode !== "server_site" && (
          <div className="rounded-xl border border-white/[0.08] bg-[#141926] p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2">
              <Input
                value={frameCaption}
                onChange={(e) => setFrameCaption(e.target.value)}
                placeholder="Legenda opcional para a captura enviada no chat da call..."
                className="h-9 text-xs bg-[#090b11] border-white/[0.1] text-white flex-1"
              />
              <Button
                type="button"
                onClick={() => handleSendFrameToCallChat(false)}
                disabled={sendingFrame || !streamActive || !voiceChannelId}
                className="h-9 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 cursor-pointer shrink-0 whitespace-nowrap"
              >
                <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
                {sendingFrame ? "Enviando..." : "Enviar no Chat da Call"}
              </Button>
            </div>

            <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <Switch
                  checked={autoSyncChat}
                  disabled={!streamActive || !voiceChannelId}
                  onCheckedChange={(v) => setAutoSyncChat(v)}
                />
                <span className="text-xs text-slate-300">Auto-atualizar (5s)</span>
              </div>
              {lastSyncTime && (
                <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1 tabular-nums">
                  <CheckCircle2 className="h-3 w-3" /> {lastSyncTime}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Step 3: Quick Voice Speech in Call */}
      <form
        onSubmit={handleQuickSpeakInCall}
        className="rounded-xl border border-white/[0.08] bg-[#0f131d] p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
      >
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 shrink-0">
          <Volume2 className="h-4 w-4 text-pink-400" />
          <span>Falar na call:</span>
        </div>
        <Input
          value={quickSpeech}
          onChange={(e) => setQuickSpeech(e.target.value)}
          placeholder="Digite algo para o bot falar em voz alta na call..."
          className="h-9 text-xs bg-[#141926] border-white/[0.1] text-white flex-1"
        />
        <Button
          type="submit"
          disabled={speakingQuick || !quickSpeech.trim() || !voiceChannelId}
          className="h-9 bg-pink-600 hover:bg-pink-500 text-white text-xs font-semibold px-4 cursor-pointer shrink-0"
        >
          <Send className="h-3.5 w-3.5 mr-1.5" />
          {speakingQuick ? "Falando..." : "Transmitir Voz"}
        </Button>
      </form>
    </div>
  );
}
