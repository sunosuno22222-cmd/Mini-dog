import React, { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  ExternalLink,
  LogOut,
  Maximize2,
  Monitor,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Square,
  Tv,
  UserCheck,
  Volume2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BroadcastStage } from "@/components/BroadcastStage";
import { BroadcastSceneId, useBroadcastSocket } from "@/hooks/useBroadcastSocket";

interface OAuthUser {
  id: string;
  username: string;
  globalName: string | null;
  discriminator: string;
  avatar: string | null;
  avatarUrl: string;
}

interface OAuthGuild {
  id: string;
  name: string;
  icon: string | null;
  iconUrl: string | null;
  owner: boolean;
  permissions: string;
  botPresent: boolean;
}

interface VoiceChannelItem {
  id: string;
  name: string;
  memberCount: number;
  members: Array<{ id: string; username: string; avatar: string | null; bot: boolean }>;
}

interface TransmissionPageProps {
  password: string;
  mainBotOnline: boolean;
  mainGuilds: Array<{ id: string; name: string; icon: string | null }>;
  defaultGuildId: string | null;
}

const SESSION_REF_KEY = "discord_tx_session_ref";

const SCENE_BUTTONS: Array<{ id: BroadcastSceneId; label: string }> = [
  { id: 1, label: "1 · Aguardando" },
  { id: 2, label: "2 · Abertura" },
  { id: 3, label: "3 · Fala do Bot" },
  { id: 4, label: "4 · Perguntas" },
  { id: 5, label: "5 · Respostas" },
  { id: 6, label: "6 · Revelação" },
  { id: 7, label: "7 · Classificação" },
  { id: 8, label: "8 · Vencedor" },
];

export const TransmissionPage: React.FC<TransmissionPageProps> = ({
  password,
  mainBotOnline,
  mainGuilds,
  defaultGuildId,
}) => {
  const { state, setState, wsConnected } = useBroadcastSocket();

  // OAuth2 Discord Account state
  const [oauthLoading, setOauthLoading] = useState(true);
  const [oauthConnected, setOauthConnected] = useState(false);
  const [oauthUser, setOauthUser] = useState<OAuthUser | null>(null);
  const [oauthGuilds, setOauthGuilds] = useState<OAuthGuild[]>([]);
  const [oauthScopes, setOauthScopes] = useState<string[]>([]);
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const [disconnectingOAuth, setDisconnectingOAuth] = useState(false);

  // Target server & voice channel
  const [selectedGuildId, setSelectedGuildId] = useState<string>(defaultGuildId || "");
  const [voiceChannels, setVoiceChannels] = useState<VoiceChannelItem[]>([]);
  const [selectedVoiceChannelId, setSelectedVoiceChannelId] = useState<string>("");
  const [loadingChannels, setLoadingChannels] = useState(false);

  // Display capture (getDisplayMedia) state
  const [resolution, setResolution] = useState<"1920x1080" | "1280x720">("1920x1080");
  const [capturing, setCapturing] = useState(false);
  const [captureSupported, setCaptureSupported] = useState<boolean>(true);
  const captureStreamRef = useRef<MediaStream | null>(null);
  const captureVideoRef = useRef<HTMLVideoElement | null>(null);

  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    const supported =
      typeof navigator !== "undefined" &&
      Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === "function");
    setCaptureSupported(supported);
  }, []);

  const getSessionHeaders = (): Record<string, string> => {
    const ref = sessionStorage.getItem(SESSION_REF_KEY);
    return ref ? { "x-discord-session": ref } : {};
  };

  const fetchOAuthSession = useCallback(async () => {
    setOauthLoading(true);
    try {
      const res = await fetch("/api/auth/discord/session", {
        credentials: "include",
        headers: getSessionHeaders(),
      });
      const data = await res.json();
      if (res.ok && data.connected && data.user) {
        setOauthConnected(true);
        setOauthUser(data.user);
        setOauthGuilds(Array.isArray(data.guilds) ? data.guilds : []);
        setOauthScopes(Array.isArray(data.scopes) ? data.scopes : []);
        if (data.sessionRef) {
          sessionStorage.setItem(SESSION_REF_KEY, data.sessionRef);
        }
      } else {
        setOauthConnected(false);
        setOauthUser(null);
        setOauthGuilds([]);
        setOauthScopes([]);
      }
    } catch {
      // ignore transient network glitch
    } finally {
      setOauthLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOAuthSession();
  }, [fetchOAuthSession]);

  // Listen for OAuth2 popup completion message
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin || "";
      if (
        !origin.endsWith(".run.app") &&
        !origin.includes("localhost") &&
        origin !== window.location.origin
      ) {
        return;
      }
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        if (event.data.sessionRef) {
          sessionStorage.setItem(SESSION_REF_KEY, event.data.sessionRef);
        }
        toast.success("Conta Discord conectada via OAuth2 oficial!");
        setConnectingOAuth(false);
        fetchOAuthSession();
      } else if (event.data?.type === "OAUTH_AUTH_ERROR") {
        toast.error(event.data.message || "Falha ao autenticar com o Discord.");
        setConnectingOAuth(false);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [fetchOAuthSession]);

  // Keep selectedGuildId initialized from OAuth guilds (with bot present first) or defaultGuildId
  useEffect(() => {
    if (selectedGuildId) return;
    if (state.targetGuildId) {
      setSelectedGuildId(state.targetGuildId);
      return;
    }
    const botGuildMatch = oauthGuilds.find((g) => g.botPresent);
    if (botGuildMatch) {
      setSelectedGuildId(botGuildMatch.id);
    } else if (defaultGuildId) {
      setSelectedGuildId(defaultGuildId);
    } else if (mainGuilds[0]?.id) {
      setSelectedGuildId(mainGuilds[0].id);
    }
  }, [selectedGuildId, state.targetGuildId, oauthGuilds, defaultGuildId, mainGuilds]);

  // Fetch voice channels when selectedGuildId changes
  const fetchVoiceChannels = useCallback(
    async (guildId: string) => {
      if (!guildId) {
        setVoiceChannels([]);
        return;
      }
      setLoadingChannels(true);
      try {
        const res = await fetch("/api/auth/discord/guild-channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password, guildId }),
        });
        const data = await res.json();
        if (res.ok && Array.isArray(data.voiceChannels)) {
          setVoiceChannels(data.voiceChannels);
          if (data.voiceChannels.length > 0) {
            setSelectedVoiceChannelId((prev) => {
              if (prev && data.voiceChannels.some((vc: VoiceChannelItem) => vc.id === prev)) {
                return prev;
              }
              if (
                state.targetVoiceChannelId &&
                data.voiceChannels.some(
                  (vc: VoiceChannelItem) => vc.id === state.targetVoiceChannelId
                )
              ) {
                return state.targetVoiceChannelId;
              }
              return data.voiceChannels[0].id;
            });
          } else {
            setSelectedVoiceChannelId("");
          }
        } else {
          setVoiceChannels([]);
        }
      } catch {
        setVoiceChannels([]);
      } finally {
        setLoadingChannels(false);
      }
    },
    [password, state.targetVoiceChannelId]
  );

  useEffect(() => {
    if (selectedGuildId) {
      fetchVoiceChannels(selectedGuildId);
    }
  }, [selectedGuildId, fetchVoiceChannels]);

  // Persist broadcast target guild/channel/resolution to server hub
  const syncBroadcastConfig = async (overrides?: {
    guildId?: string;
    voiceChannelId?: string;
    voiceChannelName?: string;
    resolution?: "1920x1080" | "1280x720";
    broadcastPrepared?: boolean;
  }) => {
    const gId = overrides?.guildId ?? selectedGuildId;
    const vcId = overrides?.voiceChannelId ?? selectedVoiceChannelId;
    const vcObj = voiceChannels.find((c) => c.id === vcId);
    try {
      const res = await fetch("/api/broadcast/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          targetGuildId: gId || null,
          targetVoiceChannelId: vcId || null,
          voiceChannelName: overrides?.voiceChannelName ?? vcObj?.name ?? null,
          resolution: overrides?.resolution ?? resolution,
          broadcastPrepared: overrides?.broadcastPrepared,
        }),
      });
      const data = await res.json();
      if (res.ok && data.state) {
        setState(data.state);
      }
    } catch {}
  };

  // Start official Discord OAuth2 flow
  const handleConnectDiscord = async () => {
    setConnectingOAuth(true);
    try {
      const origin = encodeURIComponent(window.location.origin);
      const res = await fetch(`/api/auth/discord/url?origin=${origin}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Não foi possível gerar a URL OAuth2 do Discord.");
      }

      const width = 520;
      const height = 740;
      const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
      const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));

      const authPopup = window.open(
        data.url,
        "discord_oauth_broadcaster",
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );

      if (!authPopup) {
        toast.error(
          "Pop-up bloqueado pelo navegador! Permita pop-ups para este site e tente novamente."
        );
        setConnectingOAuth(false);
      }
    } catch (err) {
      toast.error((err as Error).message);
      setConnectingOAuth(false);
    }
  };

  const handleDisconnectDiscord = async () => {
    setDisconnectingOAuth(true);
    try {
      await fetch("/api/auth/discord/disconnect", {
        method: "POST",
        credentials: "include",
        headers: getSessionHeaders(),
      });
      sessionStorage.removeItem(SESSION_REF_KEY);
      setOauthConnected(false);
      setOauthUser(null);
      setOauthGuilds([]);
      setOauthScopes([]);
      toast.info("Conta Discord desconectada e tokens removidos com segurança.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDisconnectingOAuth(false);
    }
  };

  // Stop getDisplayMedia stream cleanly
  const stopLocalCapture = useCallback(() => {
    if (captureStreamRef.current) {
      captureStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      captureStreamRef.current = null;
    }
    if (captureVideoRef.current) {
      captureVideoRef.current.srcObject = null;
    }
    setCapturing(false);
  }, []);

  useEffect(() => {
    return () => {
      if (captureStreamRef.current) {
        captureStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Prepare Transmission (getDisplayMedia capture + server sync)
  const handlePrepareTransmission = async () => {
    await syncBroadcastConfig({ broadcastPrepared: true });

    if (!captureSupported) {
      toast.warning(
        "Este dispositivo/navegador não suporta captura getDisplayMedia(). Abra o palco em um navegador Desktop com Discord Web/App para compartilhar via Go Live."
      );
      return;
    }

    const [w, h] = resolution === "1920x1080" ? [1920, 1080] : [1280, 720];

    try {
      stopLocalCapture();
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: w },
          height: { ideal: h },
          frameRate: { ideal: 30, max: 60 },
        },
        audio: false,
      });

      captureStreamRef.current = stream;
      setCapturing(true);

      const [videoTrack] = stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.onended = () => {
          stopLocalCapture();
          void syncBroadcastConfig({ broadcastPrepared: false });
          toast.info("Captura de tela encerrada.");
        };
      }

      setTimeout(() => {
        if (captureVideoRef.current) {
          captureVideoRef.current.srcObject = stream;
          captureVideoRef.current.play().catch(() => {});
        }
      }, 60);

      toast.success(
        "Captura preparada! Agora no Discord (desktop/web), entre na call escolhida e autorize o Compartilhar Tela (Go Live) selecionando o Palco 16:9."
      );
    } catch (err) {
      const name = (err as Error)?.name || "";
      if (name === "NotAllowedError") {
        toast.info("Seleção de guia/tela cancelada. O palco 16:9 continua pronto em nova aba.");
      } else {
        toast.error(`Erro ao preparar captura getDisplayMedia(): ${(err as Error).message}`);
      }
    }
  };

  const handleEndTransmission = async () => {
    setBusyAction("stop");
    stopLocalCapture();
    try {
      const res = await fetch("/api/broadcast/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao encerrar transmissão.");
      setState(data.state);
      toast.info("Transmissão visual encerrada e palco retornado para AGUARDANDO.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleTestScene = async (sceneId: BroadcastSceneId) => {
    setBusyAction(`scene_${sceneId}`);
    try {
      const res = await fetch("/api/broadcast/test-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, scene: sceneId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao testar cena.");
      setState(data.state);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  };

  // Merge available guilds cleanly (OAuth guilds first when connected, enriched with bot guilds)
  const guildOptions = oauthConnected && oauthGuilds.length > 0
    ? oauthGuilds
    : mainGuilds.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        iconUrl: g.icon,
        owner: true,
        permissions: "0",
        botPresent: true,
      }));

  const selectedVoiceChannel = voiceChannels.find((c) => c.id === selectedVoiceChannelId) || null;
  const stageStandaloneUrl = `${window.location.origin}/?stage=broadcast`;
  const discordChannelDeepLink =
    selectedGuildId && selectedVoiceChannelId
      ? `https://discord.com/channels/${selectedGuildId}/${selectedVoiceChannelId}`
      : null;

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <section className="rounded-xl border border-white/[0.08] bg-[#0b0c10] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-red-950/60 border border-red-800/60 flex items-center justify-center shrink-0">
              <Tv className="h-4.5 w-4.5 text-red-500" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg text-white leading-tight">
                Transmissão Visual Automatizada
              </h2>
              <p className="text-xs text-slate-400">
                Palco 16:9 sincronizado em tempo real com o Jogo da Call via WebSocket + Discord OAuth2 oficial
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href={stageStandaloneUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#161822] hover:bg-[#1e2130] border border-white/12 text-xs font-semibold text-white transition-colors whitespace-nowrap"
          >
            <Maximize2 className="h-3.5 w-3.5 text-red-400" />
            Abrir Palco 16:9 (Nova Aba)
          </a>

          <Button
            type="button"
            onClick={handlePrepareTransmission}
            disabled={busyAction !== null}
            className="h-9 px-4 bg-red-700 hover:bg-red-600 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
          >
            <Play className="h-3.5 w-3.5 mr-1.5" />
            {capturing ? "Recapturar Tela (getDisplayMedia)" : "Preparar Transmissão"}
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={handleEndTransmission}
            disabled={busyAction === "stop"}
            className="h-9 px-3.5 bg-[#15161e] hover:bg-[#1d1f2a] border border-white/10 text-slate-200 text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Square className="h-3.5 w-3.5 mr-1.5 text-red-400" />
            Encerrar
          </Button>
        </div>
      </section>

      {/* Live Status Grid (Real Server/Socket States — No Fake Telemetry) */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/[0.08] bg-[#0f1118] px-4 py-3">
          <div className="text-[11px] font-medium text-slate-400">Bot Principal (Lógica & Voz)</div>
          <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-white">
            <span
              className={`h-2 w-2 rounded-[2px] ${mainBotOnline ? "bg-emerald-500" : "bg-red-500"}`}
            />
            {mainBotOnline ? "Conectado ao Gateway" : "Offline"}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#0f1118] px-4 py-3">
          <div className="text-[11px] font-medium text-slate-400">Conta Transmissora (OAuth2)</div>
          <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-white truncate">
            <span
              className={`h-2 w-2 rounded-[2px] shrink-0 ${
                oauthConnected ? "bg-emerald-500" : "bg-slate-600"
              }`}
            />
            <span className="truncate">
              {oauthConnected && oauthUser
                ? oauthUser.globalName || oauthUser.username
                : "Não conectada"}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#0f1118] px-4 py-3">
          <div className="text-[11px] font-medium text-slate-400">Sincronização WebSocket</div>
          <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-white">
            <span
              className={`h-2 w-2 rounded-[2px] ${wsConnected ? "bg-emerald-500" : "bg-amber-500"}`}
            />
            {wsConnected ? `Sincronizado (${state.connectedClients || 1} tela)` : "Reconectando..."}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#0f1118] px-4 py-3">
          <div className="text-[11px] font-medium text-slate-400">Captura (getDisplayMedia)</div>
          <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-white">
            <span
              className={`h-2 w-2 rounded-[2px] ${capturing ? "bg-red-600" : "bg-slate-600"}`}
            />
            {capturing ? "Captura Ativa no Navegador" : "Aguardando Preparação"}
          </div>
        </div>
      </section>

      {/* Main 2-Column Workspace: OAuth2 Connection + Broadcast Setup */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Column 1: Discord OAuth2 Account Connection */}
        <section className="lg:col-span-5 rounded-xl border border-white/[0.08] bg-[#0f1118] p-5 flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-red-400" />
                <h3 className="font-display font-bold text-sm text-white">
                  1. Conexão Oficial Discord (OAuth2)
                </h3>
              </div>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-[4px] bg-[#161925] border border-white/10 text-slate-300">
                identify · guilds
              </span>
            </div>

            {oauthLoading ? (
              <div className="h-24 rounded-lg border border-white/[0.06] bg-[#131622] flex items-center justify-center text-xs text-slate-400">
                Verificando sessão OAuth2...
              </div>
            ) : oauthConnected && oauthUser ? (
              <div className="rounded-lg border border-red-900/50 bg-[#141217] p-4 space-y-3">
                <div className="flex items-center gap-3.5">
                  <img
                    src={oauthUser.avatarUrl}
                    alt={oauthUser.username}
                    className="h-14 w-14 rounded-lg object-cover border border-red-700/60 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-bold text-base text-white truncate">
                      {oauthUser.globalName || oauthUser.username}
                    </div>
                    <div className="text-xs text-slate-400 truncate">@{oauthUser.username}</div>
                    <div className="mt-1 font-mono text-[11px] text-slate-400 tabular-nums">
                      ID: {oauthUser.id}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/[0.08]">
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                    Sessão criptografada no servidor ({oauthScopes.join(", ")})
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleDisconnectDiscord}
                    disabled={disconnectingOAuth}
                    className="h-7 px-2.5 bg-[#1b1c24] hover:bg-red-950/60 border border-white/10 text-xs text-slate-200 cursor-pointer"
                  >
                    <LogOut className="h-3 w-3 mr-1" />
                    {disconnectingOAuth ? "Saindo..." : "Desconectar"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-white/15 bg-[#12141d] p-4 space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Conecte a segunda conta Discord que fará a transmissão visual da partida usando o
                  fluxo oficial <strong>Discord OAuth2</strong>. Nenhum token manual é extraído ou exposto.
                </p>
                <Button
                  type="button"
                  onClick={handleConnectDiscord}
                  disabled={connectingOAuth}
                  className="w-full h-10 bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold cursor-pointer"
                >
                  {connectingOAuth ? "Aguardando autorização no pop-up..." : "Conectar Discord"}
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-white/[0.06] bg-[#12141c] p-3 text-[11px] text-slate-400 leading-relaxed">
            <strong className="text-slate-200">Regra Oficial do Discord:</strong> OAuth2 autentica a
            identidade e os servidores com segurança, mas não inicia Go Live remotamente. Após
            conectar, use uma sessão oficial do Discord (Desktop ou Web) com essa conta na mesma
            call do bot e clique em <em>Compartilhar Tela</em> selecionando o palco 16:9.
          </div>
        </section>

        {/* Column 2: Guild, Voice Channel & Capture Controls */}
        <section className="lg:col-span-7 rounded-xl border border-white/[0.08] bg-[#0f1118] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-red-400" />
              <h3 className="font-display font-bold text-sm text-white">
                2. Servidor, Canal de Voz &amp; Ambiente Go Live
              </h3>
            </div>
            <button
              type="button"
              onClick={() => selectedGuildId && fetchVoiceChannels(selectedGuildId)}
              className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white cursor-pointer"
            >
              <RefreshCw className={`h-3 w-3 ${loadingChannels ? "animate-spin" : ""}`} />
              Atualizar calls
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1.5">
                Servidor Discord
              </label>
              <select
                value={selectedGuildId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedGuildId(val);
                  syncBroadcastConfig({ guildId: val });
                }}
                className="h-9 w-full rounded-lg border border-white/10 bg-[#141722] px-3 text-xs text-white focus:outline-none focus:border-red-600"
              >
                <option value="">Selecione um servidor...</option>
                {guildOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} {g.botPresent ? "" : "(Bot principal ausente)"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1.5">
                Canal de Voz da Partida
              </label>
              <select
                value={selectedVoiceChannelId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedVoiceChannelId(val);
                  const vc = voiceChannels.find((c) => c.id === val);
                  syncBroadcastConfig({
                    voiceChannelId: val,
                    voiceChannelName: vc?.name,
                  });
                }}
                disabled={voiceChannels.length === 0}
                className="h-9 w-full rounded-lg border border-white/10 bg-[#141722] px-3 text-xs text-white focus:outline-none focus:border-red-600 disabled:opacity-50"
              >
                {voiceChannels.length === 0 ? (
                  <option value="">Nenhum canal de voz encontrado</option>
                ) : (
                  voiceChannels.map((vc) => (
                    <option key={vc.id} value={vc.id}>
                      🔊 {vc.name} ({vc.memberCount} na call)
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Resolution + Go Live Join Link */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-[11px] font-medium text-slate-400 block mb-1.5">
                Resolução de Saída (16:9)
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(["1920x1080", "1280x720"] as const).map((resOpt) => (
                  <button
                    key={resOpt}
                    type="button"
                    onClick={() => {
                      setResolution(resOpt);
                      syncBroadcastConfig({ resolution: resOpt });
                    }}
                    className={`h-9 rounded-lg border font-mono tabular-nums text-xs font-semibold transition-colors cursor-pointer ${
                      resolution === resOpt
                        ? "bg-red-950/60 border-red-600 text-white"
                        : "bg-[#141722] border-white/10 text-slate-400 hover:text-white"
                    }`}
                  >
                    {resOpt}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col justify-end">
              {discordChannelDeepLink ? (
                <a
                  href={discordChannelDeepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 px-3 rounded-lg border border-white/12 bg-[#161925] hover:bg-[#1e2233] text-xs font-semibold text-white flex items-center justify-center gap-2 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-red-400" />
                  Abrir Call no Discord para Go Live
                </a>
              ) : (
                <div className="h-9 px-3 rounded-lg border border-white/10 bg-[#12141c] text-xs text-slate-500 flex items-center justify-center">
                  Selecione um canal de voz
                </div>
              )}
            </div>
          </div>

          {/* Step-by-step Go Live preparation guide */}
          <div className="rounded-lg border border-white/[0.08] bg-[#12131b] p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Monitor className="h-3.5 w-3.5 text-red-400" />
                Checklist para Transmissão Ao Vivo
              </span>
              {selectedVoiceChannel && (
                <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                  {selectedVoiceChannel.members.length} na call selecionada
                </span>
              )}
            </div>

            <ol className="text-xs text-slate-300 space-y-1.5 list-decimal list-inside">
              <li>
                Clique em <strong>Abrir Palco 16:9 (Nova Aba)</strong> para isolar a tela limpa
                (sem menus) pronta para captura.
              </li>
              <li>
                No cliente oficial do Discord (logado na conta conectada acima), entre na call{" "}
                <strong className="text-white">
                  {selectedVoiceChannel?.name || "selecionada"}
                </strong>{" "}
                onde o bot principal está rodando o <em>Jogo da Call</em>.
              </li>
              <li>
                Autorize o <strong>Go Live / Compartilhar Tela</strong> no Discord escolhendo a guia{" "}
                <strong>Palco 16:9</strong> (ou clique em <strong>Preparar Transmissão</strong>{" "}
                para testar via <code className="font-mono text-red-300">getDisplayMedia()</code>).
              </li>
            </ol>

            {!captureSupported && (
              <div className="mt-2 rounded-md border border-amber-600/40 bg-amber-950/30 p-2.5 flex items-start gap-2 text-[11px] text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                <span>
                  O navegador atual não expõe <code className="font-mono">getDisplayMedia()</code>{" "}
                  (comum em celulares). Você ainda pode usar a aba <strong>Palco 16:9</strong> em um
                  computador para transmitir no Discord Go Live.
                </span>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Live 16:9 Broadcast Stage Preview + Scene Test Controller */}
      <section className="rounded-xl border border-white/[0.08] bg-[#0b0c10] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 text-red-400" />
            <div>
              <h3 className="font-display font-bold text-sm text-white">
                3. Palco de Transmissão 16:9 — Prévia Sincronizada
              </h3>
              <p className="text-[11px] text-slate-400">
                Durante partidas reais do Jogo da Call, todas as cenas mudam automaticamente em
                sincronia exata com a voz e eventos do bot.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-300 bg-[#14151e] border border-white/10 px-3 py-1.5 rounded-md">
            <Volume2 className={`h-3.5 w-3.5 ${state.botSpeaking ? "text-red-500" : "text-slate-500"}`} />
            <span>
              CENA {state.scene} · {state.sceneLabel}
            </span>
          </div>
        </div>

        {/* Live 16:9 Stage */}
        <div className="w-full rounded-xl overflow-hidden border border-white/10">
          <BroadcastStage state={state} />
        </div>

        {/* Local getDisplayMedia captured monitor (only shown when actively capturing) */}
        {capturing && (
          <div className="rounded-lg border border-red-900/50 bg-[#121014] p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Monitor da Captura Local (getDisplayMedia)
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  stopLocalCapture();
                  void syncBroadcastConfig({ broadcastPrepared: false });
                }}
                className="h-7 px-2.5 text-xs bg-[#1b1c24] border border-white/10 text-slate-200 cursor-pointer"
              >
                Parar Captura
              </Button>
            </div>
            <video
              ref={captureVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full max-h-56 rounded-md bg-black object-contain border border-white/10"
            />
          </div>
        )}

        {/* Scene Animation Tester Strip */}
        <div className="pt-2 border-t border-white/[0.08] space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-300">
              Testar Animações das Cenas (Prévia Visual do Operador)
            </span>
            {state.testMode && (
              <button
                type="button"
                onClick={() => handleTestScene(1)}
                className="text-[11px] font-medium text-red-400 hover:text-red-300 cursor-pointer"
              >
                Sair do modo prévia (Voltar ao Aguardando)
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {SCENE_BUTTONS.map((btn) => {
              const active = state.scene === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => handleTestScene(btn.id)}
                  disabled={busyAction === `scene_${btn.id}`}
                  className={`px-2.5 py-2 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer truncate ${
                    active
                      ? "bg-red-900/40 border-red-600 text-white"
                      : "bg-[#141620] border-white/10 text-slate-300 hover:text-white hover:border-white/20"
                  }`}
                >
                  {btn.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
};
