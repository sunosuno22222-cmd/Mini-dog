import React, { useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import {
  Flame,
  Heart,
  Sparkles,
  Volume2,
  Shield,
  RefreshCw,
  LogOut,
  Send,
  Zap,
  Copy,
  Check,
  Key,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Server as ServerIcon,
  Play,
  UserCheck,
  Radio,
  Cpu,
  Layers,
  Headphones,
  PhoneOff,
  Mic,
  UploadCloud,
  FileAudio,
  Music,
  Film,
  Trash2,
  MessageSquare,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface StatusInfo {
  botTokenConfigured: boolean;
  clientSecretConfigured: boolean;
  publicKeyConfigured: boolean;
  appIdConfigured: boolean;
  gatewayConnected: boolean;
  hasCustomPassword: boolean;
  defaultPasswordActive: boolean;
  appUrl: string;
  commandsCount: number;
  commands: string[];
}

interface OverviewData {
  bot: {
    id: string;
    username: string;
    avatar: string | null;
  };
  inviteUrl: string;
  hasClientSecret: boolean;
  hasPublicKey: boolean;
  guilds: {
    id: string;
    name: string;
    icon: string | null;
  }[];
}

interface GuildChannel {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
}

interface GuildRole {
  id: string;
  name: string;
  color: string | null;
  position: number;
  managed: boolean;
}

interface GuildDetails {
  id: string;
  name: string;
  members: number;
  online: number;
  hasTrisalRole?: boolean;
  channels: GuildChannel[];
  roles: GuildRole[];
}

export default function App() {
  const [password, setPassword] = useState("");
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [statusInfo, setStatusInfo] = useState<StatusInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [showConfigHelper, setShowConfigHelper] = useState(false);

  // Runtime token & client secret override
  const [manualToken, setManualToken] = useState("");
  const [manualClientSecret, setManualClientSecret] = useState("");
  const [manualAppId, setManualAppId] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const data = await res.json();
        setStatusInfo(data);
      }
    } catch {
      // Ignore initial status fetch failure
    }
  };

  useEffect(() => {
    fetchStatus();
    const stored = sessionStorage.getItem("panel_pw");
    if (stored) {
      setSavedPassword(stored);
    }
  }, []);

  const loginAndLoad = async (pw: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/discord/overview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao autenticar.");

      setOverview(data);
      setSavedPassword(pw);
      sessionStorage.setItem("panel_pw", pw);
      toast.success("Terminal neural sincronizado com o Bot Discord!");
      fetchStatus();
    } catch (err) {
      toast.error((err as Error).message);
      sessionStorage.removeItem("panel_pw");
      setSavedPassword(null);
      setOverview(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (savedPassword && !overview) {
      loginAndLoad(savedPassword);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPassword]);

  const handleSaveRuntimeConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) {
      toast.error("Informe o Bot Token.");
      return;
    }

    setSavingConfig(true);
    try {
      const res = await fetch("/api/discord/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: password || savedPassword || "admin",
          botToken: manualToken.trim(),
          clientSecret: manualClientSecret.trim() || undefined,
          appId: manualAppId.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar credenciais");

      toast.success("Credenciais vinculadas na sessão neural!");
      fetchStatus();
      loginAndLoad(password || savedPassword || "admin");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingConfig(false);
    }
  };

  if (!savedPassword || !overview) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-[#06070a] text-slate-100">
        <Toaster position="top-right" richColors />
        <div className="w-full max-w-md">
          <div className="relative rounded-2xl border border-pink-500/30 bg-[#0d1017]/95 p-7 shadow-2xl backdrop-blur-xl cyber-glow-pink">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-pink-500 to-transparent rounded-full" />

            <div className="flex justify-center mb-5">
              <div className="relative">
                <img
                  src="/assets/panelbot.jpg"
                  alt="Phoenix Reforged"
                  className="h-20 w-20 rounded-2xl object-cover border-2 border-pink-500 shadow-lg shadow-pink-500/20"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-pink-500 border border-black" />
                </span>
              </div>
            </div>

            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-pink-500/30 bg-pink-500/10 text-pink-400 text-[10px] font-mono mb-2">
                <Cpu className="h-3 w-3" /> NEURAL INTERFACE v2.0
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white uppercase">
                Phoenix Reforged
              </h1>
              <p className="text-xs text-neutral-400 mt-1">
                Painel Futurista para Comandos Discord &amp; Trisal Totoso
              </p>
            </div>

            {statusInfo && !statusInfo.botTokenConfigured && (
              <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                  <div>
                    <span className="font-semibold">Token do bot não detectado no .env</span>
                    <p className="mt-0.5 text-neutral-300 text-[11px]">
                      Configure <code className="bg-black/40 px-1 py-0.5 rounded text-amber-300 font-mono">DISCORD_BOT_TOKEN</code> ou use o configurador rápido abaixo.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                loginAndLoad(password || "admin");
              }}
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-medium text-neutral-300 block mb-1.5 flex items-center justify-between">
                  <span>Senha de Acesso Neural</span>
                  <span className="text-[10px] text-pink-400 font-mono">Padrão: admin</span>
                </label>
                <Input
                  type="password"
                  placeholder="admin"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-[#121622] border-neutral-700/80 focus-visible:ring-pink-500 h-10 text-sm"
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold h-10 shadow-lg shadow-pink-500/25 cursor-pointer transition-all"
                disabled={loading}
              >
                {loading ? "Sincronizando..." : "Acessar Terminal"}
              </Button>
            </form>

            <div className="mt-5 pt-4 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setShowConfigHelper(!showConfigHelper)}
                className="w-full flex items-center justify-between text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer py-1"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <Key className="h-3.5 w-3.5 text-pink-500" />
                  Inserir Token Manualmente na Sessão
                </span>
                {showConfigHelper ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>

              {showConfigHelper && (
                <div className="mt-3 space-y-2.5 pt-3 border-t border-neutral-800/60">
                  <div className="p-2 rounded bg-pink-500/10 border border-pink-500/20 text-[11px] text-pink-300">
                    💡 <b>Sem necessidade de URL de interação!</b> O bot conecta diretamente via WebSocket (Gateway).
                  </div>
                  <Input
                    placeholder="Bot Token (DISCORD_BOT_TOKEN)"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    type="password"
                    className="text-xs font-mono bg-[#121622]"
                  />
                  <Input
                    placeholder="Client Secret (DISCORD_CLIENT_SECRET)"
                    value={manualClientSecret}
                    onChange={(e) => setManualClientSecret(e.target.value)}
                    type="password"
                    className="text-xs font-mono bg-[#121622]"
                  />
                  <Input
                    placeholder="Application ID (opcional / DISCORD_APPLICATION_ID)"
                    value={manualAppId}
                    onChange={(e) => setManualAppId(e.target.value)}
                    className="text-xs font-mono bg-[#121622]"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full text-xs font-medium cursor-pointer"
                    onClick={handleSaveRuntimeConfig}
                    disabled={savingConfig || !manualToken.trim()}
                  >
                    {savingConfig ? "Configurando..." : "Salvar e Iniciar"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <Dashboard
      overview={overview}
      statusInfo={statusInfo}
      password={savedPassword}
      onRefresh={() => loginAndLoad(savedPassword)}
      onLogout={() => {
        sessionStorage.removeItem("panel_pw");
        setSavedPassword(null);
        setOverview(null);
      }}
    />
  );
}

function Dashboard({
  overview,
  statusInfo,
  password,
  onRefresh,
  onLogout,
}: {
  overview: OverviewData;
  statusInfo: StatusInfo | null;
  password: string;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"moderation" | "interactions" | "template" | "tickets" | "tts" | "roles" | "status">("moderation");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [guildId, setGuildId] = useState<string | null>(overview.guilds[0]?.id ?? null);
  const [guild, setGuild] = useState<GuildDetails | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Moderação Avançada State
  const [modConfig, setModConfig] = useState<{
    antiSpamEnabled: boolean;
    newMemberMaxDays: number;
    timeoutDurationMinutes: number;
    banOnRepeatOffense: boolean;
    antiRogueBotEnabled: boolean;
    antiMassPingEnabled: boolean;
    antiInviteLinksEnabled: boolean;
    antiRaidShieldEnabled: boolean;
    antiNukeEnabled: boolean;
  }>({
    antiSpamEnabled: true,
    newMemberMaxDays: 2,
    timeoutDurationMinutes: 10,
    banOnRepeatOffense: true,
    antiRogueBotEnabled: true,
    antiMassPingEnabled: true,
    antiInviteLinksEnabled: true,
    antiRaidShieldEnabled: true,
    antiNukeEnabled: true,
  });
  const [modLogs, setModLogs] = useState<any[]>([]);
  const [loadingMod, setLoadingMod] = useState(false);
  // Discord App Credentials state
  const [configBotToken, setConfigBotToken] = useState("");
  const [configClientSecret, setConfigClientSecret] = useState("");
  const [configGroqKey, setConfigGroqKey] = useState("");
  const [savingCreds, setSavingCreds] = useState(false);

  // Tickets & Support Panel State
  const [supportPanelChannelId, setSupportPanelChannelId] = useState("");
  const [sendingSupportPanel, setSendingSupportPanel] = useState(false);
  const [ipPanelChannelId, setIpPanelChannelId] = useState("");
  const [sendingIpPanel, setSendingIpPanel] = useState(false);
  const [cleaningTickets, setCleaningTickets] = useState(false);
  const [cleanTicketsMode, setCleanTicketsMode] = useState<"canal" | "all">("canal");
  const [ticketsList, setTicketsList] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  // TTS in Call & Voice Channel state
  const [ttsContent, setTtsContent] = useState("");
  const [ttsChannelId, setTtsChannelId] = useState("");
  const [voiceChannelId, setVoiceChannelId] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("lhays_anime");
  const [enableTtsVoice, setEnableTtsVoice] = useState(true);
  const [sendingTts, setSendingTts] = useState(false);
  const [joiningVoice, setJoiningVoice] = useState(false);
  const [speakingInVoice, setSpeakingInVoice] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<{
    connected: boolean;
    channelId: string | null;
    channelName: string | null;
    selfDeaf: boolean;
    isPlaying: boolean;
  }>({ connected: false, channelId: null, channelName: null, selfDeaf: true, isPlaying: false });

  // Custom Audio/Media Upload & Soundboard State
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [selectedAudioFile, setSelectedAudioFile] = useState<{
    id: string;
    name: string;
    size: string;
    type: string;
    base64: string;
  } | null>(null);
  const [customAudioHistory, setCustomAudioHistory] = useState<
    Array<{ id: string; name: string; size: string; type: string; base64: string }>
  >([]);


  // Role assignment state
  const [targetUserId, setTargetUserId] = useState("");
  const [targetRoleId, setTargetRoleId] = useState("");

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configBotToken.trim() && !configClientSecret.trim() && !configGroqKey.trim()) {
      toast.error("Preencha ao menos uma credencial ou chave.");
      return;
    }

    setSavingCreds(true);
    try {
      const res = await fetch("/api/discord/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          botToken: configBotToken.trim() || undefined,
          clientSecret: configClientSecret.trim() || undefined,
          groqApiKey: configGroqKey.trim() || undefined,
          appId: overview.bot.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar credenciais.");
      toast.success("Credenciais e chaves atualizadas com sucesso!");
      setConfigBotToken("");
      setConfigClientSecret("");
      setConfigGroqKey("");
      onRefresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingCreds(false);
    }
  };

  const fetchVoiceStatus = async (id: string) => {
    try {
      const res = await fetch("/api/discord/voice/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, guildId: id }),
      });
      if (res.ok) {
        const data = await res.json();
        setVoiceStatus(data);
      }
    } catch {}
  };

  const fetchModerationStatus = async () => {
    setLoadingMod(true);
    try {
      const res = await fetch("/api/discord/moderation/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.config) setModConfig(data.config);
        if (data.logs) setModLogs(data.logs);
      }
    } catch {}
    finally {
      setLoadingMod(false);
    }
  };

  const handleSaveModConfig = async (updatedConfig: Partial<typeof modConfig>) => {
    const nextConfig = { ...modConfig, ...updatedConfig };
    setModConfig(nextConfig);
    try {
      const res = await fetch("/api/discord/moderation/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, config: nextConfig }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar regra.");
      toast.success("Regra de Moderação Avançada atualizada com sucesso!");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const [lockingDown, setLockingDown] = useState(false);
  const handleToggleLockdown = async (lock: boolean) => {
    if (!guildId) {
      toast.error("Selecione um servidor ativo!");
      return;
    }
    setLockingDown(true);
    try {
      const res = await fetch("/api/discord/moderation/lockdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, guildId, lock }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao alterar lockdown.");
      toast.success(data.message);
      fetchModerationStatus();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLockingDown(false);
    }
  };

  const handleJoinVoiceCall = async (targetId?: string) => {
    const chId = targetId || voiceChannelId;
    if (!chId || !guildId) {
      toast.error("Selecione um canal de voz para o bot entrar.");
      return;
    }
    setJoiningVoice(true);
    try {
      const res = await fetch("/api/discord/voice/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, guildId, channelId: chId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao entrar na call de voz.");
      toast.success(`Bot conectado na call "${data.channelName}" com ESCUTA DESLIGADA (🎧🔇)!`);
      fetchVoiceStatus(guildId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setJoiningVoice(false);
    }
  };

  const handleLeaveVoiceCall = async () => {
    if (!guildId) return;
    try {
      await fetch("/api/discord/voice/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, guildId }),
      });
      toast.info("Bot saiu da call de voz.");
      setVoiceStatus({ connected: false, channelId: null, channelName: null, selfDeaf: true, isPlaying: false });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleSpeakInVoiceCall = async (customText?: string) => {
    const textToSend = customText || ttsContent;
    if (!textToSend.trim() || !guildId) {
      toast.error("Digite o texto que o bot deve falar na call!");
      return;
    }

    setSpeakingInVoice(true);
    try {
      const res = await fetch("/api/discord/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          guildId,
          text: textToSend.trim(),
          channelId: voiceChannelId || undefined,
          voice: selectedVoice,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao transmitir voz na call");
      toast.success(`🔊 Som transmitido na call "${data.channelName}" (${data.voiceUsed || "Fada Tímida"}): "${data.text}"`);
      fetchVoiceStatus(guildId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSpeakingInVoice(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 30 * 1024 * 1024) {
      toast.error("O arquivo excede o limite máximo de 30MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const fileObj = {
        id: Date.now().toString(),
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(2) + " MB",
        type: file.type || file.name.split(".").pop() || "audio",
        base64,
      };
      setSelectedAudioFile(fileObj);
      setCustomAudioHistory((prev) => [fileObj, ...prev.filter((p) => p.name !== fileObj.name)].slice(0, 10));
      toast.success(`Arquivo "${file.name}" pronto para transmitir na call!`);
    };
    reader.onerror = () => toast.error("Falha ao ler o arquivo selecionado.");
    reader.readAsDataURL(file);
  };

  const handlePlayUploadedMedia = async (targetMedia?: { name: string; base64: string }) => {
    const media = targetMedia || selectedAudioFile;
    if (!media || !guildId) {
      toast.error("Selecione um arquivo de áudio ou vídeo para reproduzir!");
      return;
    }

    setUploadingAudio(true);
    try {
      const res = await fetch("/api/discord/voice/upload-play", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          guildId,
          filename: media.name,
          fileData: media.base64,
          channelId: voiceChannelId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao reproduzir mídia");
      toast.success(`🎶 Reproduzindo "${media.name}" na call "${data.channelName}"!`);
      fetchVoiceStatus(guildId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploadingAudio(false);
    }
  };

  const refreshGuild = async (id: string) => {
    try {
      const res = await fetch("/api/discord/guild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, guildId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao carregar servidor.");
      setGuild(data);
      if (data.channels?.length) {
        const firstVoice = data.channels.find((c: GuildChannel) => c.type === 2);
        if (firstVoice) setVoiceChannelId(firstVoice.id);
        const firstText = data.channels.find((c: GuildChannel) => c.type === 0 || c.type === 5);
        if (firstText) setTtsChannelId(firstText.id);
        const ipChan = data.channels.find((c: GuildChannel) => (c.type === 0 || c.type === 5) && c.name.toLowerCase().includes("ip"));
        if (ipChan) setIpPanelChannelId(ipChan.id);
        else if (firstText) setIpPanelChannelId(firstText.id);
        const supportChan = data.channels.find((c: GuildChannel) => (c.type === 0 || c.type === 5) && (c.name.toLowerCase().includes("suporte") || c.name.toLowerCase().includes("ticket")));
        if (supportChan) setSupportPanelChannelId(supportChan.id);
        else if (firstText) setSupportPanelChannelId(firstText.id);
      }
      if (data.roles?.length && !targetRoleId) {
        const trisal = data.roles.find((r: GuildRole) => {
          const n = r.name.toLowerCase().trim();
          return n === "trisal totoso" || n === "trisal";
        });
        if (trisal) setTargetRoleId(trisal.id);
        else if (data.roles[0]) setTargetRoleId(data.roles[0].id);
      }
      fetchVoiceStatus(id);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  useEffect(() => {
    setGuild(null);
    if (guildId) {
      refreshGuild(guildId);
      fetchVoiceStatus(guildId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId]);

  const [reconnectingBot, setReconnectingBot] = useState(false);
  const handleReconnectGateway = async () => {
    setReconnectingBot(true);
    try {
      const res = await fetch("/api/discord/reconnect-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao conectar Gateway");
      toast.success(`Bot conectado via Gateway: ${data.user || "Online"}`);
      onRefresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReconnectingBot(false);
    }
  };

  const handleRegisterSlashCommands = async () => {
    setBusy("cmd");
    try {
      const res = await fetch("/api/discord/slash-commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, guildId: guildId || guild?.id || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao registrar comandos");
      toast.success(
        "✅ Comandos antigos apagados e os 5 novos registrados (Global e Servidor)! Se não aparecerem no Discord, pressione Ctrl+R para recarregar o cache."
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleCreateTrisalRole = async () => {
    if (!guildId) return;
    setBusy("trisal-role");
    try {
      const res = await fetch("/api/discord/create-trisal-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, guildId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar cargo");
      await refreshGuild(guildId);
      toast.success("Cargo TRISAL TOTOSO (#FF1493) pronto no Discord!");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleApplyBoldTemplate = async () => {
    if (!guildId) return;
    setBusy("template");
    try {
      const res = await fetch("/api/discord/apply-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, guildId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao aplicar template");
      await refreshGuild(guildId);
      toast.success(`✨ Servidor limpo e Template recriado! (${data.deletedCount} canais anteriores apagados, ${data.createdCount} novos canais criados)`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleApplyZigZagTemplate = async (style = "curved") => {
    if (!guildId) return;
    setBusy("zigzag");
    try {
      const res = await fetch("/api/discord/template/zigzag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, guildId, style }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao aplicar Zig-Zag");
      await refreshGuild(guildId);
      toast.success(`🔀 Template Zig-Zag aplicado com sucesso! (${data.editedCount} canais alternados)`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const fetchTickets = async () => {
    if (!guildId) return;
    setLoadingTickets(true);
    try {
      const res = await fetch("/api/discord/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, guildId }),
      });
      const data = await res.json();
      if (data.success) {
        setTicketsList(data.tickets || []);
      }
    } catch {}
    finally {
      setLoadingTickets(false);
    }
  };

  const handleSendSupportPanel = async () => {
    if (!supportPanelChannelId) {
      toast.error("Selecione um canal para enviar o Painel de Suporte.");
      return;
    }
    setSendingSupportPanel(true);
    try {
      const res = await fetch("/api/discord/send-support-panel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, channelId: supportPanelChannelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar painel de suporte");
      toast.success("🎫 Painel de Suporte com Botões enviado com sucesso no canal!");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSendingSupportPanel(false);
    }
  };

  const handleSendIpPanel = async () => {
    if (!ipPanelChannelId) {
      toast.error("Selecione um canal para enviar o Painel Olho do Diabo (ex: BUSCAR IP).");
      return;
    }
    setSendingIpPanel(true);
    try {
      const res = await fetch("/api/discord/send-ip-panel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, channelId: ipPanelChannelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar painel de IP");
      toast.success("👁️ Painel Olho do Diabo de Busca de IP enviado com sucesso no canal!");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSendingIpPanel(false);
    }
  };

  const handleCleanTicketsMessages = async () => {
    if (!guildId) return;
    if (cleanTicketsMode === "canal" && !supportPanelChannelId) {
      toast.error("Selecione um canal para apagar as mensagens!");
      return;
    }

    setCleaningTickets(true);
    try {
      const res = await fetch("/api/discord/clean-tickets-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          guildId,
          channelId: cleanTicketsMode === "canal" ? supportPanelChannelId : undefined,
          mode: cleanTicketsMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao apagar mensagens.");
      toast.success(
        `🗑️ Limpeza concluída! Foram apagadas ${data.totalDeleted} mensagem(ns) do bot em ${data.channelsProcessed} canal(is).`
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCleaningTickets(false);
    }
  };

  const handleSendTtsVoice = async (customText?: string) => {
    const textToSend = customText || ttsContent;
    if (!textToSend.trim() || !ttsChannelId) {
      toast.error("Selecione um canal e escreva o texto!");
      return;
    }

    setSendingTts(true);
    try {
      const res = await fetch("/api/discord/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          channelId: ttsChannelId,
          content: textToSend.trim(),
          tts: enableTtsVoice,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar fala");
      toast.success(enableTtsVoice ? "Voz enviada e falada no Discord!" : "Mensagem enviada!");
      if (!customText) setTtsContent("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSendingTts(false);
    }
  };

  const playBrowserSpeech = (text: string) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "pt-BR";
      utter.rate = 1.05;
      window.speechSynthesis.speak(utter);
      toast.info("Reproduzindo prévia de voz...");
    }
  };

  const handleAssignRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUserId.trim() || !targetRoleId || !guild) return;
    setBusy("assign");
    try {
      const res = await fetch("/api/discord/assign-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          guildId: guild.id,
          userId: targetUserId.trim(),
          roleId: targetRoleId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao atribuir cargo");
      toast.success(data.alreadyAssigned ? `${data.username} já possui este cargo.` : `Cargo ${data.roleName} concedido a ${data.username}!`);
      setTargetUserId("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#06070a] text-slate-100 flex flex-col antialiased">
      <Toaster position="top-right" richColors />

      {/* Cyberpunk Top HUD Bar */}
      <header className="border-b border-pink-500/20 bg-[#0c0f17]/90 backdrop-blur-md px-4 py-3 shrink-0">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={overview.bot.avatar || "/assets/panelbot.jpg"}
                alt="Bot"
                className="h-10 w-10 rounded-xl object-cover border border-pink-500/60 shadow-sm"
              />
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-black" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-white text-base tracking-wide uppercase">
                  {overview.bot.username}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-pink-500/40 bg-pink-500/10 text-pink-400">
                  ONLINE
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 font-mono">
                APP_ID: {overview.bot.id} · {overview.guilds.length} Servidor(es)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-pink-500/40 bg-pink-500/15 text-white font-bold text-xs hover:bg-pink-500/25 transition-all cursor-pointer shadow-md shadow-pink-500/20"
            >
              <Menu className="h-4 w-4 text-pink-400" />
              <span>Menu</span>
            </button>
            <Button
              size="sm"
              asChild
              className="bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white text-xs font-semibold h-8 cursor-pointer shadow-md shadow-pink-600/20"
            >
              <a href={overview.inviteUrl} target="_blank" rel="noreferrer">
                <ServerIcon className="h-3.5 w-3.5 mr-1.5" /> Convidar Bot
              </a>
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={onRefresh}
              className="h-8 w-8 bg-[#131722] hover:bg-neutral-800 border-neutral-700 cursor-pointer"
              title="Recarregar"
            >
              <RefreshCw className="h-3.5 w-3.5 text-neutral-300" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={onLogout}
              className="h-8 w-8 bg-[#131722] hover:bg-neutral-800 border-neutral-700 cursor-pointer"
              title="Sair"
            >
              <LogOut className="h-3.5 w-3.5 text-neutral-300" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hamburger Slide-Over Drawer Overlay */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setDrawerOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="relative w-80 max-w-[85vw] bg-[#0c0f17] border-r border-pink-500/30 p-5 flex flex-col gap-4 shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-pink-500" />
                <span className="font-black text-white text-sm uppercase tracking-wide">
                  Navegação Neural
                </span>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Server Selector inside Drawer */}
            <div className="space-y-1.5 pb-3 border-b border-neutral-800/80">
              <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 block px-1">
                Servidor Ativo
              </span>
              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {overview.guilds.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => {
                      setGuildId(g.id);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                      guildId === g.id
                        ? "border-pink-500/60 bg-pink-500/15 text-pink-200 shadow-sm"
                        : "border-neutral-800/60 bg-black/30 text-neutral-400 hover:text-white hover:bg-neutral-800/50"
                    }`}
                  >
                    {g.icon ? (
                      <img src={g.icon} alt="" className="h-4 w-4 rounded-full object-cover shrink-0" />
                    ) : (
                      <span className="h-4 w-4 rounded-full bg-neutral-800 text-[9px] flex items-center justify-center font-bold shrink-0">
                        {g.name[0]}
                      </span>
                    )}
                    <span className="truncate text-left">{g.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Drawer Menu Items */}
            <div className="space-y-1.5 flex-1 overflow-y-auto">
              <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 block px-1 mb-1">
                Módulos de Controle
              </span>

              {[
                { id: "moderation", label: "Moderação Avançada & Anti-Raid", icon: Shield, color: "text-red-400", badge: "NOVO" },
                { id: "tickets", label: "Central de Tickets & IP", icon: MessageSquare, color: "text-emerald-400" },
                { id: "interactions", label: "Interações & Slash Commands", icon: Sparkles, color: "text-pink-400" },
                { id: "tts", label: "Voz TTS & Transmissão Call", icon: Volume2, color: "text-amber-400" },
                { id: "template", label: "Template de Canais", icon: Layers, color: "text-purple-400" },
                { id: "roles", label: "Cargos & Membros", icon: UserCheck, color: "text-blue-400" },
                { id: "status", label: "Sincronização & Bot", icon: Zap, color: "text-cyan-400" },
              ].map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id as any);
                      setDrawerOpen(false);
                      if (item.id === "tickets") fetchTickets();
                      if (item.id === "moderation") fetchModerationStatus();
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      active
                        ? "bg-gradient-to-r from-red-600/30 via-pink-600/30 to-purple-600/30 border border-pink-500/50 text-white shadow-md cyber-glow-pink"
                        : "text-neutral-400 hover:text-white hover:bg-neutral-800/60"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`h-4 w-4 ${item.color}`} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge && (
                      <Badge className="bg-red-500/20 text-red-300 border-red-500/40 text-[9px] px-1.5 py-0 font-mono">
                        {item.badge}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="pt-3 border-t border-neutral-800 text-center">
              <p className="text-[10px] text-neutral-500 font-mono">
                Phoenix Reforged v2.0 • Security Shield
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Container View (Dedicated Screen) */}
      <main className="max-w-6xl mx-auto w-full px-4 py-4 flex-1 flex flex-col gap-4">
        {/* Server Selector Ribbon */}
        <div className="flex items-center justify-between gap-2 bg-[#0d1017] p-2.5 rounded-xl border border-neutral-800 shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
            <span className="text-[11px] font-mono text-neutral-500 uppercase shrink-0">Servidor Ativo:</span>
            {overview.guilds.map((g) => (
              <button
                key={g.id}
                onClick={() => setGuildId(g.id)}
                className={`flex items-center gap-2 px-3 py-1 rounded-lg border text-xs font-medium transition-all shrink-0 cursor-pointer ${
                  guildId === g.id
                    ? "border-pink-500 bg-pink-500/15 text-pink-200"
                    : "border-neutral-800/80 bg-black/40 text-neutral-400 hover:text-white"
                }`}
              >
                {g.icon ? (
                  <img src={g.icon} alt="" className="h-4 w-4 rounded-full object-cover" />
                ) : (
                  <span className="h-4 w-4 rounded-full bg-neutral-800 text-[10px] flex items-center justify-center font-bold">
                    {g.name[0]}
                  </span>
                )}
                <span className="truncate max-w-[140px]">{g.name}</span>
              </button>
            ))}
          </div>

          <Badge variant="outline" className="border-pink-500/40 text-pink-300 text-[10px] uppercase font-mono shrink-0 hidden sm:flex">
            Módulo: {activeTab}
          </Badge>
        </div>

        {/* Tab 0: MODERAÇÃO AVANÇADA & ANTI-RAID */}
        {activeTab === "moderation" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Banner Header */}
            <div className="rounded-xl border border-red-500/40 bg-[#0d1017] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cyber-glow-pink">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-red-500" />
                  <span className="text-base font-black text-white uppercase tracking-wide">
                    Protocolo de Moderação Avançada &amp; Anti-Raid
                  </span>
                  <Badge className="bg-red-500/20 text-red-300 border-red-500/40 text-[10px]">
                    PROTEÇÃO NÍVEL 5 ATIVA
                  </Badge>
                </div>
                <p className="text-xs text-neutral-400">
                  Proteção inteligente contra ataques que podem derrubar o servidor: spam por contas recentes (&lt; 2 dias), castigo de 10 minutos, banimento por reincidência, bloqueio de bots não autorizados, links de convite maliciosos e Nuke.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={() => handleToggleLockdown(true)}
                  disabled={lockingDown}
                  className="bg-red-700 hover:bg-red-800 text-white font-bold text-xs cursor-pointer shadow-md shadow-red-700/40"
                  title="Bloqueia o envio de mensagens de todos os membros (@everyone) em todos os canais de texto"
                >
                  <AlertTriangle className="h-3.5 w-3.5 mr-1 text-amber-300" />
                  {lockingDown ? "Processando..." : "🚨 Trancar Servidor (Lockdown)"}
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleToggleLockdown(false)}
                  disabled={lockingDown}
                  className="bg-[#181d2a] hover:bg-neutral-800 border-neutral-700 text-xs font-medium cursor-pointer"
                  title="Restaura a permissão padrão de envio nos canais"
                >
                  <Check className="h-3.5 w-3.5 mr-1 text-emerald-400" />
                  Destrancar
                </Button>

                <Button
                  size="sm"
                  onClick={fetchModerationStatus}
                  disabled={loadingMod}
                  className="bg-[#181d2a] hover:bg-neutral-800 border-neutral-700 text-white font-semibold text-xs cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingMod ? "animate-spin" : ""}`} />
                  Atualizar Logs
                </Button>
              </div>
            </div>

            {/* Rules Toggles Grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Anti-Spam & Timeout (< 2 Dias) */}
              <div className="rounded-xl border border-amber-500/30 bg-[#0d1017] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-amber-500" /> Anti-Spam Membros Novos (&lt; 2d)
                  </span>
                  <Switch
                    checked={modConfig.antiSpamEnabled}
                    onCheckedChange={(v) => handleSaveModConfig({ antiSpamEnabled: v })}
                  />
                </div>
                <p className="text-[11px] text-neutral-300 leading-relaxed">
                  Contas com <b>menos de 2 dias no servidor</b> que enviarem mensagens repetidas recebem apagar imediato + <b>Castigo de 10 minutos (Timeout)</b>.
                </p>
                <div className="p-2 rounded bg-black/40 border border-amber-500/20 text-[10px] font-mono text-amber-200">
                  1ª Infração: Castigo (Timeout 10m)<br/>
                  2ª Infração: Banimento Permanente
                </div>
              </div>

              {/* Anti-Bot Invasor */}
              <div className="rounded-xl border border-purple-500/30 bg-[#0d1017] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-purple-400 flex items-center gap-1.5">
                    <Cpu className="h-4 w-4 text-purple-500" /> Proteção Anti-Bot Invasor
                  </span>
                  <Switch
                    checked={modConfig.antiRogueBotEnabled}
                    onCheckedChange={(v) => handleSaveModConfig({ antiRogueBotEnabled: v })}
                  />
                </div>
                <p className="text-[11px] text-neutral-300 leading-relaxed">
                  Bots convidados por membros sem o cargo de <b>Administrador</b> são imediatamente banidos/expulsos e o convidador recebe um castigo.
                </p>
                <div className="p-2 rounded bg-black/40 border border-purple-500/20 text-[10px] font-mono text-purple-200">
                  Status: Audit Logs Monitorado
                </div>
              </div>

              {/* Anti-Invite Links */}
              <div className="rounded-xl border border-pink-500/30 bg-[#0d1017] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-pink-400 flex items-center gap-1.5">
                    <Zap className="h-4 w-4 text-pink-500" /> Filtro Anti-Links de Convite
                  </span>
                  <Switch
                    checked={modConfig.antiInviteLinksEnabled}
                    onCheckedChange={(v) => handleSaveModConfig({ antiInviteLinksEnabled: v })}
                  />
                </div>
                <p className="text-[11px] text-neutral-300 leading-relaxed">
                  Apaga automaticamente links de convite (ex: <code>discord.gg</code>) divulgados por membros recentes sem permissão de Administrador.
                </p>
                <div className="p-2 rounded bg-black/40 border border-pink-500/20 text-[10px] font-mono text-pink-200">
                  Ação: Apagar mensagem + Timeout 10m
                </div>
              </div>

              {/* Escudo Anti-Raid */}
              <div className="rounded-xl border border-cyan-500/30 bg-[#0d1017] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-cyan-400 flex items-center gap-1.5">
                    <Shield className="h-4 w-4 text-cyan-500" /> Escudo Anti-Raid Massivo
                  </span>
                  <Switch
                    checked={modConfig.antiRaidShieldEnabled}
                    onCheckedChange={(v) => handleSaveModConfig({ antiRaidShieldEnabled: v })}
                  />
                </div>
                <p className="text-[11px] text-neutral-300 leading-relaxed">
                  Monitora taxa de entrada rápida (5+ contas em 10 segundos) e coloca as novas contas em quarentena de castigo automático.
                </p>
                <div className="p-2 rounded bg-black/40 border border-cyan-500/20 text-[10px] font-mono text-cyan-200">
                  Status: Quarentena de 15m Ativada em Raid
                </div>
              </div>

              {/* Proteção Anti-Nuke */}
              <div className="rounded-xl border border-rose-500/30 bg-[#0d1017] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-rose-400 flex items-center gap-1.5">
                    <Trash2 className="h-4 w-4 text-rose-500" /> Proteção Anti-Nuke de Canais
                  </span>
                  <Switch
                    checked={modConfig.antiNukeEnabled}
                    onCheckedChange={(v) => handleSaveModConfig({ antiNukeEnabled: v })}
                  />
                </div>
                <p className="text-[11px] text-neutral-300 leading-relaxed">
                  Detecta se uma conta/bot tentar apagar múltiplos canais em sequência rápida e efetua o banimento preventivo imediato.
                </p>
                <div className="p-2 rounded bg-black/40 border border-rose-500/20 text-[10px] font-mono text-rose-200">
                  Ação: Banimento Preventivo de Nuke
                </div>
              </div>

              {/* Anti-MassPing (@everyone) */}
              <div className="rounded-xl border border-amber-500/30 bg-[#0d1017] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-amber-400 flex items-center gap-1.5">
                    <Radio className="h-4 w-4 text-amber-500" /> Proteção Anti-MassPing (@everyone)
                  </span>
                  <Switch
                    checked={modConfig.antiMassPingEnabled}
                    onCheckedChange={(v) => handleSaveModConfig({ antiMassPingEnabled: v })}
                  />
                </div>
                <p className="text-[11px] text-neutral-300 leading-relaxed">
                  Bloqueia tentativas de spam de <code>@everyone</code> ou <code>@here</code> efetuadas por membros recentes sem permissão especial.
                </p>
                <div className="p-2 rounded bg-black/40 border border-amber-500/20 text-[10px] font-mono text-amber-200">
                  Ação: Apagar mensagem + Timeout 10m
                </div>
              </div>
            </div>

            {/* Live Security Log Feed */}
            <div className="rounded-xl border border-neutral-800 bg-[#0d1017] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-pink-500" /> Registros &amp; Logs de Segurança em Tempo Real
                </h3>
                <span className="text-[10px] font-mono text-neutral-500">
                  {modLogs.length} eventos registrados
                </span>
              </div>

              {modLogs.length === 0 ? (
                <div className="p-6 text-center text-xs text-neutral-500 border border-dashed border-neutral-800 rounded-lg">
                  Nenhuma infração ou ação disciplinar registrada no momento. O servidor está seguro!
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {modLogs.map((log: any) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-lg border border-neutral-800 bg-black/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Badge
                            className={`text-[9px] font-mono uppercase ${
                              log.action === "BAN" || log.action === "BOT_BAN" || log.action === "ANTI_NUKE"
                                ? "bg-red-950 text-red-300 border-red-800"
                                : "bg-amber-950 text-amber-300 border-amber-800"
                            }`}
                          >
                            {log.action}
                          </Badge>
                          <span className="font-bold text-white">{log.targetTag}</span>
                          <span className="text-[10px] font-mono text-neutral-500">({log.targetId})</span>
                        </div>
                        <p className="text-neutral-300 text-[11px]">{log.reason}</p>
                        <p className="text-neutral-500 text-[10px]">{log.details}</p>
                      </div>
                      <div className="text-[10px] font-mono text-neutral-500 shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 1: COMANDOS SLASH & INTERAÇÕES */}
        {activeTab === "interactions" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Status Banner */}
            <div className="rounded-xl border border-pink-500/40 bg-[#0d1017] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cyber-glow-pink">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-pink-400" />
                  <span className="text-sm font-bold text-white uppercase tracking-wide">
                    Comandos Slash Ativos no Discord
                  </span>
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[10px]">
                    Sem Exigência de Cargo Trisal
                  </Badge>
                </div>
                <p className="text-xs text-neutral-400">
                  Os comandos de interação <code>/selinho</code> e <code>/tapa-na-bunda</code> estão liberados para todos. Os comandos de administração (<code>/painel-suporte</code>, <code>/painel-ip</code>, <code>/apagar-tickets</code>) são restritos à Staff.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={handleRegisterSlashCommands}
                  disabled={busy === "cmd"}
                  className="bg-pink-600 hover:bg-pink-700 text-white font-semibold text-xs cursor-pointer shadow-md shadow-pink-500/30"
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${busy === "cmd" ? "animate-spin" : ""}`} />
                  {busy === "cmd" ? "Sincronizando..." : "Atualizar Comandos no Discord"}
                </Button>
              </div>
            </div>

            {/* Commands Grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* /selinho */}
              <div className="rounded-xl border border-rose-500/30 bg-[#0d1017] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm text-rose-400 flex items-center gap-1.5">
                    <Heart className="h-4 w-4 text-rose-500" /> /selinho
                  </span>
                  <Badge variant="secondary" className="text-[10px] bg-rose-950 text-rose-300 border-rose-800">
                    user • Todos os Membros
                  </Badge>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Puxa o membro de surpresa pela gola, colando as bocas com vontade e dando aquele selinho demorado e gostoso com mordidinha.
                </p>
                <div className="p-2.5 rounded-lg bg-black/40 border border-rose-500/20 text-[11px] font-mono text-rose-200">
                  &gt; &quot;Um gostinho pra você ficar com vontade de muito mais...&quot; 🤤❤️‍🔥
                </div>
              </div>

              {/* /tapa-na-bunda */}
              <div className="rounded-xl border border-rose-600/40 bg-[#0d1017] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm text-rose-400 flex items-center gap-1.5">
                    <Flame className="h-4 w-4 text-rose-500" /> /tapa-na-bunda
                  </span>
                  <Badge variant="secondary" className="text-[10px] bg-rose-950 text-rose-300 border-rose-800">
                    user • Todos os Membros
                  </Badge>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Provocação e malícia: puxa firme pelo quadril, cola o corpo e dispara aquele tapão de mão cheia com sussurro no ouvido!
                </p>
                <div className="p-2.5 rounded-lg bg-black/40 border border-rose-500/30 text-[11px] font-mono text-rose-200">
                  &gt; &quot;Essa bundinha linda agora é minha... aguenta firme que hoje a brincadeira tá só começando.&quot; 😈🫦🍑
                </div>
              </div>

              {/* /falar */}
              <div className="rounded-xl border border-amber-500/30 bg-[#0d1017] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm text-amber-400 flex items-center gap-1.5">
                    <Volume2 className="h-4 w-4 text-amber-500" /> /falar
                  </span>
                  <Badge variant="secondary" className="text-[10px] bg-amber-950 text-amber-300 border-amber-800">
                    texto + tts
                  </Badge>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Faz o bot falar mensagens em áudio via TTS em canais de texto ou transmitir diretamente na call de voz em que você estiver.
                </p>
                <div className="p-2.5 rounded-lg bg-black/40 border border-amber-500/20 text-[11px] font-mono text-amber-200">
                  &gt; Suporta vozes anime/loli e transmissão simultânea na call! 🧚🔊
                </div>
              </div>

              {/* /olho-do-diabo */}
              <div className="rounded-xl border border-cyan-500/30 bg-[#0d1017] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm text-cyan-400 flex items-center gap-1.5">
                    <Shield className="h-4 w-4 text-cyan-500" /> /olho-do-diabo
                  </span>
                  <Badge variant="secondary" className="text-[10px] bg-cyan-950 text-cyan-300 border-cyan-800">
                    alvo • Moderação
                  </Badge>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Sistema de inteligência de rede: consulta avançada de endereço IP ou domínio, provedor ISP, cidade, país e detecção de proxy/VPN.
                </p>
                <div className="p-2.5 rounded-lg bg-black/40 border border-cyan-500/20 text-[11px] font-mono text-cyan-200">
                  &gt; Diagnóstico de risco e rastreamento completo em embed negro! 👁️🌐
                </div>
              </div>

              {/* /painel-suporte */}
              <div className="rounded-xl border border-purple-500/30 bg-[#0d1017] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm text-purple-400 flex items-center gap-1.5">
                    <MessageSquare className="h-4 w-4 text-purple-500" /> /painel-suporte
                  </span>
                  <Badge variant="secondary" className="text-[10px] bg-purple-950 text-purple-300 border-purple-800">
                    Admin &amp; Mod
                  </Badge>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Envia a Central de Atendimento &amp; Suporte com botão interativo para os membros escolherem entre Suporte com IA ou com a Staff.
                </p>
                <div className="p-2.5 rounded-lg bg-black/40 border border-purple-500/20 text-[11px] font-mono text-purple-200">
                  &gt; Criação automática de salas privadas e notificações na DM! 🎫🔒
                </div>
              </div>

              {/* /enviar-embed */}
              <div className="rounded-xl border border-pink-500/30 bg-[#0d1017] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm text-pink-400 flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-pink-500" /> /enviar-embed
                  </span>
                  <Badge variant="secondary" className="text-[10px] bg-pink-950 text-pink-300 border-pink-800">
                    Admin &amp; Mod
                  </Badge>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Envia mensagens customizadas no servidor com título, descrição formatada e imagem opcional em estilo visual futurista.
                </p>
                <div className="p-2.5 rounded-lg bg-black/40 border border-pink-500/20 text-[11px] font-mono text-pink-200">
                  &gt; Suporta quebras de linha com \n e URLs de imagens/GIFs! 📢✨
                </div>
              </div>

              {/* /apagar-tickets */}
              <div className="rounded-xl border border-rose-500/30 bg-[#0d1017] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm text-rose-400 flex items-center gap-1.5">
                    <Trash2 className="h-4 w-4 text-rose-500" /> /apagar-tickets
                  </span>
                  <Badge variant="secondary" className="text-[10px] bg-rose-950 text-rose-300 border-rose-800">
                    modo • Admin &amp; Mod
                  </Badge>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Apaga todas as mensagens de abrir ticket (antigas e novas) e todas as mensagens do bot no canal atual ou em todos os canais de texto do servidor.
                </p>
                <div className="p-2.5 rounded-lg bg-black/40 border border-rose-500/20 text-[11px] font-mono text-rose-200">
                  &gt; Limpeza rápida de painéis de suporte antigos e mensagens do bot! 🧹🗑️
                </div>
              </div>

              {/* /painel-ip */}
              <div className="rounded-xl border border-rose-600/30 bg-[#0d1017] p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sm text-rose-500 flex items-center gap-1.5">
                    <Shield className="h-4 w-4 text-rose-500" /> /painel-ip
                  </span>
                  <Badge variant="secondary" className="text-[10px] bg-rose-950 text-rose-300 border-rose-800">
                    Apenas Administradores
                  </Badge>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Envia o painel Olho do Diabo no canal <code>BUSCAR IP</code> com o botão para os membros abrirem tickets de consulta de IP em chat privado.
                </p>
                <div className="p-2.5 rounded-lg bg-black/40 border border-rose-500/20 text-[11px] font-mono text-rose-200">
                  &gt; Painel exclusivo com GIF olho vermelho e extração detalhada de rede! 👁️🔥
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: TEMPLATE DE CANAIS EM NEGRITO MATEMÁTICO */}
        {activeTab === "template" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Header / Apply Action Box */}
            <div className="rounded-xl border border-purple-500/40 bg-[#0d1017] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cyber-glow-pink">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-purple-400" /> Template Oficial em Negrito Matemático
                  </h3>
                  <Badge variant="outline" className="border-purple-500/40 text-purple-300 text-[10px]">
                    Limpeza Completa (Apaga Anteriores e Cria do Zero)
                  </Badge>
                </div>
                <p className="text-xs text-neutral-400">
                  Apaga todos os canais anteriores do servidor e recria do zero o template oficial com canais em negrito maiúsculo sem emojis, canais de anúncio e categoria privada de tickets.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={handleApplyBoldTemplate}
                  disabled={busy === "template"}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold text-xs cursor-pointer shadow-md shadow-purple-600/25 gap-1.5"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {busy === "template" ? "Limpando e Criando..." : "Limpar e Aplicar Template"}
                </Button>
              </div>
            </div>

            {/* Template Channel Layout Preview Cards */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Category 1: Informações */}
              <div className="rounded-xl border border-neutral-800 bg-[#0d1017] p-4 space-y-2.5">
                <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
                  <span className="font-bold text-xs text-white">━━━ INFORMAÇÕES ━━━</span>
                  <Badge variant="outline" className="text-[9px] border-neutral-700 text-neutral-300">
                    7 Canais (Topo)
                  </Badge>
                </div>
                <div className="space-y-1.5 font-mono text-[11px]">
                  <div className="flex items-center justify-between text-neutral-300 bg-black/30 px-2 py-1 rounded">
                    <span>𝗘𝗡𝗧𝗥𝗔𝗗𝗔</span>
                    <span className="text-[9px] text-pink-400 font-sans">Anúncio</span>
                  </div>
                  <div className="flex items-center justify-between text-neutral-300 bg-black/30 px-2 py-1 rounded">
                    <span>𝗦𝗔𝗜𝗗𝗔</span>
                    <span className="text-[9px] text-pink-400 font-sans">Anúncio</span>
                  </div>
                  <div className="flex items-center justify-between text-neutral-300 bg-black/30 px-2 py-1 rounded">
                    <span>𝗔𝗡Ú𝗡𝗖𝗜𝗢𝗦</span>
                    <span className="text-[9px] text-pink-400 font-sans">Anúncio</span>
                  </div>
                  <div className="flex items-center justify-between text-cyan-300 bg-black/30 px-2 py-1 rounded">
                    <span>𝗕𝗨𝗦𝗖𝗔𝗥 𝗜𝗣</span>
                    <span className="text-[9px] text-neutral-400 font-sans">Texto</span>
                  </div>
                  <div className="flex items-center justify-between text-purple-300 bg-black/30 px-2 py-1 rounded">
                    <span>𝗦𝗨𝗣𝗢𝗥𝗧𝗘</span>
                    <span className="text-[9px] text-neutral-400 font-sans">Texto</span>
                  </div>
                  <div className="flex items-center justify-between text-neutral-300 bg-black/30 px-2 py-1 rounded">
                    <span>𝗦𝗠𝗦</span>
                    <span className="text-[9px] text-neutral-400 font-sans">Texto</span>
                  </div>
                  <div className="flex items-center justify-between text-neutral-300 bg-black/30 px-2 py-1 rounded">
                    <span>𝗣𝗟𝗔𝗤𝗨𝗜𝗡𝗛𝗔𝗦</span>
                    <span className="text-[9px] text-neutral-400 font-sans">Texto</span>
                  </div>
                </div>
              </div>

              {/* Category 2: CALLS & MÚSICA */}
              <div className="rounded-xl border border-neutral-800 bg-[#0d1017] p-4 space-y-2.5">
                <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
                  <span className="font-bold text-xs text-white">━━━ CALLS ━━━ &amp; ━━━ MÚSICA ━━━</span>
                  <Badge variant="outline" className="text-[9px] border-neutral-700 text-neutral-300">
                    6 Canais de Voz
                  </Badge>
                </div>
                <div className="space-y-1.5 font-mono text-[11px]">
                  <div className="text-emerald-300 bg-black/30 px-2 py-1 rounded">𝗖𝗔𝗟𝗟 𝗜</div>
                  <div className="text-emerald-300 bg-black/30 px-2 py-1 rounded">𝗖𝗔𝗟𝗟 𝗜𝗜</div>
                  <div className="text-emerald-300 bg-black/30 px-2 py-1 rounded">𝗖𝗔𝗟𝗟 𝗜𝗜𝗜</div>
                  <div className="text-amber-300 bg-black/30 px-2 py-1 rounded mt-2">𝗠Ú𝗦𝗜𝗖𝗔 𝗜</div>
                  <div className="text-amber-300 bg-black/30 px-2 py-1 rounded">𝗠Ú𝗦𝗜𝗖𝗔 𝗜𝗜</div>
                  <div className="text-amber-300 bg-black/30 px-2 py-1 rounded">𝗠Ú𝗦𝗜𝗖𝗔 𝗜𝗜𝗜</div>
                </div>
              </div>

              {/* Category 3: GF, AFK & TICKETS */}
              <div className="rounded-xl border border-neutral-800 bg-[#0d1017] p-4 space-y-2.5">
                <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
                  <span className="font-bold text-xs text-white">━━━ GF ━━━, ━━━ AFK ━━━ &amp; ━━━ TICKETS ━━━</span>
                  <Badge variant="outline" className="text-[9px] border-neutral-700 text-neutral-300">
                    Privado &amp; Voz
                  </Badge>
                </div>
                <div className="space-y-1.5 font-mono text-[11px]">
                  <div className="text-pink-300 bg-black/30 px-2 py-1 rounded">𝗚𝗙 𝗜 até 𝗚𝗙 𝗜𝗜𝗜</div>
                  <div className="text-neutral-400 bg-black/30 px-2 py-1 rounded">𝗔𝗙𝗞 𝗜 até 𝗔𝗙𝗞 𝗜𝗜𝗜</div>
                  <div className="flex items-center justify-between text-rose-300 bg-rose-950/20 border border-rose-900/40 px-2 py-1.5 rounded mt-3">
                    <span className="font-bold">━━━ TICKETS PRIVADOS ━━━</span>
                    <span className="text-[9px] text-rose-400 font-sans">@everyone negado</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Alternating Zig-Zag Styler */}
            <div className="rounded-xl border border-neutral-800 bg-[#0d1017] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-neutral-400" /> Estilo Alternado Zig-Zag
                </h4>
                <p className="text-xs text-neutral-400">
                  Caso deseje alternar símbolos nas pontas dos canais existentes em zigue-zague (ex: <code>╭・canal・⟡</code> e <code>╰・canal・⟣</code>).
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleApplyZigZagTemplate("curved")}
                  disabled={busy === "zigzag"}
                  className="border-neutral-700 bg-neutral-800/40 text-neutral-300 hover:bg-neutral-800 text-xs cursor-pointer"
                >
                  {busy === "zigzag" ? "Aplicando..." : "Aplicar Zig-Zag"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: TICKETS & CENTRAL DE ATENDIMENTO */}
        {activeTab === "tickets" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Deploy Support Panel Direct Action */}
            <div className="rounded-xl border border-emerald-500/40 bg-[#0d1017] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cyber-glow-pink">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-bold text-white uppercase tracking-wide">
                    Enviar Central de Atendimento &amp; Suporte
                  </span>
                  <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[10px]">
                    Comandos &amp; Botões Discord
                  </Badge>
                </div>
                <p className="text-xs text-neutral-400">
                  Envia o Embed compacto oficial com GIF Hacker Meme e o botão <strong>Abrir Ticket</strong>. Ao clicar, o membro preenche o chamado em tela modal e o conteúdo é enviado imediatamente para a DM dos administradores enquanto o canal é criado.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2 shrink-0 w-full sm:w-auto">
                <select
                  value={supportPanelChannelId}
                  onChange={(e) => setSupportPanelChannelId(e.target.value)}
                  className="h-8 text-xs bg-[#131722] border border-neutral-700 rounded-md px-2 text-white w-full sm:w-48"
                >
                  <option value="">Selecione o canal...</option>
                  {guild?.channels
                    .filter((c) => c.type === 0)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.name}
                      </option>
                    ))}
                </select>

                <Button
                  size="sm"
                  onClick={handleSendSupportPanel}
                  disabled={sendingSupportPanel || !supportPanelChannelId}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs cursor-pointer shadow-md shadow-emerald-600/30 w-full sm:w-auto shrink-0"
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  {sendingSupportPanel ? "Enviando..." : "Enviar no Canal"}
                </Button>
              </div>
            </div>

            {/* Deploy Olho do Diabo IP Panel Direct Action */}
            <div className="rounded-xl border border-rose-600/40 bg-[#0d1017] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-rose-500" />
                  <span className="text-sm font-bold text-white uppercase tracking-wide">
                    Enviar Painel Olho do Diabo (Busca de IP)
                  </span>
                  <Badge variant="outline" className="border-rose-500/40 text-rose-300 text-[10px]">
                    /painel-ip
                  </Badge>
                </div>
                <p className="text-xs text-neutral-400">
                  Envia o Embed oficial com o Olho do Diabo (GIF olho vermelho) e o botão <strong>Abrir Ticket de IP</strong> para o canal <code>BUSCAR IP</code>. O membro digita o IP no chat privado para extrair a localização e dados de rede.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2 shrink-0 w-full sm:w-auto">
                <select
                  value={ipPanelChannelId}
                  onChange={(e) => setIpPanelChannelId(e.target.value)}
                  className="h-8 text-xs bg-[#131722] border border-neutral-700 rounded-md px-2 text-white w-full sm:w-48"
                >
                  <option value="">Selecione o canal...</option>
                  {guild?.channels
                    .filter((c) => c.type === 0)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.name}
                      </option>
                    ))}
                </select>

                <Button
                  size="sm"
                  onClick={handleSendIpPanel}
                  disabled={sendingIpPanel || !ipPanelChannelId}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs cursor-pointer shadow-md shadow-rose-600/30 w-full sm:w-auto shrink-0"
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  {sendingIpPanel ? "Enviando..." : "Enviar no Canal"}
                </Button>
              </div>
            </div>

            {/* Purge Ticket Panels & Bot Messages Action */}
            <div className="rounded-xl border border-rose-500/40 bg-[#0d1017] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4 text-rose-400" />
                  <span className="text-sm font-bold text-white uppercase tracking-wide">
                    Sistema: Apagar Tickets &amp; Mensagens do Bot
                  </span>
                  <Badge variant="outline" className="border-rose-500/40 text-rose-300 text-[10px]">
                    /apagar-tickets
                  </Badge>
                </div>
                <p className="text-xs text-neutral-400">
                  Apaga todas as mensagens de abrir ticket (tanto antigas quanto novas) e todas as mensagens enviadas pelo bot no canal ou em todo o servidor.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2 shrink-0 w-full sm:w-auto">
                <div className="flex items-center gap-1 bg-[#131722] p-1 rounded-lg border border-neutral-800 text-xs w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setCleanTicketsMode("canal")}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                      cleanTicketsMode === "canal"
                        ? "bg-rose-600 text-white shadow-sm"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    No Canal
                  </button>
                  <button
                    type="button"
                    onClick={() => setCleanTicketsMode("all")}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition cursor-pointer ${
                      cleanTicketsMode === "all"
                        ? "bg-rose-600 text-white shadow-sm"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    Todos os Canais
                  </button>
                </div>

                {cleanTicketsMode === "canal" && (
                  <select
                    value={supportPanelChannelId}
                    onChange={(e) => setSupportPanelChannelId(e.target.value)}
                    className="h-8 text-xs bg-[#131722] border border-neutral-700 rounded-md px-2 text-white w-full sm:w-44"
                  >
                    <option value="">Selecione o canal...</option>
                    {guild?.channels
                      .filter((c) => c.type === 0)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          #{c.name}
                        </option>
                      ))}
                  </select>
                )}

                <Button
                  size="sm"
                  onClick={handleCleanTicketsMessages}
                  disabled={cleaningTickets || (cleanTicketsMode === "canal" && !supportPanelChannelId)}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs cursor-pointer shadow-md shadow-rose-600/30 w-full sm:w-auto shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  {cleaningTickets ? "Apagando..." : "Apagar Tickets & Mensagens"}
                </Button>
              </div>
            </div>

            {/* Direct Admin Ticket Config & Status */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-neutral-800 bg-[#0d1017] p-4 space-y-2">
                <span className="font-bold text-xs text-neutral-300 flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-blue-400" /> Suporte Direto com Administradores
                </span>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Os chamados são abertos exclusivamente com a equipe humana de administração do servidor, com embed compacto e GIF meme hacker.
                </p>
                <div className="p-2.5 rounded-lg bg-black/40 border border-neutral-800 text-[11px] text-neutral-300 space-y-1">
                  <div>• Notificação imediata com o conteúdo do chamado enviada na DM dos administradores.</div>
                  <div>• Canal privado criado automaticamente para atendimento direto e seguro.</div>
                </div>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-[#0d1017] p-4 space-y-2">
                <span className="font-bold text-xs text-neutral-300 flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-purple-400" /> Sistema de Alerta &amp; Cooldown
                </span>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Dentro do ticket, os botões <strong>Alertar Administrador</strong> e <strong>Fechar Ticket</strong> garantem suporte ágil e controlado:
                </p>
                <div className="p-2.5 rounded-lg bg-black/40 border border-neutral-800 text-[11px] text-neutral-300 space-y-1">
                  <div>• Cooldown de 1 minuto entre notificações para evitar spam.</div>
                  <div>• Limite de até 3 alertas por ticket antes de bloquear chamados repetidos.</div>
                </div>
              </div>
            </div>

            {/* Active Tickets List */}
            <div className="rounded-xl border border-neutral-800 bg-[#0d1017] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-emerald-400" /> Tickets Ativos no Servidor ({ticketsList.length})
                </h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchTickets}
                  disabled={loadingTickets}
                  className="h-7 text-xs border-neutral-700 bg-neutral-800/40 text-neutral-300 hover:bg-neutral-800 cursor-pointer"
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${loadingTickets ? "animate-spin" : ""}`} />
                  Atualizar
                </Button>
              </div>

              {ticketsList.length === 0 ? (
                <div className="p-6 text-center text-xs text-neutral-500 bg-black/20 rounded-lg border border-neutral-800/50">
                  Nenhum ticket aberto no momento. Use <code>/painel-suporte</code> no Discord ou envie o painel acima para abrir novos atendimentos!
                </div>
              ) : (
                <div className="space-y-2">
                  {ticketsList.map((t) => (
                    <div
                      key={t.channelId}
                      className="flex items-center justify-between p-3 rounded-lg border border-neutral-800 bg-black/30 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-mono font-semibold text-white flex items-center gap-2">
                          #{t.channelName || t.channelId}
                          <Badge
                            variant="secondary"
                            className={`text-[9px] ${
                              t.type === "ai"
                                ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                                : "bg-purple-950 text-purple-300 border-purple-800"
                            }`}
                          >
                            {t.type === "ai" ? "🤖 Suporte IA" : "👥 Administradores"}
                          </Badge>
                        </div>
                        <div className="text-[11px] text-neutral-400">
                          Aberto por: <span className="text-neutral-300">{t.ownerTag || t.ownerId}</span> • Alertas: {t.alertCount || 0}/3
                        </div>
                      </div>

                      <div className="text-[10px] text-neutral-500 font-mono">
                        {new Date(t.createdAt).toLocaleTimeString("pt-BR")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: FALA & CALL DE VOZ */}
        {activeTab === "tts" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Voice Channel Connection Box */}
            <div className="rounded-xl border border-amber-500/40 bg-[#0d1017] p-4 space-y-3 cyber-glow-pink">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Headphones className="h-4 w-4 text-amber-400" /> Transmissão de Som em Call de Voz
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Selecione um canal de voz. O bot entra na call com a <b>escuta desligada (🎧🔇)</b> e reproduz em voz alta tudo o que você digitar!
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {voiceStatus.connected ? (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-xs font-mono font-bold">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
                      🎧🔇 Conectado: {voiceStatus.channelName || "Call"} (Escuta Desligada)
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-neutral-700 bg-neutral-800/60 text-neutral-400 text-xs font-mono">
                      <span className="h-2 w-2 rounded-full bg-neutral-500"></span>
                      Fora de Call de Voz
                    </span>
                  )}
                </div>
              </div>

              {/* Voice Channel Selector & Call Controls */}
              <div className="grid sm:grid-cols-3 gap-2.5 pt-1">
                <div className="sm:col-span-2">
                  <label className="text-[11px] text-neutral-400 block mb-1">
                    Selecione o Canal de Voz (Call)
                  </label>
                  <select
                    value={voiceChannelId}
                    onChange={(e) => setVoiceChannelId(e.target.value)}
                    className="h-9 w-full rounded-md border border-neutral-700 bg-[#131722] px-3 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  >
                    {guild?.channels?.filter((c) => c.type === 2).length === 0 ? (
                      <option value="">Nenhum canal de voz encontrado</option>
                    ) : (
                      guild?.channels
                        ?.filter((c) => c.type === 2)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            🔊 {c.name}
                          </option>
                        ))
                    )}
                  </select>
                </div>

                <div className="flex items-end gap-2">
                  <Button
                    onClick={() => handleJoinVoiceCall()}
                    disabled={joiningVoice || !voiceChannelId}
                    className="flex-1 h-9 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs gap-1.5 cursor-pointer"
                  >
                    <Headphones className="h-3.5 w-3.5" />
                    {joiningVoice ? "Entrando..." : "Entrar na Call"}
                  </Button>

                  {voiceStatus.connected && (
                    <Button
                      onClick={handleLeaveVoiceCall}
                      variant="destructive"
                      className="h-9 px-3 text-xs gap-1.5 cursor-pointer"
                      title="Sair da Call de Voz"
                    >
                      <PhoneOff className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Speech Generation & Broadcast Box */}
            <div className="rounded-xl border border-neutral-800 bg-[#0d1017] p-4 space-y-3">
              {/* CapCut Voice Selection */}
              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-pink-400" />
                  Voz Oficial CapCut / TikTok TTS:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { id: "lhays_anime", label: "🧚 Dubladora Anime BR", sub: "Lhays Macedo (Oficial)" },
                    { id: "br_menina", label: "🌸 Menina Fofa BR", sub: "Tom Agudo / Animação" },
                    { id: "br_suave", label: "✨ Fadinha Suave BR", sub: "Júlia / Calma e Doce" },
                    { id: "laizza", label: "🎀 Garota Expressiva", sub: "Laízza (Alegre)" },
                    { id: "tianmei", label: "🎋 Tianmei Anime", sub: "Chinesa Clássica" },
                  ].map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVoice(v.id)}
                      className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                        selectedVoice === v.id
                          ? "border-pink-500 bg-pink-500/15 text-pink-200 cyber-glow-pink"
                          : "border-neutral-800 bg-[#131722] text-neutral-400 hover:text-white hover:border-neutral-700"
                      }`}
                    >
                      <div className="text-xs font-semibold">{v.label}</div>
                      <div className="text-[10px] text-neutral-400">{v.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1 flex items-center gap-1.5">
                  <Mic className="h-3.5 w-3.5 text-pink-400" />
                  O que você quer que o bot fale na call?
                </label>
                <Textarea
                  placeholder="Escreva algo e envie para produzir o som do que você escreveu diretamente na call de voz com a voz selecionada..."
                  value={ttsContent}
                  onChange={(e) => setTtsContent(e.target.value)}
                  className="bg-[#131722] border-neutral-700 text-xs min-h-[75px] focus-visible:ring-amber-500"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => playBrowserSpeech(ttsContent || "Prévia de voz neural")}
                  className="text-xs gap-1.5 cursor-pointer bg-[#131722] hover:bg-neutral-800 border-neutral-700"
                >
                  <Play className="h-3 w-3 text-amber-400" /> Ouvir Prévia no Navegador
                </Button>

                <Button
                  onClick={() => handleSpeakInVoiceCall()}
                  disabled={speakingInVoice || !ttsContent.trim()}
                  className="bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold text-xs gap-2 px-5 h-9 cursor-pointer shadow-lg shadow-amber-600/25"
                >
                  <Volume2 className="h-4 w-4" />
                  {speakingInVoice ? "Transmitindo Áudio na Call..." : "Transmitir Som na Call de Voz"}
                </Button>
              </div>
            </div>

            {/* Quick Soundboard Buttons */}
            <div className="rounded-xl border border-neutral-800 bg-[#0d1017] p-4">
              <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block mb-2">
                Frases Rápidas (Transmissão Direta na Call com 1 Clique):
              </span>
              <div className="grid sm:grid-cols-2 gap-2">
                {[
                  "Atenção call: sopa de madrugada está expressamente proibida!",
                  "Microfone de pastelaria detectado na call!",
                  "Onii-chan, para de gritar no microfone pfv!",
                  "Dá aquele selinho gostoso e vem pra call!",
                  "Mãos bobas e tapinha na bunda autorizados na call!",
                  "Silêncio na call que a staff vai passar o recado agora!",
                ].map((phrase, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setTtsContent(phrase);
                      handleSpeakInVoiceCall(phrase);
                    }}
                    className="p-2.5 rounded-lg border border-neutral-800 bg-[#131722] hover:border-amber-500/50 hover:bg-[#181d2c] text-left text-xs text-neutral-300 transition-all cursor-pointer flex items-center justify-between group"
                  >
                    <span className="truncate group-hover:text-amber-200">{phrase}</span>
                    <Volume2 className="h-3.5 w-3.5 text-amber-400 shrink-0 ml-2 group-hover:scale-110 transition-transform" />
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Audio & Media Upload Soundboard */}
            <div className="rounded-xl border border-pink-500/30 bg-[#0d1017] p-4 space-y-3 cyber-glow-pink">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <UploadCloud className="h-4 w-4 text-pink-400" />
                    Upload & Soundboard de Mídia Personalizada
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Faça upload de qualquer arquivo (<b>MP3, OGG, WAV, MP4, WEBM, FLAC, AAC, MIDI</b>). O bot converte e reproduz o som instantaneamente na call!
                  </p>
                </div>
                <Badge variant="outline" className="border-pink-500/40 text-pink-300 text-[10px] w-fit">
                  Até 30MB • Conversão Automática
                </Badge>
              </div>

              {/* Upload Input Box */}
              <div className="p-3 rounded-lg border border-dashed border-neutral-700 bg-[#131722]/80 hover:border-pink-500/60 transition-colors flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="h-10 w-10 rounded-lg bg-pink-500/10 border border-pink-500/30 flex items-center justify-center shrink-0">
                    <FileAudio className="h-5 w-5 text-pink-400" />
                  </div>
                  <div className="min-w-0">
                    {selectedAudioFile ? (
                      <div>
                        <div className="text-xs font-semibold text-white truncate max-w-[280px]">
                          {selectedAudioFile.name}
                        </div>
                        <div className="text-[11px] text-pink-300/80">
                          {selectedAudioFile.size} • Pronto para reprodução
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-xs font-medium text-neutral-200">
                          Selecione um arquivo de áudio ou vídeo
                        </div>
                        <div className="text-[10px] text-neutral-400">
                          Formatos aceitos: .ogg, .mp3, .wav, .mp4, .webm, .midi, .flac
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <label className="h-8 px-3 rounded-md bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-200 flex items-center gap-1.5 cursor-pointer transition-colors border border-neutral-700">
                    <UploadCloud className="h-3.5 w-3.5 text-pink-400" />
                    Escolher Arquivo
                    <input
                      type="file"
                      accept="audio/*,video/*,.ogg,.mp3,.wav,.m4a,.flac,.aac,.mp4,.webm,.mid,.midi"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>

                  {selectedAudioFile && (
                    <Button
                      onClick={() => handlePlayUploadedMedia()}
                      disabled={uploadingAudio}
                      className="h-8 px-3.5 bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold text-xs gap-1.5 cursor-pointer shadow-md shadow-pink-600/20"
                    >
                      <Play className="h-3.5 w-3.5" />
                      {uploadingAudio ? "Enviando..." : "Transmitir na Call"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Uploaded Media History / Soundboard */}
              {customAudioHistory.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block">
                    Sons Carregados no Painel ({customAudioHistory.length}):
                  </span>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {customAudioHistory.map((item) => (
                      <div
                        key={item.id}
                        className="p-2 rounded-lg border border-neutral-800 bg-[#131722] flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Music className="h-3.5 w-3.5 text-pink-400 shrink-0" />
                          <div className="truncate">
                            <span className="text-neutral-200 font-medium truncate block">
                              {item.name}
                            </span>
                            <span className="text-[10px] text-neutral-500 block">
                              {item.size}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            onClick={() => handlePlayUploadedMedia(item)}
                            disabled={uploadingAudio}
                            className="h-7 px-2.5 text-[11px] bg-pink-600 hover:bg-pink-700 text-white gap-1 cursor-pointer"
                          >
                            <Play className="h-3 w-3" /> Tocar
                          </Button>
                          <button
                            type="button"
                            onClick={() =>
                              setCustomAudioHistory((prev) => prev.filter((p) => p.id !== item.id))
                            }
                            className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-red-400 cursor-pointer transition-colors"
                            title="Remover da lista"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: CARGOS & MEMBROS */}
        {activeTab === "roles" && (
          <div className="grid sm:grid-cols-2 gap-4 animate-in fade-in duration-200">
            {/* Assign Role Box */}
            <div className="rounded-xl border border-purple-500/30 bg-[#0d1017] p-4 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-purple-400" /> Atribuir Cargo no Servidor
              </h3>
              <form onSubmit={handleAssignRole} className="space-y-3">
                <div>
                  <label className="text-[11px] text-neutral-400 block mb-1">ID do Usuário Discord (Snowflake)</label>
                  <Input
                    placeholder="Ex: 282219466589208576"
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    className="font-mono text-xs bg-[#131722]"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-neutral-400 block mb-1">Cargo a Atribuir</label>
                  <select
                    value={targetRoleId}
                    onChange={(e) => setTargetRoleId(e.target.value)}
                    className="h-9 w-full rounded-md border border-neutral-700 bg-[#131722] px-3 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    {guild?.roles
                      ?.filter((r) => !r.managed && r.id !== guild.id)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </div>

                <Button
                  type="submit"
                  disabled={busy === "assign" || !targetUserId.trim() || !targetRoleId}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs cursor-pointer"
                >
                  {busy === "assign" ? "Atribuindo..." : "Conceder Cargo ao Membro"}
                </Button>
              </form>
            </div>

            {/* Roles List */}
            <div className="rounded-xl border border-neutral-800 bg-[#0d1017] p-4 flex flex-col">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5 mb-2">
                <Layers className="h-4 w-4 text-neutral-400" /> Cargos Existentes ({guild?.roles?.length || 0})
              </h3>
              <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto p-1">
                {guild?.roles?.map((r) => (
                  <Badge
                    key={r.id}
                    variant="secondary"
                    className={`gap-1.5 bg-[#131722] border text-xs ${
                      r.name.toLowerCase().trim() === "trisal totoso"
                        ? "border-pink-500 bg-pink-500/20 text-pink-300 font-bold"
                        : "border-neutral-800 text-neutral-300"
                    }`}
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: r.color ?? "#94a3b8" }}
                    />
                    {r.name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: SINCRONIZAR COMANDOS & STATUS */}
        {activeTab === "status" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Gateway Direct Connection Box */}
            <div className="rounded-xl border border-emerald-500/40 bg-[#0d1017] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-emerald-950/20">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <span className="text-sm font-bold text-white">Conexão Discord Gateway (WebSocket)</span>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                    RESPOSTA INSTANTÂNEA
                  </span>
                </div>
                <p className="text-xs text-neutral-400 max-w-xl">
                  O bot opera conectado ao WebSocket do Discord. Quando você digita um comando, a resposta é imediata (menos de 50ms), sem risco de timeout ou &quot;comando desconhecido&quot;.
                </p>
              </div>

              <Button
                onClick={handleReconnectGateway}
                disabled={reconnectingBot}
                variant="secondary"
                className="bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/50 text-emerald-300 font-bold text-xs shrink-0 cursor-pointer"
              >
                {reconnectingBot ? "Reconectando..." : "Reconectar Bot no Gateway"}
              </Button>
            </div>

            {/* Fix duplicates & sync commands */}
            <div className="rounded-xl border border-cyan-500/40 bg-[#0d1017] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cyber-glow-cyan">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-cyan-400" />
                  <span className="text-sm font-bold text-white">Apagar Comandos Antigos &amp; Registrar Apenas os 5 Novos</span>
                </div>
                <p className="text-xs text-neutral-400 max-w-xl">
                  Apaga completamente comandos de sites antigos (como <code>/load</code>, <code>/regras</code>, <code>/ip-embed</code>) e registra estritamente os 5 comandos novos tanto globalmente quanto em todos os servidores do bot.
                </p>
                <p className="text-[11px] text-pink-300 font-medium">
                  💡 Se você registrou e os comandos não aparecerem de imediato no seu Discord, feche e abra o Discord ou aperte <b>Ctrl + R</b> para recarregar o cache!
                </p>
              </div>

              <Button
                onClick={handleRegisterSlashCommands}
                disabled={busy === "cmd"}
                className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shrink-0 cursor-pointer shadow-md shadow-cyan-600/30 px-4 py-2"
              >
                {busy === "cmd" ? "Limpando e Registrando..." : "🔥 Apagar Antigos & Registrar Novos"}
              </Button>
            </div>

            {/* Official Commands List */}
            <div className="rounded-xl border border-neutral-800 bg-[#0d1017] p-4 space-y-3">
              <span className="text-xs font-bold text-neutral-300 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                <Sparkles className="h-4 w-4 text-pink-500" /> 6 Comandos Oficiais Ativos no Bot:
              </span>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {[
                  {
                    cmd: "/selinho",
                    params: "(user)",
                    desc: "Selinho gostoso e estalado no membro com direito a mordidinha no lábio.",
                    tag: "TODOS OS MEMBROS",
                    tagColor: "border-rose-500/40 text-rose-400 bg-rose-500/10",
                  },
                  {
                    cmd: "/tapa-na-bunda",
                    params: "(user)",
                    desc: "Tapão ardido e estalado na bunda com pegada forte e sussurro sensual.",
                    tag: "TODOS OS MEMBROS",
                    tagColor: "border-red-500/40 text-red-400 bg-red-500/10",
                  },
                  {
                    cmd: "/falar",
                    params: "(texto) [tts]",
                    desc: "Transmissão de áudio neural falada no canal de texto e na call de voz.",
                    tag: "VOZ & TTS",
                    tagColor: "border-amber-500/40 text-amber-400 bg-amber-500/10",
                  },
                  {
                    cmd: "/olho-do-diabo",
                    params: "(alvo)",
                    desc: "Rastreamento avançado de IP/rede, localização geográfica, detecção de VPN.",
                    tag: "MODERAÇÃO",
                    tagColor: "border-cyan-500/40 text-cyan-400 bg-cyan-500/10",
                  },
                  {
                    cmd: "/painel-suporte",
                    params: "(nenhum)",
                    desc: "Envia o painel interativo de atendimento e tickets no canal.",
                    tag: "ADMIN & MOD",
                    tagColor: "border-purple-500/40 text-purple-400 bg-purple-500/10",
                  },
                  {
                    cmd: "/enviar-embed",
                    params: "(titulo) (descricao) [imagem]",
                    desc: "Envia mensagem personalizada em formato Embed estilizado.",
                    tag: "ADMIN & MOD",
                    tagColor: "border-pink-500/40 text-pink-400 bg-pink-500/10",
                  },
                ].map((item, i) => (
                  <div key={i} className="p-3 rounded-lg border border-neutral-800 bg-[#121622] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-pink-300">{item.cmd}</span>
                      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${item.tagColor}`}>
                        {item.tag}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-cyan-400 block">{item.params}</span>
                    <p className="text-[11px] text-neutral-400 leading-tight">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Discord Credentials & Gateway Configuration */}
            <div className="rounded-xl border border-pink-500/30 bg-[#0d1017] p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-pink-400" />
                  <span className="text-sm font-bold text-white">Credenciais da Aplicação Discord</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                    GATEWAY WEBSOCKET 100% ATIVO
                  </span>
                </div>
              </div>

              {/* Informative notice explaining that Interactions Endpoint URL is not needed */}
              <div className="p-3 rounded-lg bg-pink-500/10 border border-pink-500/25 flex items-start gap-2.5">
                <Shield className="h-4 w-4 text-pink-400 shrink-0 mt-0.5" />
                <div className="text-xs text-neutral-300 space-y-1">
                  <p className="font-semibold text-pink-300">
                    Não é necessário configurar Interactions Endpoint URL!
                  </p>
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    O bot conecta diretamente aos servidores do Discord através do <b>Bot Token</b> e <b>Client Secret</b> via WebSocket. Deixe o campo <i>Interactions Endpoint URL</i> vazio no <b>Discord Developer Portal</b> para não receber erros de validação.
                  </p>
                </div>
              </div>

              {/* Badges overview */}
              <div className="grid sm:grid-cols-3 gap-2.5">
                <div className="p-2.5 rounded-lg border border-neutral-800 bg-[#121622] space-y-1">
                  <span className="text-[10px] font-mono text-neutral-400 uppercase block">DISCORD_BOT_TOKEN</span>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                    <span className="text-xs font-mono text-emerald-300 font-bold">Configurado &amp; Conectado</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-neutral-800 bg-[#121622] space-y-1">
                  <span className="text-[10px] font-mono text-neutral-400 uppercase block">DISCORD_APPLICATION_ID</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono text-cyan-300 truncate">{overview.bot.id}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-neutral-800 bg-[#121622] space-y-1">
                  <span className="text-[10px] font-mono text-neutral-400 uppercase block">DISCORD_CLIENT_SECRET</span>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-pink-400"></span>
                    <span className="text-xs font-mono text-pink-300 font-bold">
                      {overview.hasClientSecret || statusInfo?.clientSecretConfigured ? "Definido no .env" : "Disponível no Portal"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Credentials update form */}
              <form onSubmit={handleSaveCredentials} className="space-y-3 pt-2">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <div>
                      <label className="text-[11px] text-neutral-400 block mb-1">
                        Client Secret (DISCORD_CLIENT_SECRET)
                      </label>
                      <Input
                        placeholder="Cole o Client Secret (OAuth2 do Discord)"
                        value={configClientSecret}
                        onChange={(e) => setConfigClientSecret(e.target.value)}
                        type="password"
                        className="bg-[#121622] border-neutral-700 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <div>
                      <label className="text-[11px] text-neutral-400 block mb-1">
                        Bot Token (DISCORD_BOT_TOKEN)
                      </label>
                      <Input
                        placeholder="Atualizar Bot Token (opcional)"
                        value={configBotToken}
                        onChange={(e) => setConfigBotToken(e.target.value)}
                        type="password"
                        className="bg-[#121622] border-neutral-700 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] text-pink-400 font-semibold block mb-1">
                      Groq API Key (GROQ_API_KEY para openai/gpt-oss-120b)
                    </label>
                    <Input
                      placeholder="Cole sua chave da Groq para a IA responder nos tickets com openai/gpt-oss-120b"
                      value={configGroqKey}
                      onChange={(e) => setConfigGroqKey(e.target.value)}
                      type="password"
                      className="bg-[#121622] border-pink-500/40 text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={savingCreds || (!configClientSecret.trim() && !configBotToken.trim() && !configGroqKey.trim())}
                    className="bg-pink-600 hover:bg-pink-700 text-white font-semibold text-xs cursor-pointer shadow-md shadow-pink-600/20"
                  >
                    {savingCreds ? "Salvando..." : "Salvar Credenciais e Chaves no Painel"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
