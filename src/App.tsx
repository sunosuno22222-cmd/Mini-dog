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
  BarChart3,
  Vote,
  PlusCircle,
  CheckCircle2,
  Users,
  Monitor,
  Gamepad2,
  Tv,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { BotBroadcastPanel } from "@/components/BotBroadcastPanel";
import { CallGamePanel } from "@/components/CallGamePanel";
import { TransmissionPage } from "@/components/TransmissionPage";
import { BroadcastStage } from "@/components/BroadcastStage";
import { useBroadcastSocket } from "@/hooks/useBroadcastSocket";

interface StatusInfo {
  botTokenConfigured: boolean;
  testBotTokenConfigured?: boolean;
  clientSecretConfigured: boolean;
  publicKeyConfigured: boolean;
  appIdConfigured: boolean;
  gatewayConnected: boolean;
  testBotGatewayConnected?: boolean;
  testBot?: {
    configured: boolean;
    online: boolean;
    id: string | null;
    applicationId?: string | null;
    username: string | null;
    avatar: string | null;
    inviteUrl: string | null;
    guildsCount: number;
    guildIds?: string[];
    lastError?: string | null;
  };
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

function StandaloneBroadcastStageView() {
  const { state } = useBroadcastSocket();
  return <BroadcastStage state={state} fullscreenLayout />;
}

export default function App() {
  const isStandaloneBroadcastStage =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("stage") === "broadcast";

  const [password, setPassword] = useState("");
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [statusInfo, setStatusInfo] = useState<StatusInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [showConfigHelper, setShowConfigHelper] = useState(false);

  if (isStandaloneBroadcastStage) {
    return <StandaloneBroadcastStageView />;
  }

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
      <main className="min-h-screen flex items-center justify-center p-6 bg-[#090b11] text-slate-100">
        <Toaster position="top-right" richColors />
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0f131d] p-7 shadow-2xl">
            <div className="flex justify-center mb-5">
              <img
                src="/assets/panelbot.jpg"
                alt="Phoenix Reforged"
                className="h-16 w-16 rounded-2xl object-cover border border-white/15 shadow-md"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            </div>

            <div className="text-center mb-6 space-y-1">
              <h1 className="text-xl font-bold tracking-tight text-white">
                Phoenix Reforged
              </h1>
              <p className="text-xs text-slate-400">
                Painel de Controle Discord · Voz, Moderação &amp; Transmissão
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
  const [activeTab, setActiveTab] = useState<"call_game" | "transmission" | "broadcast" | "messages" | "ai_voice" | "moderation" | "polls" | "interactions" | "template" | "tickets" | "tts" | "roles" | "status">("moderation");
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
  const [configTestBotToken, setConfigTestBotToken] = useState("");
  const [configClientSecret, setConfigClientSecret] = useState("");
  const [configGroqKey, setConfigGroqKey] = useState("");
  const [savingCreds, setSavingCreds] = useState(false);

  // 2º Bot de Testes (Segurança & Spam) state
  const [quickTestBotToken, setQuickTestBotToken] = useState("");
  const [savingTestBot, setSavingTestBot] = useState(false);
  const [inspectingTestBot, setInspectingTestBot] = useState(false);
  const [authorizingTestBot, setAuthorizingTestBot] = useState(false);
  const [inspectedTestBot, setInspectedTestBot] = useState<{
    id: string;
    username: string | null;
    inviteUrl: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [runningTest, setRunningTest] = useState<string | null>(null);
  const [testChannelId, setTestChannelId] = useState("");
  const [customSpamText, setCustomSpamText] = useState("");

  // Tickets & Support Panel State
  const [supportPanelChannelId, setSupportPanelChannelId] = useState("");
  const [sendingSupportPanel, setSendingSupportPanel] = useState(false);
  const [ipPanelChannelId, setIpPanelChannelId] = useState("");
  const [sendingIpPanel, setSendingIpPanel] = useState(false);
  const [cleaningTickets, setCleaningTickets] = useState(false);
  const [cleanTicketsMode, setCleanTicketsMode] = useState<"canal" | "all">("canal");
  const [ticketsList, setTicketsList] = useState<any[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  // Polls / Enquetes State
  const [pollsList, setPollsList] = useState<any[]>([]);
  const [loadingPolls, setLoadingPolls] = useState(false);
  const [pollChannelId, setPollChannelId] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["Sim", "Não"]);
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [selectedPollVoters, setSelectedPollVoters] = useState<any | null>(null);

  // TTS in Call & Voice Channel state
  const [ttsContent, setTtsContent] = useState("");
  const [ttsChannelId, setTtsChannelId] = useState("");
  const [voiceChannelId, setVoiceChannelId] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("lhays_anime");
  const [selectedExpression, setSelectedExpression] = useState("shy");
  const [enableTtsVoice, setEnableTtsVoice] = useState(true);
  const [sendingTts, setSendingTts] = useState(false);

  // Envio de Mensagens (Texto ou Áudio com Voz do Bot) state
  const [msgChannelId, setMsgChannelId] = useState("");
  const [msgContent, setMsgContent] = useState("");
  const [msgAsAudio, setMsgAsAudio] = useState(false);
  const [msgVoice, setMsgVoice] = useState("lhays_anime");
  const [msgExpression, setMsgExpression] = useState("shy");
  const [sendingChannelMsg, setSendingChannelMsg] = useState(false);
  const [sentMessagesLog, setSentMessagesLog] = useState<
    Array<{ id: string; channelName: string; content: string; asAudio: boolean; voiceUsed?: string; time: string }>
  >([]);

  // IA de Voz (n! Groq Dual Personality: Normal, Biruta & VIP Papai Dog) state
  const [aiVoiceConfig, setAiVoiceConfig] = useState<{
    enabled: boolean;
    prefix: string;
    model: string;
    voice: string;
    expression: string;
    crazyChance: number;
    vipDaddyId: string;
    groqKeyConfigured: boolean;
  }>({
    enabled: true,
    prefix: "n!",
    model: "openai/gpt-oss-120b",
    voice: "lhays_anime",
    expression: "shy",
    crazyChance: 60,
    vipDaddyId: "1554257592015003674",
    groqKeyConfigured: false,
  });
  const [aiVoiceGroqInput, setAiVoiceGroqInput] = useState("");
  const [aiVoiceTestChannelId, setAiVoiceTestChannelId] = useState("");
  const [aiVoiceTestPrompt, setAiVoiceTestPrompt] = useState("Oi, tudo bem?");
  const [savingAiVoice, setSavingAiVoice] = useState(false);
  const [testingAiVoice, setTestingAiVoice] = useState<string | null>(null);
  const [aiVoiceLogs, setAiVoiceLogs] = useState<
    Array<{
      id: string;
      timestamp: number;
      author: string;
      channelId: string;
      prompt: string;
      reply: string;
      mood: "crazy" | "normal" | "vip_submissive";
      modelUsed: string;
      voice: string;
    }>
  >([]);
  const [joiningVoice, setJoiningVoice] = useState(false);
  const [speakingInVoice, setSpeakingInVoice] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<{
    connected: boolean;
    channelId: string | null;
    channelName: string | null;
    selfDeaf: boolean;
    isPlaying: boolean;
    membersInCall?: Array<{ id: string; username: string; avatar: string | null; bot: boolean }>;
    serverRegion?: string;
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

  // Cloned Voice Studio State
  const [clonedVoices, setClonedVoices] = useState<
    Array<{ id: string; name: string; sampleBase64: string; mcpVoiceId?: string; createdAt: number }>
  >([]);
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [recordedAudioBase64, setRecordedAudioBase64] = useState<string | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [cloneVoiceName, setCloneVoiceName] = useState("Minha Voz Clonada");
  const [cloningVoice, setCloningVoice] = useState(false);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);


  // Role assignment state
  const [targetUserId, setTargetUserId] = useState("");
  const [targetRoleId, setTargetRoleId] = useState("");

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configBotToken.trim() && !configTestBotToken.trim() && !configClientSecret.trim() && !configGroqKey.trim()) {
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
          testBotToken: configTestBotToken.trim() || undefined,
          clientSecret: configClientSecret.trim() || undefined,
          groqApiKey: configGroqKey.trim() || undefined,
          appId: overview.bot.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar credenciais.");
      toast.success("Credenciais e chaves atualizadas com sucesso!");
      setConfigBotToken("");
      setConfigTestBotToken("");
      setConfigClientSecret("");
      setConfigGroqKey("");
      onRefresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingCreds(false);
    }
  };

  const decodeBotIdFromInput = (input: string): string | null => {
    const clean = input.trim();
    if (!clean) return null;
    if (/^\d{17,22}$/.test(clean)) return clean;
    const firstPart = clean.split(".")[0];
    if (!firstPart) return null;
    try {
      const normalized = firstPart.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = atob(normalized).trim();
      return /^\d{17,22}$/.test(decoded) ? decoded : null;
    } catch {
      return null;
    }
  };

  const liveDecodedTestBotId = decodeBotIdFromInput(quickTestBotToken);
  const resolvedTestBotId =
    inspectedTestBot?.id || statusInfo?.testBot?.id || liveDecodedTestBotId || null;
  const resolvedTestBotInviteUrl =
    inspectedTestBot?.inviteUrl ||
    statusInfo?.testBot?.inviteUrl ||
    (resolvedTestBotId
      ? `https://discord.com/oauth2/authorize?client_id=${resolvedTestBotId}&permissions=274877910016&scope=bot`
      : null);
  const isTestBotInSelectedGuild = Boolean(
    guildId && statusInfo?.testBot?.guildIds?.includes(guildId)
  );

  const handleCopyText = async (key: string, value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(key);
      toast.success(`${label} copiado!`);
      setTimeout(() => setCopiedField((prev) => (prev === key ? null : prev)), 2000);
    } catch {
      toast.error("Não foi possível copiar automaticamente.");
    }
  };

  const handleInspectTestBot = async () => {
    const val = quickTestBotToken.trim();
    if (!val && !statusInfo?.testBot?.id) {
      toast.error("Cole o Token ou o Client ID do Bot de Spam primeiro.");
      return;
    }
    setInspectingTestBot(true);
    try {
      const res = await fetch("/api/discord/test-bot/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, tokenOrId: val || statusInfo?.testBot?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível obter o ID.");
      setInspectedTestBot({
        id: data.id,
        username: data.username || null,
        inviteUrl: data.inviteUrl,
      });
      toast.success(
        data.unbanned
          ? `🔓 Bot desbanido e liberado! ID: ${data.id}`
          : `🆔 ID do Bot de Spam obtido e pré-autorizado: ${data.id}`
      );
      onRefresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setInspectingTestBot(false);
    }
  };

  const handleAuthorizeUnbanTestBot = async () => {
    const targetId = resolvedTestBotId || quickTestBotToken.trim();
    if (!targetId) {
      toast.error("Cole o Token ou ID do Bot de Spam primeiro.");
      return;
    }
    setAuthorizingTestBot(true);
    try {
      const res = await fetch("/api/discord/test-bot/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          guildId: guildId || undefined,
          botId: decodeBotIdFromInput(targetId) || targetId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao desbanir e liberar bot.");
      toast.success(data.message);
      fetchModerationStatus();
      onRefresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAuthorizingTestBot(false);
    }
  };

  const handleConnectTestBot = async () => {
    const val = quickTestBotToken.trim();
    if (!val) {
      toast.error("Cole o Token ou Client ID do 2º Bot de Testes (TEST_BOT_TOKEN).");
      return;
    }
    const isJustId = /^\d{17,22}$/.test(val);
    setSavingTestBot(true);
    try {
      const res = await fetch("/api/discord/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isJustId
            ? { password, testBotAppId: val }
            : { password, testBotToken: val }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao conectar o 2º Bot de Testes.");
      if (data.testBot?.id) {
        setInspectedTestBot({
          id: data.testBot.id,
          username: data.testBot.username || null,
          inviteUrl:
            data.testBot.inviteUrl ||
            `https://discord.com/oauth2/authorize?client_id=${data.testBot.id}&permissions=274877910016&scope=bot`,
        });
      }
      if (isJustId) {
        toast.success(`🔗 Link de convite gerado para o ID ${val}! Agora cole o Token para ligar o bot.`);
      } else if (data.error) {
        toast.error(`Falha ao conectar 2º Bot: ${data.error}`);
      } else {
        toast.success(
          data.testBot?.online
            ? `🧪 2º Bot conectado (${data.testBot.username}) • ID: ${data.testBot.id}`
            : `Token salvo! ID detectado: ${data.testBot?.id || "verifique no painel"}`
        );
        setQuickTestBotToken("");
      }
      onRefresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingTestBot(false);
    }
  };

  const handleReconnectTestBot = async () => {
    setSavingTestBot(true);
    try {
      const res = await fetch("/api/discord/reconnect-test-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao reconectar 2º Bot.");
      if (data.online) {
        toast.success(`🧪 2º Bot de Testes online: ${data.user}`);
      } else if (data.error) {
        toast.error(`Erro no 2º Bot: ${data.error}`);
      } else {
        toast.info("Configure TEST_BOT_TOKEN no .env ou no campo acima para conectar o 2º Bot.");
      }
      onRefresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingTestBot(false);
    }
  };

  const handleRunSecurityTest = async (testType: "spam" | "invite" | "massping" | "raid" | "all") => {
    if (!guildId || !testChannelId) {
      toast.error("Selecione o servidor e o canal de texto alvo para executar o teste!");
      return;
    }
    setRunningTest(testType);
    try {
      const res = await fetch("/api/discord/test-bot/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          guildId,
          channelId: testChannelId,
          testType,
          customText: customSpamText.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao executar teste.");
      toast.success(data.message);
      if (data.hasAdminWarning) {
        toast.warning("⚠️ O 2º Bot possui cargo Administrador — remova o Admin dele para que os canais fiquem ocultos durante os 10s de castigo!");
      }
      setTimeout(() => fetchModerationStatus(), 1500);
      setTimeout(() => fetchModerationStatus(), 11500);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRunningTest(null);
    }
  };

  const fetchVoiceStatus = async (id: string, targetChannelId?: string) => {
    try {
      const res = await fetch("/api/discord/voice/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          guildId: id,
          channelId: targetChannelId || voiceChannelId || undefined,
        }),
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

  const [creatingQuarantineChan, setCreatingQuarantineChan] = useState(false);
  const handleCreateQuarantineChannel = async () => {
    if (!guildId) {
      toast.error("Selecione um servidor ativo!");
      return;
    }
    setCreatingQuarantineChan(true);
    try {
      const res = await fetch("/api/discord/moderation/create-quarantine-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, guildId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao criar canal de quarentena.");
      toast.success(data.message);
      refreshGuild(guildId);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreatingQuarantineChan(false);
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

  const [mcpApiKey, setMcpApiKey] = useState("");

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
          mcpApiKey: mcpApiKey.trim() || undefined,
          expression: selectedExpression,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao transmitir voz na call");
      toast.success(
        `🔊 Som transmitido na call "${data.channelName}" (${data.voiceUsed || "Voz TTS"} | Expressão: ${data.expressionUsed || selectedExpression}): "${data.text}"`
      );
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
        if (firstText) {
          setTtsChannelId(firstText.id);
          setMsgChannelId((prev) => prev || firstText.id);
          setAiVoiceTestChannelId((prev) => prev || firstText.id);
          setTestChannelId((prev) => prev || firstText.id);
        }
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

  const fetchClonedVoices = async () => {
    try {
      const res = await fetch("/api/discord/voice/cloned-voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.voices)) {
        setClonedVoices(data.voices);
      }
    } catch {}
  };

  useEffect(() => {
    setGuild(null);
    if (guildId) {
      refreshGuild(guildId);
      fetchVoiceStatus(guildId);
    }
    fetchClonedVoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId]);

  const startMicRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(audioBlob);
        setRecordedAudioUrl(url);

        const reader = new FileReader();
        reader.onloadend = () => {
          setRecordedAudioBase64(reader.result as string);
        };
        reader.readAsDataURL(audioBlob);

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecordingMic(true);
      toast.info("🎙️ Gravando sua voz pelo microfone! Fale por 3 a 10 segundos...");
    } catch (err) {
      toast.error("Permissão de microfone negada ou indisponível: " + (err as Error).message);
    }
  };

  const stopMicRecording = () => {
    if (mediaRecorderRef.current && isRecordingMic) {
      mediaRecorderRef.current.stop();
      setIsRecordingMic(false);
      toast.success("Gravação concluída! Prévia pronta para clonar.");
    }
  };

  const handleSaveClonedVoice = async () => {
    if (!recordedAudioBase64) {
      toast.error("Grave ou envie um áudio de referência primeiro!");
      return;
    }

    setCloningVoice(true);
    try {
      const res = await fetch("/api/discord/voice/clone-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          voiceName: cloneVoiceName.trim() || "Minha Voz Clonada",
          sampleBase64: recordedAudioBase64,
          apiKey: mcpApiKey.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao clonar voz.");
      toast.success(`⚡ Voz "${data.voice.name}" clonada e salva PARA SEMPRE!`);
      setSelectedVoice(data.voice.id);
      fetchClonedVoices();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCloningVoice(false);
    }
  };

  const handleDeleteClonedVoice = async (id: string) => {
    try {
      const res = await fetch("/api/discord/voice/delete-cloned-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao deletar voz clonada.");
      toast.success("Voz clonada removida com sucesso.");
      if (selectedVoice === id) {
        setSelectedVoice("lhays_anime");
      }
      fetchClonedVoices();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

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

  const fetchPolls = async () => {
    setLoadingPolls(true);
    try {
      const res = await fetch("/api/discord/polls/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, guildId }),
      });
      const data = await res.json();
      if (data.success) {
        setPollsList(data.polls || []);
      }
    } catch {}
    finally {
      setLoadingPolls(false);
    }
  };

  const handleCreatePoll = async () => {
    if (!pollChannelId) {
      toast.error("Selecione o canal onde a enquete será postada.");
      return;
    }
    if (!pollQuestion.trim()) {
      toast.error("Digite a pergunta ou tema da enquete.");
      return;
    }
    const valid = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (valid.length < 2) {
      toast.error("A enquete precisa de no mínimo 2 opções válidas.");
      return;
    }

    setCreatingPoll(true);
    try {
      const res = await fetch("/api/discord/polls/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          channelId: pollChannelId,
          question: pollQuestion.trim(),
          options: valid,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao criar enquete");
      toast.success("📊 Enquete interativa publicada com sucesso no Discord!");
      setPollQuestion("");
      setPollOptions(["Sim", "Não"]);
      fetchPolls();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreatingPoll(false);
    }
  };

  const handleClosePoll = async (pollId: string) => {
    try {
      const res = await fetch("/api/discord/polls/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, pollId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao encerrar enquete");
      toast.success(data.message || "Enquete encerrada com sucesso!");
      fetchPolls();
    } catch (err) {
      toast.error((err as Error).message);
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

  const handleSendChannelMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!msgChannelId) {
      toast.error("Selecione o canal de texto de destino!");
      return;
    }
    if (!msgContent.trim()) {
      toast.error("Escreva a mensagem que deseja enviar!");
      return;
    }

    setSendingChannelMsg(true);
    try {
      const res = await fetch("/api/discord/send-channel-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          channelId: msgChannelId,
          content: msgContent.trim(),
          asAudio: msgAsAudio,
          voice: msgVoice,
          expression: msgExpression,
          mcpApiKey: mcpApiKey.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao enviar mensagem no canal.");

      const chanObj = guild?.channels.find((c) => c.id === msgChannelId);
      const chanLabel = chanObj ? `#${chanObj.name}` : msgChannelId;

      if (msgAsAudio) {
        toast.success(
          `🎙️ Áudio enviado em ${chanLabel} falando sua mensagem com a voz ${data.voiceUsed || "do Bot"}!`
        );
      } else {
        toast.success(`💬 Mensagem de texto enviada em ${chanLabel}!`);
      }

      setSentMessagesLog((prev) =>
        [
          {
            id: Date.now().toString(),
            channelName: chanLabel,
            content: msgContent.trim(),
            asAudio: msgAsAudio,
            voiceUsed: data.voiceUsed,
            time: new Date().toLocaleTimeString("pt-BR"),
          },
          ...prev,
        ].slice(0, 12)
      );
      setMsgContent("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSendingChannelMsg(false);
    }
  };

  const fetchAiVoiceStatus = async () => {
    try {
      const res = await fetch("/api/discord/ai-voice/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.config) setAiVoiceConfig(data.config);
        if (Array.isArray(data.logs)) setAiVoiceLogs(data.logs);
      }
    } catch {}
  };

  const handleSaveAiVoiceConfig = async (
    partial?: Partial<typeof aiVoiceConfig>,
    explicitGroqKey?: string
  ) => {
    const next = { ...aiVoiceConfig, ...(partial || {}) };
    setAiVoiceConfig(next);
    setSavingAiVoice(true);
    try {
      const res = await fetch("/api/discord/ai-voice/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          config: next,
          groqApiKey: explicitGroqKey !== undefined ? explicitGroqKey : aiVoiceGroqInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar IA de Voz.");
      if (data.config) setAiVoiceConfig(data.config);
      if (explicitGroqKey || aiVoiceGroqInput.trim()) {
        setAiVoiceGroqInput("");
        onRefresh();
      }
      toast.success("Configuração da IA de Voz (n!) salva!");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingAiVoice(false);
    }
  };

  const handleTestAiVoice = async (forceMood?: "crazy" | "normal" | "vip_submissive") => {
    if (!aiVoiceTestChannelId) {
      toast.error("Selecione um canal de texto para enviar o áudio de teste!");
      return;
    }
    setTestingAiVoice(forceMood || "auto");
    try {
      const res = await fetch("/api/discord/ai-voice/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          channelId: aiVoiceTestChannelId,
          prompt: aiVoiceTestPrompt.trim() || "Oi, tudo bem?",
          forceMood,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao testar IA de Voz.");
      if (Array.isArray(data.logs)) setAiVoiceLogs(data.logs);
      const moodLabel =
        data.mood === "vip_submissive"
          ? "🥺 Modo Papai Dog (VIP + Voz MCP)"
          : data.mood === "crazy"
          ? "🤪 Modo Biruta"
          : "😇 Modo Normal";
      toast.success(`${moodLabel} respondeu em áudio: "${data.text}"`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setTestingAiVoice(null);
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

  const navSections = [
    {
      title: "Comunicação & Call",
      items: [
        { id: "call_game", label: "Jogo da Call", icon: Gamepad2, color: "text-emerald-400" },
        { id: "transmission", label: "Transmissão", icon: Tv, color: "text-red-500" },
        { id: "broadcast", label: "Transmissão de Bot", icon: Monitor, color: "text-cyan-400" },
        { id: "messages", label: "Envio de Mensagens", icon: Send, color: "text-pink-400" },
        { id: "ai_voice", label: "IA de Voz (n! Groq)", icon: Sparkles, color: "text-fuchsia-400" },
        { id: "tts", label: "Voz TTS & Soundboard", icon: Volume2, color: "text-amber-400" },
      ],
    },
    {
      title: "Comunidade & Segurança",
      items: [
        { id: "moderation", label: "Moderação & Anti-Raid", icon: Shield, color: "text-red-400" },
        { id: "polls", label: "Enquetes & Votações", icon: BarChart3, color: "text-amber-400" },
        { id: "tickets", label: "Central de Tickets & IP", icon: MessageSquare, color: "text-emerald-400" },
      ],
    },
    {
      title: "Servidor & Sistema",
      items: [
        { id: "interactions", label: "Interações & Comandos", icon: Flame, color: "text-pink-400" },
        { id: "template", label: "Template de Canais", icon: Layers, color: "text-purple-400" },
        { id: "roles", label: "Cargos & Membros", icon: UserCheck, color: "text-blue-400" },
        { id: "status", label: "Status & Credenciais", icon: Zap, color: "text-cyan-400" },
      ],
    },
  ] as const;

  const handleSelectNavTab = (tabId: typeof activeTab) => {
    setActiveTab(tabId);
    setDrawerOpen(false);
    if (tabId === "ai_voice") fetchAiVoiceStatus();
    if (tabId === "tickets") fetchTickets();
    if (tabId === "moderation") fetchModerationStatus();
    if (tabId === "polls") fetchPolls();
    if (tabId === "broadcast" && guildId) fetchVoiceStatus(guildId, voiceChannelId);
  };

  return (
    <div className="w-full min-h-screen bg-[#090b11] text-slate-100 flex flex-col antialiased">
      <Toaster position="top-right" richColors />

      {/* Clean Sticky Top Bar */}
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#0b0e16]/90 backdrop-blur-md px-4 lg:px-6 h-14 shrink-0 flex items-center">
        <div className="max-w-[1440px] w-full mx-auto flex items-center justify-between gap-4">
          {/* Left Zone: Mobile Toggle + Bot Brand */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-white/[0.1] bg-[#141926] text-slate-200 hover:text-white cursor-pointer shrink-0"
              aria-label="Abrir menu"
            >
              <Menu className="h-4 w-4" />
            </button>

            <img
              src={overview.bot.avatar || "/assets/panelbot.jpg"}
              alt={overview.bot.username}
              className="h-8 w-8 rounded-lg object-cover border border-white/15 shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-white text-sm tracking-tight truncate">
                  {overview.bot.username}
                </span>
                <span className="hidden sm:inline text-xs text-slate-500">·</span>
                <span className="hidden sm:inline text-xs text-emerald-400 font-medium whitespace-nowrap">
                  Online ({overview.guilds.length} {overview.guilds.length === 1 ? "servidor" : "servidores"})
                </span>
              </div>
            </div>
          </div>

          {/* Right Zone: Active Server Selector + Primary Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={guildId || ""}
              onChange={(e) => setGuildId(e.target.value)}
              aria-label="Servidor ativo"
              className="hidden sm:block h-8 max-w-[200px] rounded-lg border border-white/[0.1] bg-[#141926] px-2.5 text-xs text-slate-200 focus:outline-none focus:border-pink-500 cursor-pointer"
            >
              {overview.guilds.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>

            <Button
              size="sm"
              asChild
              className="bg-pink-600 hover:bg-pink-500 text-white text-xs font-semibold h-8 px-3 cursor-pointer whitespace-nowrap shrink-0"
            >
              <a href={overview.inviteUrl} target="_blank" rel="noreferrer">
                <ServerIcon className="h-3.5 w-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">Convidar Bot</span>
              </a>
            </Button>

            <Button
              variant="secondary"
              size="icon"
              onClick={onRefresh}
              className="h-8 w-8 bg-[#141926] hover:bg-[#1b2234] border border-white/[0.1] cursor-pointer shrink-0"
              title="Recarregar"
            >
              <RefreshCw className="h-3.5 w-3.5 text-slate-300" />
            </Button>

            <Button
              variant="secondary"
              size="icon"
              onClick={onLogout}
              className="h-8 w-8 bg-[#141926] hover:bg-[#1b2234] border border-white/[0.1] cursor-pointer shrink-0"
              title="Sair"
            >
              <LogOut className="h-3.5 w-3.5 text-slate-300" />
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Slide-Over Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-[#0d111a] border-r border-white/[0.08] p-4 flex flex-col gap-4 z-10 overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <span className="font-display font-bold text-white text-sm">
                Módulos do Painel
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-slate-400 block">
                Servidor ativo
              </label>
              <select
                value={guildId || ""}
                onChange={(e) => setGuildId(e.target.value)}
                className="h-9 w-full rounded-lg border border-white/[0.1] bg-[#141926] px-2.5 text-xs text-white"
              >
                {overview.guilds.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <nav className="space-y-4 flex-1">
              {navSections.map((section) => (
                <div key={section.title} className="space-y-1">
                  <div className="px-2 text-[11px] font-semibold text-slate-500">
                    {section.title}
                  </div>
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectNavTab(item.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? "bg-pink-600/15 text-white border border-pink-500/35"
                            : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
                        }`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${item.color}`} />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Desktop Workspace Shell: Persistent Organized Sidebar + Main Content */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto flex">
        <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-white/[0.08] bg-[#0b0e16]/60 px-3 py-5 gap-5">
          <nav className="space-y-5 sticky top-20">
            {navSections.map((section) => (
              <div key={section.title} className="space-y-1">
                <div className="px-3 text-[11px] font-semibold text-slate-500 tracking-wide">
                  {section.title}
                </div>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectNavTab(item.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? "bg-pink-600/15 text-white border border-pink-500/35"
                          : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] border border-transparent"
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${item.color}`} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6">
          <div className="max-w-5xl mx-auto flex flex-col gap-5">
            {/* Tab: JOGO DA CALL */}
            {activeTab === "call_game" && (
              <CallGamePanel
                password={password}
                guildId={guildId}
                channels={guild?.channels || []}
                voiceChannelId={voiceChannelId}
                setVoiceChannelId={setVoiceChannelId}
                clonedVoices={clonedVoices}
              />
            )}

            {/* Tab: TRANSMISSÃO (PALCO VISUAL 16:9 + OAUTH2 + WEBSOCKET) */}
            {activeTab === "transmission" && (
              <TransmissionPage
                password={password}
                mainBotOnline={Boolean(statusInfo?.gatewayConnected)}
                mainGuilds={overview.guilds}
                defaultGuildId={guildId}
              />
            )}

            {/* Tab: TRANSMISSÃO DE BOT (CALL + TELA / CÂMERA / SITE) */}
            {activeTab === "broadcast" && (
              <BotBroadcastPanel
                password={password}
                guildId={guildId}
                channels={guild?.channels || []}
                voiceChannelId={voiceChannelId}
                setVoiceChannelId={setVoiceChannelId}
                voiceStatus={voiceStatus}
                joiningVoice={joiningVoice}
                onJoinCall={handleJoinVoiceCall}
                onLeaveCall={handleLeaveVoiceCall}
                onRefreshVoiceStatus={async (chId) => {
                  if (guildId) await fetchVoiceStatus(guildId, chId);
                }}
                selectedVoice={selectedVoice}
                selectedExpression={selectedExpression}
                mcpApiKey={mcpApiKey}
              />
            )}

        {/* Tab: ENVIO DE MENSAGENS (TEXTO OU ÁUDIO NO CANAL) */}
        {activeTab === "messages" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="rounded-xl border border-pink-500/40 bg-[#0d1017] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cyber-glow-pink">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Send className="h-5 w-5 text-pink-400" />
                  <span className="text-base font-black text-white uppercase tracking-wide">
                    Envio de Mensagens no Canal
                  </span>
                  <Badge className="bg-pink-500/20 text-pink-300 border-pink-500/40 text-[10px]">
                    {msgAsAudio ? "🎙️ MODO ÁUDIO ATIVO" : "💬 MODO TEXTO ATIVO"}
                  </Badge>
                </div>
                <p className="text-xs text-neutral-400">
                  Selecione um canal, escreva sua mensagem e escolha lá embaixo se deseja enviar apenas em <b>Texto</b> ou apenas como <b>Áudio</b> falado com a voz do bot.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleSendChannelMessage}
              className="rounded-xl border border-neutral-800 bg-[#0d1017] p-5 space-y-4"
            >
              {/* 1. Canal */}
              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1.5 flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-pink-400" />
                  1. Selecione o Canal de Destino:
                </label>
                <select
                  value={msgChannelId}
                  onChange={(e) => setMsgChannelId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-neutral-700 bg-[#131722] px-3 text-xs text-white focus:outline-none focus:border-pink-500"
                >
                  <option value="">Selecione um canal de texto...</option>
                  {guild?.channels
                    ?.filter((c) => c.type === 0 || c.type === 5)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.name}
                      </option>
                    ))}
                </select>
              </div>

              {/* 2. Mensagem */}
              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-pink-400" />
                    2. Escreva a Mensagem:
                  </span>
                  <span className="text-[10px] font-mono text-neutral-500">
                    {msgContent.length} caracteres
                  </span>
                </label>
                <Textarea
                  placeholder={
                    msgAsAudio
                      ? "Digite exatamente o que o bot vai falar no áudio enviado para o canal (o texto NÃO aparecerá escrito, só o áudio)..."
                      : "Digite a mensagem de texto que o bot vai enviar no canal selecionado..."
                  }
                  value={msgContent}
                  onChange={(e) => setMsgContent(e.target.value)}
                  className="bg-[#131722] border-neutral-700 text-xs min-h-[120px] focus-visible:ring-pink-500"
                />
              </div>

              {/* 3. Embaixo: Seleção Enviar como Áudio ou Texto */}
              <div className="rounded-xl border border-neutral-800 bg-[#121622] p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      {msgAsAudio ? (
                        <Volume2 className="h-4 w-4 text-pink-400" />
                      ) : (
                        <MessageSquare className="h-4 w-4 text-cyan-400" />
                      )}
                      <span className="text-xs font-bold text-white">
                        Enviar como Áudio (Voz do Bot)
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400">
                      {msgAsAudio
                        ? "Ativado: enviará APENAS o áudio no canal falando esta mensagem com a voz selecionada (sem texto)."
                        : "Desativado: enviará APENAS a mensagem escrita em texto normal no canal."}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-1 bg-[#0b0d14] p-1 rounded-lg border border-neutral-800 text-xs">
                      <button
                        type="button"
                        onClick={() => setMsgAsAudio(false)}
                        className={`px-3 py-1.5 rounded-md font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                          !msgAsAudio
                            ? "bg-cyan-600 text-white shadow-sm"
                            : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        <MessageSquare className="h-3.5 w-3.5" /> Texto
                      </button>
                      <button
                        type="button"
                        onClick={() => setMsgAsAudio(true)}
                        className={`px-3 py-1.5 rounded-md font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                          msgAsAudio
                            ? "bg-pink-600 text-white shadow-sm"
                            : "text-neutral-400 hover:text-white"
                        }`}
                      >
                        <Mic className="h-3.5 w-3.5" /> Áudio
                      </button>
                    </div>

                    <Switch
                      checked={msgAsAudio}
                      onCheckedChange={setMsgAsAudio}
                      aria-label="Ativar envio como áudio"
                    />
                  </div>
                </div>

                {/* Voice & Expression picker shown when Audio mode is active */}
                {msgAsAudio && (
                  <div className="pt-3 border-t border-neutral-800 space-y-3 animate-in fade-in duration-150">
                    <div>
                      <span className="text-[11px] font-bold text-pink-300 block mb-1.5">
                        Escolha a Voz do Áudio:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                        {[
                          { id: "lhays_anime", label: "🧚 Dubladora Anime BR", sub: "Voz Oficial Lhays Macedo" },
                          { id: "garota_timida", label: "🌸 Anime Girl Shy", sub: "Garota Tímida (Soft)" },
                          { id: "anytospeech_mcp", label: "⚡ AnyToSpeech MCP", sub: "Geração MCP Rápida" },
                        ].map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => setMsgVoice(v.id)}
                            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                              msgVoice === v.id
                                ? "border-pink-500 bg-pink-500/15 text-pink-200 font-bold"
                                : "border-neutral-800 bg-[#0b0d14] text-neutral-400 hover:text-white"
                            }`}
                          >
                            <div className="text-xs">{v.label}</div>
                            <div className="text-[10px] text-neutral-400">{v.sub}</div>
                          </button>
                        ))}

                        {clonedVoices.map((cv) => (
                          <button
                            key={cv.id}
                            type="button"
                            onClick={() => setMsgVoice(cv.id)}
                            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                              msgVoice === cv.id
                                ? "border-pink-500 bg-pink-500/20 text-pink-200 font-bold"
                                : "border-neutral-800 bg-[#0b0d14] text-neutral-400 hover:text-white"
                            }`}
                          >
                            <div className="text-xs truncate">🎙️ {cv.name}</div>
                            <div className="text-[10px] text-pink-400 font-mono">Voz Clonada</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] font-bold text-amber-300 block mb-1.5">
                        Expressão da Fala:
                      </span>
                      <div className="grid grid-cols-3 sm:grid-cols-7 gap-1.5">
                        {[
                          { id: "shy", label: "🌸 Tímida" },
                          { id: "cute", label: "💖 Fofa" },
                          { id: "whisper", label: "🤫 Sussurro" },
                          { id: "happy", label: "😄 Alegre" },
                          { id: "angry", label: "😠 Irritada" },
                          { id: "sad", label: "😢 Triste" },
                          { id: "neutral", label: "😐 Neutra" },
                        ].map((expr) => (
                          <button
                            key={expr.id}
                            type="button"
                            onClick={() => setMsgExpression(expr.id)}
                            className={`px-2 py-1.5 rounded-lg border text-[11px] transition-all cursor-pointer text-center ${
                              msgExpression === expr.id
                                ? "border-amber-500 bg-amber-500/20 text-amber-200 font-bold"
                                : "border-neutral-800 bg-[#0b0d14] text-neutral-400 hover:text-white"
                            }`}
                          >
                            {expr.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-800/80">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => playBrowserSpeech(msgContent || "Prévia de áudio do bot")}
                    className="text-xs gap-1.5 cursor-pointer bg-[#0b0d14] hover:bg-neutral-800 border-neutral-700"
                  >
                    <Play className="h-3 w-3 text-pink-400" /> Ouvir Prévia no Navegador
                  </Button>

                  <Button
                    type="submit"
                    disabled={sendingChannelMsg || !msgChannelId || !msgContent.trim()}
                    className={`font-bold text-xs gap-2 px-5 h-9 cursor-pointer shadow-lg ${
                      msgAsAudio
                        ? "bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white shadow-pink-600/25"
                        : "bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-600/25"
                    }`}
                  >
                    {msgAsAudio ? <Volume2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                    {sendingChannelMsg
                      ? msgAsAudio
                        ? "Gerando e Enviando Áudio..."
                        : "Enviando Texto..."
                      : msgAsAudio
                      ? "Enviar Só o Áudio no Canal"
                      : "Enviar Mensagem em Texto"}
                  </Button>
                </div>
              </div>
            </form>

            {sentMessagesLog.length > 0 && (
              <div className="rounded-xl border border-neutral-800 bg-[#0d1017] p-4 space-y-2">
                <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block">
                  Últimos Envios Realizados ({sentMessagesLog.length})
                </span>
                <div className="space-y-1.5">
                  {sentMessagesLog.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-neutral-800 bg-black/30 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge
                          variant="outline"
                          className={`text-[10px] shrink-0 ${
                            item.asAudio
                              ? "border-pink-500/40 text-pink-300 bg-pink-500/10"
                              : "border-cyan-500/40 text-cyan-300 bg-cyan-500/10"
                          }`}
                        >
                          {item.asAudio ? "🎙️ ÁUDIO" : "💬 TEXTO"}
                        </Badge>
                        <span className="font-mono text-neutral-400 shrink-0">{item.channelName}</span>
                        <span className="text-neutral-200 truncate">{item.content}</span>
                      </div>
                      <span className="text-[10px] text-neutral-500 font-mono shrink-0">
                        {item.voiceUsed ? `${item.voiceUsed} · ` : ""}{item.time}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: IA DE VOZ (n! GROQ — NORMAL & BIRUTA) */}
        {activeTab === "ai_voice" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="rounded-xl border border-fuchsia-500/40 bg-[#0d1017] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cyber-glow-pink">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Sparkles className="h-5 w-5 text-fuchsia-400" />
                  <span className="text-base font-black text-white uppercase tracking-wide">
                    IA de Voz Automática ({aiVoiceConfig.prefix} no Chat)
                  </span>
                  <Badge
                    className={`text-[10px] ${
                      aiVoiceConfig.enabled
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                        : "bg-neutral-800 text-neutral-400 border-neutral-700"
                    }`}
                  >
                    {aiVoiceConfig.enabled ? "🟢 ESCUTANDO n! NO DISCORD" : "⏸️ PAUSADO"}
                  </Badge>
                  <Badge
                    className={`text-[10px] ${
                      aiVoiceConfig.groqKeyConfigured
                        ? "bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/40"
                        : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    }`}
                  >
                    {aiVoiceConfig.groqKeyConfigured ? "⚡ GROQ ATIVA" : "⚠️ FALTA GROQ_API_KEY"}
                  </Badge>
                </div>
                <p className="text-xs text-neutral-400">
                  Sempre que você mandar <code className="text-fuchsia-300 font-mono">n! Oi tudo bem</code> (ou qualquer texto após <code className="text-fuchsia-300 font-mono">{aiVoiceConfig.prefix}</code>), a IA Groq responde <b>em áudio com a voz de dubladora</b> — alternando entre <b>normal</b> e <b>completamente biruta/aleatória</b>!
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs font-semibold text-neutral-300">
                  {aiVoiceConfig.enabled ? "Ativado" : "Desativado"}
                </span>
                <Switch
                  checked={aiVoiceConfig.enabled}
                  onCheckedChange={(v) => handleSaveAiVoiceConfig({ enabled: v })}
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {/* Groq Key & Model + Chaos Slider */}
              <div className="rounded-xl border border-neutral-800 bg-[#0d1017] p-4 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-fuchsia-300 flex items-center gap-1.5">
                  <Cpu className="h-4 w-4" /> Modelo Groq &amp; Nível de Loucura
                </h3>

                <div>
                  <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                    Chave da API Groq (GROQ_API_KEY)
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder={
                        aiVoiceConfig.groqKeyConfigured
                          ? "Chave configurada e salva — cole outra se quiser trocar"
                          : "gsk_... (Cole sua chave da Groq aqui)"
                      }
                      value={aiVoiceGroqInput}
                      onChange={(e) => setAiVoiceGroqInput(e.target.value)}
                      className="h-9 text-xs font-mono bg-[#131722] border-fuchsia-500/30"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={savingAiVoice || !aiVoiceGroqInput.trim()}
                      onClick={() => handleSaveAiVoiceConfig(undefined, aiVoiceGroqInput.trim())}
                      className="h-9 bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-xs font-bold cursor-pointer shrink-0"
                    >
                      Salvar Chave
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                    Modelo da Groq:
                  </label>
                  <select
                    value={aiVoiceConfig.model}
                    onChange={(e) => handleSaveAiVoiceConfig({ model: e.target.value })}
                    className="h-9 w-full rounded-md border border-neutral-700 bg-[#131722] px-3 text-xs text-white focus:outline-none focus:border-fuchsia-500"
                  >
                    <option value="openai/gpt-oss-120b">openai/gpt-oss-120b (Padrão com Fallback Automático)</option>
                    <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Rápido &amp; Criativo)</option>
                    <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (Ultra Instantâneo)</option>
                  </select>
                </div>

                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-neutral-200">
                      🤪 Chance de Surto Biruta vs 😇 Normal:
                    </span>
                    <Badge variant="outline" className="border-fuchsia-500/40 text-fuchsia-300 font-mono text-[10px]">
                      {aiVoiceConfig.crazyChance}% Biruta / {100 - aiVoiceConfig.crazyChance}% Normal
                    </Badge>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={aiVoiceConfig.crazyChance}
                    onChange={(e) =>
                      setAiVoiceConfig((prev) => ({ ...prev, crazyChance: Number(e.target.value) }))
                    }
                    onMouseUp={() => handleSaveAiVoiceConfig({ crazyChance: aiVoiceConfig.crazyChance })}
                    onTouchEnd={() => handleSaveAiVoiceConfig({ crazyChance: aiVoiceConfig.crazyChance })}
                    className="w-full accent-fuchsia-500 cursor-pointer"
                  />
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { label: "😇 0% Normal", val: 0 },
                      { label: "⚖️ 50% Misto", val: 50 },
                      { label: "🤪 65% Biruta", val: 65 },
                      { label: "🔥 100% Caos", val: 100 },
                    ].map((preset) => (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => handleSaveAiVoiceConfig({ crazyChance: preset.val })}
                        className={`py-1.5 px-2 rounded-lg border text-[10px] font-semibold cursor-pointer transition ${
                          aiVoiceConfig.crazyChance === preset.val
                            ? "border-fuchsia-500 bg-fuchsia-500/20 text-fuchsia-200"
                            : "border-neutral-800 bg-[#131722] text-neutral-400 hover:text-white"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-neutral-800/80 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] font-bold text-rose-300">
                      👑 ID VIP Papai Dog (Voz MCP + Modo Submissa):
                    </label>
                    <Badge variant="outline" className="border-rose-500/40 text-rose-300 bg-rose-500/10 text-[9px]">
                      ⚡ MCP AUTO
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={aiVoiceConfig.vipDaddyId}
                      onChange={(e) =>
                        setAiVoiceConfig((prev) => ({ ...prev, vipDaddyId: e.target.value }))
                      }
                      placeholder="1554257592015003674"
                      className="h-8 text-xs font-mono bg-[#131722] border-rose-500/30 text-rose-100"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={savingAiVoice}
                      onClick={() => handleSaveAiVoiceConfig({ vipDaddyId: aiVoiceConfig.vipDaddyId.trim() })}
                      className="h-8 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer shrink-0"
                    >
                      Salvar VIP
                    </Button>
                  </div>
                  <p className="text-[10px] text-neutral-400">
                    Esse ID nunca recebe o modo biruta — é tratado com carinho, submissão (&quot;papai dog&quot;, &quot;uwu&quot;, &quot;boa garotinha&quot;) e áudio na voz <b>AnyToSpeech MCP</b>.
                  </p>
                </div>
              </div>

              {/* Voice choice + Live Tester */}
              <div className="rounded-xl border border-neutral-800 bg-[#0d1017] p-4 space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-pink-300 flex items-center gap-1.5">
                  <Volume2 className="h-4 w-4" /> Voz da Dubladora &amp; Teste ao Vivo
                </h3>

                <div>
                  <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                    Voz que responde ao <code className="text-fuchsia-300">{aiVoiceConfig.prefix}</code>:
                  </label>
                  <select
                    value={aiVoiceConfig.voice}
                    onChange={(e) => handleSaveAiVoiceConfig({ voice: e.target.value })}
                    className="h-9 w-full rounded-md border border-neutral-700 bg-[#131722] px-3 text-xs text-white focus:outline-none focus:border-pink-500"
                  >
                    <option value="lhays_anime">🧚 Dubladora Anime BR (Lhays Macedo)</option>
                    <option value="garota_timida">🌸 Anime Girl Shy (Garota Tímida)</option>
                    <option value="anytospeech_mcp">⚡ AnyToSpeech MCP</option>
                    {clonedVoices.map((cv) => (
                      <option key={cv.id} value={cv.id}>
                        🎙️ Voz Clonada: {cv.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                    Canal para Testar Agora:
                  </label>
                  <select
                    value={aiVoiceTestChannelId}
                    onChange={(e) => setAiVoiceTestChannelId(e.target.value)}
                    className="h-9 w-full rounded-md border border-neutral-700 bg-[#131722] px-3 text-xs text-white focus:outline-none focus:border-pink-500"
                  >
                    <option value="">Selecione um canal de texto...</option>
                    {guild?.channels
                      ?.filter((c) => c.type === 0 || c.type === 5)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          #{c.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                    Simular mensagem (<code className="text-fuchsia-300">{aiVoiceConfig.prefix} ...</code>):
                  </label>
                  <Input
                    value={aiVoiceTestPrompt}
                    onChange={(e) => setAiVoiceTestPrompt(e.target.value)}
                    placeholder="Ex: Oi tudo bem?"
                    className="h-9 text-xs bg-[#131722] border-neutral-700 text-white"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={Boolean(testingAiVoice) || !aiVoiceTestChannelId}
                    onClick={() => handleTestAiVoice(undefined)}
                    className="flex-1 bg-gradient-to-r from-fuchsia-600 to-pink-600 hover:from-fuchsia-500 hover:to-pink-500 text-white text-xs font-bold cursor-pointer"
                  >
                    <Volume2 className="h-3.5 w-3.5 mr-1.5" />
                    {testingAiVoice === "auto" ? "Gerando Áudio..." : "Testar Aleatório (n!)"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={Boolean(testingAiVoice) || !aiVoiceTestChannelId}
                    onClick={() => handleTestAiVoice("vip_submissive")}
                    className="border-rose-500/40 bg-rose-950/30 hover:bg-rose-900/40 text-rose-200 text-xs font-bold cursor-pointer"
                  >
                    {testingAiVoice === "vip_submissive" ? "Obedecendo..." : "🥺 Testar Papai Dog (VIP)"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={Boolean(testingAiVoice) || !aiVoiceTestChannelId}
                    onClick={() => handleTestAiVoice("crazy")}
                    className="border-fuchsia-500/40 bg-fuchsia-950/30 hover:bg-fuchsia-900/40 text-fuchsia-200 text-xs font-bold cursor-pointer"
                  >
                    {testingAiVoice === "crazy" ? "Surtando..." : "🤪 Forçar Biruta"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={Boolean(testingAiVoice) || !aiVoiceTestChannelId}
                    onClick={() => handleTestAiVoice("normal")}
                    className="border-cyan-500/40 bg-cyan-950/30 hover:bg-cyan-900/40 text-cyan-200 text-xs font-bold cursor-pointer"
                  >
                    {testingAiVoice === "normal" ? "Respondendo..." : "😇 Forçar Normal"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Live AI Voice Responses Log */}
            <div className="rounded-xl border border-neutral-800 bg-[#0d1017] p-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                  Últimas Respostas em Áudio da IA ({aiVoiceLogs.length})
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={fetchAiVoiceStatus}
                  className="h-7 text-xs border-neutral-700 bg-neutral-800/50 text-neutral-300 cursor-pointer"
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Atualizar
                </Button>
              </div>
              {aiVoiceLogs.length === 0 ? (
                <div className="p-4 text-center text-xs text-neutral-500 bg-black/25 rounded-lg border border-neutral-800/60">
                  Escreva <code className="text-fuchsia-300">n! Oi tudo bem</code> em qualquer canal do Discord para o bot responder com áudio usando a voz de dubladora!
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {aiVoiceLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-lg border border-neutral-800 bg-black/30 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              log.mood === "vip_submissive"
                                ? "border-rose-500/50 text-rose-300 bg-rose-500/15"
                                : log.mood === "crazy"
                                ? "border-fuchsia-500/50 text-fuchsia-300 bg-fuchsia-500/15"
                                : "border-cyan-500/50 text-cyan-300 bg-cyan-500/15"
                            }`}
                          >
                            {log.mood === "vip_submissive"
                              ? "👑 PAPAI DOG VIP"
                              : log.mood === "crazy"
                              ? "🤪 BIRUTA"
                              : "😇 NORMAL"}
                          </Badge>
                          <span className="font-semibold text-neutral-200">{log.author}</span>
                          <span className="text-neutral-400">disse: &quot;{log.prompt}&quot;</span>
                        </div>
                        <span className="text-[10px] font-mono text-neutral-500">
                          {log.modelUsed} · {new Date(log.timestamp).toLocaleTimeString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-pink-200 font-medium pl-1">
                        🎙️ &quot;{log.reply}&quot;
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

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
                  variant="outline"
                  onClick={handleCreateQuarantineChannel}
                  disabled={creatingQuarantineChan}
                  className="border-red-500/50 bg-red-950/30 hover:bg-red-900/40 text-red-200 text-xs font-semibold cursor-pointer"
                  title="Cria ou verifica o canal de quarentena 'spam? Não!' no servidor"
                >
                  <Shield className="h-3.5 w-3.5 mr-1 text-red-400" />
                  {creatingQuarantineChan ? "Criando..." : "Criar Canal 'spam? Não!'"}
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
              {/* Anti-Spam & Quarentena (spam? Não!) */}
              <div className="rounded-xl border border-red-500/40 bg-[#0d1017] p-4 space-y-3 cyber-glow-pink">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-red-400 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-red-500" /> Anti-Spam &amp; Quarentena (spam? Não!)
                  </span>
                  <Switch
                    checked={modConfig.antiSpamEnabled}
                    onCheckedChange={(v) => handleSaveModConfig({ antiSpamEnabled: v })}
                  />
                </div>
                <p className="text-[11px] text-neutral-300 leading-relaxed">
                  Quando uma conta ou bot envia <b>10 mensagens repetidas</b>, recebe <b>Castigo de 10 min</b>, todos os canais são <b>privados/ocultados</b> (só <b>spam? Não!</b> visível) e as mensagens de spam só são apagadas <b>depois do castigo</b>.
                </p>
                <div className="p-2 rounded bg-black/40 border border-red-500/30 text-[10px] font-mono text-red-200 space-y-0.5">
                  <div>🚫 <b>Todos os canais trancados em privado</b></div>
                  <div>📌 <b>Único canal visível:</b> <code className="text-red-300">spam? Não!</code></div>
                  <div>⚠️ <b>Reincidência pós-castigo:</b> Banimento Permanente</div>
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

            {/* 2º Bot de Testes de Segurança (Anti-Spam, Anti-Convite, Anti-MassPing, Anti-Raid) */}
            <div className="rounded-xl border border-cyan-500/40 bg-[#0d1017] p-4 space-y-4 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Cpu className="h-4 w-4 text-cyan-400" />
                    <span className="text-sm font-black text-white uppercase tracking-wide">
                      🧪 2º Bot de Testes — Auto-Teste de Bloqueios &amp; /spam (10s Castigo)
                    </span>
                    {statusInfo?.testBot?.online ? (
                      <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px]">
                        🟢 ONLINE: {statusInfo.testBot.username}
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px]">
                        🟡 {statusInfo?.testBotTokenConfigured ? "CONECTANDO / OFFLINE" : "AGUARDANDO TOKEN (.env)"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400">
                    Conecte um 2º bot para testar seu sistema ao vivo com <code className="text-cyan-300 font-mono">/spam</code> ou <code className="text-cyan-300 font-mono">/testar-bloqueio</code>. Ele sofre o bloqueio real (canais privados e só <code className="text-red-300">#spam-não</code> visível), cumpre <b>10 segundos</b> de castigo, é liberado automaticamente avisando que está funcionando e <b>nunca toma banimento</b> mesmo repetindo várias vezes.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {statusInfo?.testBot?.inviteUrl && (
                    <Button
                      size="sm"
                      asChild
                      className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold h-8 cursor-pointer"
                    >
                      <a href={statusInfo.testBot.inviteUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> Convidar 2º Bot (Sem Admin)
                      </a>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleReconnectTestBot}
                    disabled={savingTestBot}
                    className="border-neutral-700 bg-neutral-800/80 hover:bg-neutral-700 text-neutral-200 text-xs h-8 cursor-pointer"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1 ${savingTestBot ? "animate-spin" : ""}`} />
                    Reconectar 2º Bot
                  </Button>
                </div>
              </div>

              {/* Quick Token / ID Extractor + Invite Generator */}
              <div className="rounded-lg border border-cyan-500/25 bg-black/35 p-3 space-y-3">
                {statusInfo?.testBot && !statusInfo.testBot.online && statusInfo.testBot.lastError && (
                  <div className="rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 text-xs text-red-200 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                    <span>
                      <b>Último erro do 2º Bot:</b> {statusInfo.testBot.lastError}
                    </span>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                    <Key className="h-3.5 w-3.5" /> Convidar Bot de Spam &amp; Pegar o ID Automaticamente
                  </span>
                  {statusInfo?.testBot?.online && guildId && (
                    <Badge
                      className={`text-[10px] ${
                        isTestBotInSelectedGuild
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          : "bg-red-500/20 text-red-300 border-red-500/40"
                      }`}
                    >
                      {isTestBotInSelectedGuild
                        ? "✅ Bot de Spam já está neste servidor"
                        : "⚠️ Bot ainda NÃO entrou neste servidor — clique em Convidar"}
                    </Badge>
                  )}
                </div>

                <div className="grid sm:grid-cols-12 gap-2 items-center">
                  <div className="sm:col-span-6">
                    <Input
                      type="text"
                      placeholder={
                        statusInfo?.testBot?.online
                          ? `Bot ativo (ID: ${statusInfo.testBot.id}) — cole outro Token ou ID para gerar convite`
                          : "Cole o Token do Bot de Spam (TEST_BOT_TOKEN) ou Client ID..."
                      }
                      value={quickTestBotToken}
                      onChange={(e) => setQuickTestBotToken(e.target.value)}
                      className="h-9 text-xs font-mono bg-[#121622] border-cyan-500/30 text-white"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleInspectTestBot}
                      disabled={inspectingTestBot || (!quickTestBotToken.trim() && !statusInfo?.testBot?.id)}
                      className="w-full h-9 border-cyan-500/40 bg-cyan-950/30 hover:bg-cyan-900/40 text-cyan-200 font-bold text-xs cursor-pointer"
                    >
                      {inspectingTestBot ? "Buscando..." : "🆔 Pegar ID & Link"}
                    </Button>
                  </div>
                  <div className="sm:col-span-3">
                    <Button
                      type="button"
                      onClick={handleConnectTestBot}
                      disabled={savingTestBot || !quickTestBotToken.trim()}
                      className="w-full h-9 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs cursor-pointer"
                    >
                      {savingTestBot ? "Ligando..." : "⚡ Ligar 2º Bot"}
                    </Button>
                  </div>
                </div>

                {resolvedTestBotId && (
                  <div className="rounded-lg border border-emerald-500/30 bg-[#0a1219] p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-mono text-neutral-400">
                          🆔 ID DO BOT DE SPAM (TEST_BOT_ID):
                        </span>
                        <code className="px-2 py-0.5 rounded bg-black/60 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-bold select-all">
                          {resolvedTestBotId}
                        </code>
                        {(inspectedTestBot?.username || statusInfo?.testBot?.username) && (
                          <span className="text-[11px] text-cyan-300 font-semibold">
                            ({inspectedTestBot?.username || statusInfo?.testBot?.username})
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-neutral-400 leading-relaxed">
                        Este ID já foi pré-autorizado no sistema! Se o bot foi banido antes pelo <b>Anti-Bot Invasor</b>, clique em <b>Desbanir &amp; Liberar</b>. Se o servidor for do seu amigo e você não conseguir convidar pela sua conta, clique em <b>Copiar Convite</b> e mande para o seu amigo clicar.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleAuthorizeUnbanTestBot}
                        disabled={authorizingTestBot}
                        className="h-8 border-amber-500/40 bg-amber-950/30 hover:bg-amber-900/40 text-amber-200 text-xs font-bold cursor-pointer"
                      >
                        <Shield className="h-3.5 w-3.5 mr-1" />
                        {authorizingTestBot ? "Liberando..." : "🔓 Desbanir & Liberar"}
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyText("botId", resolvedTestBotId, "ID do Bot de Spam")}
                        className="h-8 border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-900/40 text-emerald-200 text-xs font-bold cursor-pointer"
                      >
                        {copiedField === "botId" ? (
                          <Check className="h-3.5 w-3.5 mr-1" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 mr-1" />
                        )}
                        {copiedField === "botId" ? "ID Copiado!" : "Copiar ID"}
                      </Button>

                      {resolvedTestBotInviteUrl && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleCopyText("inviteUrl", resolvedTestBotInviteUrl, "Link de Convite")
                            }
                            className="h-8 border-cyan-500/40 bg-cyan-950/30 hover:bg-cyan-900/40 text-cyan-200 text-xs font-bold cursor-pointer"
                          >
                            {copiedField === "inviteUrl" ? (
                              <Check className="h-3.5 w-3.5 mr-1" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 mr-1" />
                            )}
                            Copiar Convite
                          </Button>

                          <Button
                            size="sm"
                            asChild
                            className="h-8 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white text-xs font-bold cursor-pointer"
                          >
                            <a href={resolvedTestBotInviteUrl} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Convidar Bot de Spam
                            </a>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Channel & Custom Spam Text + Test Action Buttons */}
              <div className="grid sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                    Canal de Texto para Rodar os Testes:
                  </label>
                  <select
                    value={testChannelId}
                    onChange={(e) => setTestChannelId(e.target.value)}
                    className="w-full h-9 text-xs bg-[#131722] border border-neutral-700 rounded-md px-3 text-white focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Selecione o canal...</option>
                    {guild?.channels
                      ?.filter((c) => c.type === 0 || c.type === 5)
                      ?.map((c) => (
                        <option key={c.id} value={c.id}>
                          #{c.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                    Texto do /spam (Opcional — será repetido 10x):
                  </label>
                  <Input
                    placeholder="Padrão: 🚨 Teste Anti-Spam do Sistema #Phoenix"
                    value={customSpamText}
                    onChange={(e) => setCustomSpamText(e.target.value)}
                    className="h-9 text-xs bg-[#131722] border-neutral-700 text-white"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => handleRunSecurityTest("spam")}
                  disabled={Boolean(runningTest) || !statusInfo?.testBot?.online}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs cursor-pointer"
                >
                  <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                  {runningTest === "spam" ? "Testando..." : "Testar /spam (10x + 10s Castigo)"}
                </Button>

                <Button
                  size="sm"
                  onClick={() => handleRunSecurityTest("invite")}
                  disabled={Boolean(runningTest) || !statusInfo?.testBot?.online}
                  className="bg-pink-600 hover:bg-pink-700 text-white font-bold text-xs cursor-pointer"
                >
                  <Zap className="h-3.5 w-3.5 mr-1.5" />
                  {runningTest === "invite" ? "Testando..." : "Testar Anti-Convite"}
                </Button>

                <Button
                  size="sm"
                  onClick={() => handleRunSecurityTest("massping")}
                  disabled={Boolean(runningTest) || !statusInfo?.testBot?.online}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer"
                >
                  <Radio className="h-3.5 w-3.5 mr-1.5" />
                  {runningTest === "massping" ? "Testando..." : "Testar Anti-MassPing"}
                </Button>

                <Button
                  size="sm"
                  onClick={() => handleRunSecurityTest("raid")}
                  disabled={Boolean(runningTest) || !statusInfo?.testBot?.online}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs cursor-pointer"
                >
                  <Shield className="h-3.5 w-3.5 mr-1.5" />
                  {runningTest === "raid" ? "Testando..." : "Testar Anti-Raid (10s)"}
                </Button>

                <Button
                  size="sm"
                  onClick={() => handleRunSecurityTest("all")}
                  disabled={Boolean(runningTest) || !statusInfo?.testBot?.online}
                  className="bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white font-bold text-xs cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  {runningTest === "all" ? "Iniciando Bateria..." : "Testar TODOS os Bloqueios"}
                </Button>
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

        {/* Tab: ENQUETES & VOTAÇÕES INTERATIVAS */}
        {activeTab === "polls" && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* Header Banner */}
            <div className="rounded-xl border border-amber-500/40 bg-[#0d1017] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg cyber-glow-pink">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-bold text-white uppercase tracking-wide">
                    Sistema de Enquetes Interativas & Votações
                  </span>
                  <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px]">
                    Tempo Real & Porcentagens
                  </Badge>
                  <Badge className="bg-red-500/20 text-red-300 border-red-500/40 text-[9px]">
                    /enquete
                  </Badge>
                </div>
                <p className="text-neutral-400 text-xs">
                  Crie enquetes dinâmicas com barras de porcentagem estilo <code className="text-amber-300 font-mono">30% ███░░░░░░░</code>, 1 voto por pessoa, atualização em tempo real ao votar e botão efêmero com foto de perfil dos votantes.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchPolls}
                  disabled={loadingPolls}
                  className="border-neutral-700 bg-neutral-800/80 hover:bg-neutral-700 text-neutral-200 text-xs h-8"
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingPolls ? "animate-spin text-amber-400" : ""}`} />
                  {loadingPolls ? "Atualizando..." : "Atualizar Enquetes"}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left Column: Form to create poll */}
              <div className="lg:col-span-5 rounded-xl border border-neutral-800 bg-[#0d1017] p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Vote className="h-4 w-4 text-amber-400" /> Criar Nova Enquete
                  </h3>
                  <Badge variant="outline" className="text-[10px] text-neutral-400 border-neutral-700">
                    2 a 5 opções
                  </Badge>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                      Canal de Envio da Enquete:
                    </label>
                    <select
                      value={pollChannelId}
                      onChange={(e) => setPollChannelId(e.target.value)}
                      className="w-full h-9 text-xs bg-[#131722] border border-neutral-700 rounded-md px-3 text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="">Selecione o canal de texto...</option>
                      {guild?.channels
                        ?.filter((c) => c.type === 0)
                        ?.map((c) => (
                          <option key={c.id} value={c.id}>
                            #{c.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-neutral-300 block mb-1">
                      Pergunta ou Assunto da Enquete:
                    </label>
                    <Input
                      placeholder="Ex: Qual jogo devemos jogar no evento de sábado?"
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                      className="h-9 text-xs bg-[#131722] border-neutral-700 text-white placeholder:text-neutral-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-semibold text-neutral-300">
                        Opções de Resposta ({pollOptions.length}/5):
                      </label>
                      {pollOptions.length < 5 && (
                        <button
                          type="button"
                          onClick={() => setPollOptions((prev) => [...prev, `Opção ${prev.length + 1}`])}
                          className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer font-medium"
                        >
                          <PlusCircle className="h-3 w-3" /> Adicionar Opção
                        </button>
                      )}
                    </div>

                    <div className="space-y-2">
                      {pollOptions.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="w-6 text-center text-xs font-mono font-bold text-amber-400">
                            {idx === 0 ? "1️⃣" : idx === 1 ? "2️⃣" : idx === 2 ? "3️⃣" : idx === 3 ? "4️⃣" : "5️⃣"}
                          </span>
                          <Input
                            placeholder={`Texto da opção ${idx + 1}`}
                            value={opt}
                            onChange={(e) => {
                              const newOpts = [...pollOptions];
                              newOpts[idx] = e.target.value;
                              setPollOptions(newOpts);
                            }}
                            className="h-8 text-xs bg-[#131722] border-neutral-700 text-white"
                          />
                          {pollOptions.length > 2 && (
                            <button
                              type="button"
                              onClick={() => setPollOptions((prev) => prev.filter((_, i) => i !== idx))}
                              className="text-neutral-500 hover:text-red-400 p-1 cursor-pointer transition-colors"
                              title="Remover opção"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Preview Card */}
                  <div className="rounded-lg border border-neutral-800 bg-[#090b10] p-3 space-y-2.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 block">
                      Pré-visualização do Embed no Discord
                    </span>
                    <div className="border-l-4 border-amber-500 pl-3 py-1 space-y-2 bg-[#12141c]/60 rounded-r-md p-2">
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>📊</span> {pollQuestion.trim() || "Pergunta da Enquete..."}
                      </div>

                      <div className="space-y-1.5 text-[11px]">
                        {pollOptions.map((opt, idx) => {
                          const emoji = idx === 0 ? "1️⃣" : idx === 1 ? "2️⃣" : idx === 2 ? "3️⃣" : idx === 3 ? "4️⃣" : "5️⃣";
                          return (
                            <div key={idx} className="space-y-0.5">
                              <div className="text-neutral-200 font-semibold flex items-center gap-1">
                                <span>{emoji}</span> {opt.trim() || `Opção ${idx + 1}`}
                              </div>
                              <div className="font-mono text-[10px] text-amber-300 flex items-center gap-2">
                                <span>  0% </span>
                                <span className="text-neutral-500">░░░░░░░░░░</span>
                                <span className="text-neutral-400">— 0 votos</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="text-[9px] text-neutral-500 pt-1 border-t border-neutral-800/80">
                        Total de Votos: 0 • Clique nas opções para votar (1 voto por pessoa)
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {pollOptions.map((opt, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-blue-600/30 text-blue-300 border border-blue-500/40 text-[10px] font-medium"
                        >
                          {idx === 0 ? "1️⃣" : idx === 1 ? "2️⃣" : idx === 2 ? "3️⃣" : idx === 3 ? "4️⃣" : "5️⃣"} {opt.trim() || `Opção ${idx + 1}`}
                        </span>
                      ))}
                      <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700 text-[10px]">
                        👥 Ver Votos
                      </span>
                      <span className="px-2 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-800/50 text-[10px]">
                        🔒 Encerrar
                      </span>
                    </div>
                  </div>

                  <Button
                    onClick={handleCreatePoll}
                    disabled={creatingPoll || !pollChannelId || !pollQuestion.trim()}
                    className="w-full bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white font-bold text-xs h-9 shadow-md shadow-amber-600/20 cursor-pointer"
                  >
                    {creatingPoll ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Publicando no Discord...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Send className="h-3.5 w-3.5" /> Publicar Enquete no Discord
                      </span>
                    )}
                  </Button>
                </div>
              </div>

              {/* Right Column: List of Active & Past Polls */}
              <div className="lg:col-span-7 rounded-xl border border-neutral-800 bg-[#0d1017] p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-amber-400" /> Enquetes Criadas ({pollsList.length})
                  </h3>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    Atualização em tempo real ao votar
                  </span>
                </div>

                {pollsList.length === 0 ? (
                  <div className="text-center py-12 px-4 border border-dashed border-neutral-800 rounded-xl space-y-2">
                    <BarChart3 className="h-8 w-8 text-neutral-600 mx-auto" />
                    <p className="text-sm font-semibold text-neutral-300">Nenhuma enquete encontrada</p>
                    <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                      Crie uma enquete pelo formulário ao lado ou utilize o comando oficial <code className="text-amber-400 font-mono">/enquete</code> no Discord!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                    {pollsList.map((p) => {
                      const totalVotes = Object.keys(p.votes || {}).length;
                      const votersList = Object.values(p.votes || {}) as any[];

                      return (
                        <div
                          key={p.id}
                          className={`rounded-xl border p-4 space-y-3 transition-all ${
                            p.closed
                              ? "border-neutral-800 bg-[#0a0d13]/60 opacity-85"
                              : "border-amber-500/30 bg-[#10141d] hover:border-amber-500/50 shadow-md"
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800/80 pb-2">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold text-white">
                                  📊 {p.question}
                                </h4>
                                {p.closed ? (
                                  <Badge variant="outline" className="bg-neutral-800 text-neutral-400 border-neutral-700 text-[10px]">
                                    🔒 Encerrada
                                  </Badge>
                                ) : (
                                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] animate-pulse">
                                    🟢 Votação Ativa
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[11px] text-neutral-400 flex items-center gap-3">
                                <span>Canal: <code className="text-amber-300">#{guild?.channels?.find((c) => c.id === p.channelId)?.name || p.channelId}</code></span>
                                <span>Por: <span className="text-neutral-300 font-medium">@{p.creatorTag}</span></span>
                                <span className="font-mono text-neutral-500">{new Date(p.createdAt).toLocaleDateString("pt-BR")}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedPollVoters(p)}
                                className="h-7 text-xs border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-800 cursor-pointer"
                              >
                                👥 Votantes ({totalVotes})
                              </Button>

                              {!p.closed && (
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleClosePoll(p.id)}
                                  className="h-7 text-xs bg-red-600/80 hover:bg-red-700 text-white cursor-pointer"
                                >
                                  🔒 Encerrar
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Options Breakdown with Bars */}
                          <div className="space-y-2">
                            {p.options.map((opt: any, idx: number) => {
                              const votesForOption = votersList.filter((v: any) => v.optionIndex === idx);
                              const count = votesForOption.length;
                              const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                              const emoji = idx === 0 ? "1️⃣" : idx === 1 ? "2️⃣" : idx === 2 ? "3️⃣" : idx === 3 ? "4️⃣" : "5️⃣";

                              // ASCII progress bar matching prompt
                              const filledCount = Math.floor((percentage / 100) * 10);
                              const remainder = (percentage / 100) * 10 - filledCount;
                              let unicodeBar = "█".repeat(filledCount);
                              if (remainder >= 0.35 && unicodeBar.length < 10) unicodeBar += "▌";
                              const emptyCount = 10 - unicodeBar.length;
                              if (emptyCount > 0) unicodeBar += "░".repeat(emptyCount);

                              return (
                                <div key={idx} className="rounded-lg bg-[#080a0f] p-2.5 border border-neutral-800/60 space-y-1">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-white flex items-center gap-1.5">
                                      <span>{emoji}</span> {opt.text}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono text-amber-300 font-bold">{percentage}%</span>
                                      <span className="text-[11px] text-neutral-400">({count} {count === 1 ? "voto" : "votos"})</span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3">
                                    {/* Unicode Block Text Bar */}
                                    <span className="font-mono text-xs text-amber-400 select-all tracking-wider">
                                      {unicodeBar}
                                    </span>

                                    {/* Tailwind Visual Progress Bar */}
                                    <div className="flex-1 h-2 bg-neutral-800 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-gradient-to-r from-amber-500 to-red-500 rounded-full transition-all duration-300"
                                        style={{ width: `${percentage}%` }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Voters Mini-Avatars Strip */}
                          {votersList.length > 0 && (
                            <div className="flex items-center justify-between pt-1 text-[11px] text-neutral-400">
                              <div className="flex items-center gap-1.5 overflow-hidden">
                                <span className="text-neutral-500 text-[10px]">Votantes recentes:</span>
                                <div className="flex -space-x-1.5 overflow-hidden">
                                  {votersList.slice(0, 8).map((v, i) => (
                                    <img
                                      key={i}
                                      src={v.avatarUrl}
                                      alt={v.userTag}
                                      title={`@${v.userTag} votou na opção ${v.optionIndex + 1}`}
                                      className="inline-block h-5 w-5 rounded-full ring-2 ring-[#0d1017] object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).src = "https://cdn.discordapp.com/embed/avatars/0.png";
                                      }}
                                    />
                                  ))}
                                </div>
                                {votersList.length > 8 && (
                                  <span className="text-[10px] text-neutral-500 font-mono">
                                    +{votersList.length - 8}
                                  </span>
                                )}
                              </div>

                              <span className="text-[10px] font-mono text-neutral-400">
                                Total: {totalVotes} {totalVotes === 1 ? "voto" : "votos"}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal de Detalhes dos Votantes com Foto de Perfil */}
            {selectedPollVoters && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
                <div className="relative w-full max-w-lg rounded-2xl border border-neutral-700 bg-[#0f131c] p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
                  <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                    <div className="space-y-0.5">
                      <h3 className="text-base font-bold text-white flex items-center gap-2">
                        <Users className="h-5 w-5 text-amber-400" /> Registro Detalhado de Votantes
                      </h3>
                      <p className="text-xs text-neutral-400">
                        Enquete: <span className="text-white font-semibold">{selectedPollVoters.question}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedPollVoters(null)}
                      className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition-colors"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="space-y-4 overflow-y-auto flex-1 pr-1">
                    {selectedPollVoters.options.map((opt: any, idx: number) => {
                      const voters = (Object.values(selectedPollVoters.votes || {}) as any[]).filter(
                        (v) => v.optionIndex === idx
                      );
                      const emoji = idx === 0 ? "1️⃣" : idx === 1 ? "2️⃣" : idx === 2 ? "3️⃣" : idx === 3 ? "4️⃣" : "5️⃣";

                      return (
                        <div key={idx} className="rounded-xl border border-neutral-800 bg-[#090b11] p-3 space-y-2">
                          <div className="flex items-center justify-between border-b border-neutral-800/60 pb-1.5">
                            <span className="text-xs font-bold text-white flex items-center gap-1.5">
                              <span>{emoji}</span> {opt.text}
                            </span>
                            <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-500/40">
                              {voters.length} {voters.length === 1 ? "voto" : "votos"}
                            </Badge>
                          </div>

                          {voters.length === 0 ? (
                            <p className="text-[11px] text-neutral-500 italic py-1">Nenhum voto nesta opção.</p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                              {voters.map((voter: any) => (
                                <div
                                  key={voter.userId}
                                  className="flex items-center gap-2.5 p-2 rounded-lg bg-[#121622] border border-neutral-800/80 hover:border-neutral-700 transition-all"
                                >
                                  <img
                                    src={voter.avatarUrl}
                                    alt={voter.userTag}
                                    className="h-8 w-8 rounded-full object-cover ring-1 ring-neutral-700 shrink-0"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = "https://cdn.discordapp.com/embed/avatars/0.png";
                                    }}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-bold text-white truncate">
                                      @{voter.userTag}
                                    </div>
                                    <div className="text-[10px] font-mono text-neutral-500">
                                      ID: {voter.userId}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-2 border-t border-neutral-800 flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => setSelectedPollVoters(null)}
                      className="bg-neutral-800 hover:bg-neutral-700 text-white text-xs"
                    >
                      Fechar Janela
                    </Button>
                  </div>
                </div>
              </div>
            )}
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
              {/* Presets & Cloned Voices Selector */}
              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-pink-400" />
                    Vozes Principais &amp; Vozes Clonadas:
                  </span>
                  {clonedVoices.length > 0 && (
                    <Badge variant="outline" className="border-pink-500/40 text-pink-300 text-[10px]">
                      {clonedVoices.length} Voz(es) Clonada(s)
                    </Badge>
                  )}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  {[
                    { id: "lhays_anime", label: "🧚 Dubladora Anime BR", sub: "Voz Oficial Lhays Macedo" },
                    { id: "garota_timida", label: "🌸 Anime Girl Shy", sub: "Garota Tímida (Soft / Anime)" },
                    { id: "anytospeech_mcp", label: "⚡ AnyToSpeech MCP", sub: "Geração MCP Rápida" },
                  ].map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVoice(v.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        selectedVoice === v.id
                          ? "border-pink-500 bg-pink-500/15 text-pink-200 cyber-glow-pink font-bold"
                          : "border-neutral-800 bg-[#131722] text-neutral-400 hover:text-white hover:border-neutral-700"
                      }`}
                    >
                      <div className="text-xs">{v.label}</div>
                      <div className="text-[10px] text-neutral-400">{v.sub}</div>
                    </button>
                  ))}

                  {/* Render User's Saved Cloned Voices */}
                  {clonedVoices.map((cv) => (
                    <div
                      key={cv.id}
                      className={`relative p-2.5 rounded-xl border text-left transition-all flex items-center justify-between group ${
                        selectedVoice === cv.id
                          ? "border-pink-500 bg-pink-500/20 text-pink-200 cyber-glow-pink font-bold"
                          : "border-neutral-800 bg-[#131722] text-neutral-400 hover:text-white"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedVoice(cv.id)}
                        className="flex-1 text-left cursor-pointer min-w-0 pr-2"
                      >
                        <div className="text-xs truncate flex items-center gap-1">
                          <span>🎙️</span> {cv.name}
                        </div>
                        <div className="text-[10px] text-pink-400 font-mono">Voz Clonada Salva</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteClonedVoice(cv.id)}
                        className="text-neutral-500 hover:text-red-400 p-1 rounded cursor-pointer transition-colors shrink-0"
                        title="Deletar Voz Clonada"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>

                {selectedVoice === "anytospeech_mcp" && (
                  <div className="mt-2.5 p-2.5 rounded-lg border border-amber-500/30 bg-[#131722] space-y-1.5 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between text-xs font-semibold text-amber-300">
                      <span>⚡ Servidor MCP AnyToSpeech (API Endpoint: https://anytospeech.com/api/mcp)</span>
                    </div>
                    <Input
                      type="password"
                      placeholder="Cole aqui seu Token / Chave de API AnyToSpeech MCP (opcional)..."
                      value={mcpApiKey}
                      onChange={(e) => setMcpApiKey(e.target.value)}
                      className="h-8 text-xs bg-[#0b0c10] border-neutral-700 text-white placeholder:text-neutral-500 font-mono"
                    />
                    <p className="text-[10px] text-neutral-400">
                      Ao escrever a mensagem abaixo, o bot enviará a requisição em milissegundos para o servidor MCP AnyToSpeech para tocar diretamente na call!
                    </p>
                  </div>
                )}
              </div>

              {/* Voice Expression Selector */}
              <div className="pt-3 border-t border-neutral-800/80">
                <label className="text-xs font-bold text-neutral-300 block mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    Expressão &amp; Emoção da Voz (Modo de Fala):
                  </span>
                  <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px] capitalize font-mono">
                    Expressão Ativa: {selectedExpression}
                  </Badge>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5">
                  {[
                    { id: "shy", label: "🌸 Tímida", sub: "Garota Tímida (Soft)", icon: "🌸" },
                    { id: "cute", label: "💖 Fofa", sub: "Kawaii / Aguda", icon: "💖" },
                    { id: "whisper", label: "🤫 Sussurro", sub: "Provocante & Suave", icon: "🤫" },
                    { id: "happy", label: "😄 Alegre", sub: "Animada & Energética", icon: "😄" },
                    { id: "angry", label: "😠 Irritada", sub: "Firme / Tsundere", icon: "😠" },
                    { id: "sad", label: "😢 Triste", sub: "Calma & Emotiva", icon: "😢" },
                    { id: "neutral", label: "😐 Neutra", sub: "Natural / Padrão", icon: "😐" },
                  ].map((expr) => (
                    <button
                      key={expr.id}
                      type="button"
                      onClick={() => setSelectedExpression(expr.id)}
                      className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                        selectedExpression === expr.id
                          ? "border-amber-500 bg-amber-500/20 text-amber-200 cyber-glow-pink font-bold"
                          : "border-neutral-800 bg-[#131722] text-neutral-400 hover:text-white hover:border-neutral-700"
                      }`}
                    >
                      <div className="text-xs flex items-center gap-1">
                        <span>{expr.icon}</span> {expr.label}
                      </div>
                      <div className="text-[9px] text-neutral-400 truncate">{expr.sub}</div>
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

            {/* Voice Studio (Voice Cloning & Mic Recorder) Card */}
            <div className="rounded-xl border border-pink-500/40 bg-[#0d1017] p-4 space-y-3 cyber-glow-pink">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800/80 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Mic className="h-4 w-4 text-pink-400" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                      🎙️ Voice Studio — Gravador &amp; Clonador de Voz (VoiceStudio.sh)
                    </h3>
                  </div>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Grave sua própria voz ao vivo pelo microfone ou envie um áudio de referência para <b>clonar e salvar sua voz para sempre</b> no bot!
                  </p>
                </div>
                <Badge variant="outline" className="border-pink-500/40 text-pink-300 text-[10px] shrink-0">
                  ⚡ Salvo Para Sempre no Disco
                </Badge>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                {/* Step 1: Recording & Audio Sample Input */}
                <div className="space-y-2 rounded-xl bg-[#121622] p-3 border border-neutral-800">
                  <span className="text-xs font-semibold text-neutral-300 block">
                    1. Grave sua voz pelo Microfone do Navegador:
                  </span>

                  <div className="flex flex-wrap items-center gap-2">
                    {!isRecordingMic ? (
                      <Button
                        type="button"
                        onClick={startMicRecording}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs gap-1.5 h-9 cursor-pointer shadow-md shadow-red-600/25"
                      >
                        <Mic className="h-3.5 w-3.5" /> 🔴 Gravar Áudio pelo Microfone
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={stopMicRecording}
                        className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs gap-1.5 h-9 cursor-pointer animate-pulse"
                      >
                        <span className="h-2 w-2 rounded-full bg-white animate-ping" /> ⏹️ Parar Gravação
                      </Button>
                    )}

                    <label className="h-9 px-3 rounded-md bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-300 flex items-center gap-1.5 cursor-pointer border border-neutral-700">
                      <UploadCloud className="h-3.5 w-3.5 text-pink-400" />
                      Upload de Áudio Sample
                      <input
                        type="file"
                        accept="audio/*,.webm,.wav,.mp3,.ogg,.m4a"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            const b64 = reader.result as string;
                            setRecordedAudioBase64(b64);
                            setRecordedAudioUrl(URL.createObjectURL(file));
                            toast.success(`Amostra "${file.name}" pronta para clonagem!`);
                          };
                          reader.readAsDataURL(file);
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {recordedAudioUrl && (
                    <div className="pt-2 space-y-1">
                      <span className="text-[10px] text-pink-400 font-mono block">
                        Prévia do Áudio Gravado:
                      </span>
                      <audio src={recordedAudioUrl} controls className="h-8 w-full rounded" />
                    </div>
                  )}
                </div>

                {/* Step 2: Name & Save Cloned Voice */}
                <div className="space-y-2 rounded-xl bg-[#121622] p-3 border border-neutral-800 flex flex-col justify-between">
                  <div>
                    <span className="text-xs font-semibold text-neutral-300 block mb-1">
                      2. Nomeie e Clone sua Voz Permanentemente:
                    </span>
                    <Input
                      placeholder="Nome da sua voz (ex: Minha Voz, Voz do Gabriel...)"
                      value={cloneVoiceName}
                      onChange={(e) => setCloneVoiceName(e.target.value)}
                      className="h-9 text-xs bg-[#0b0c10] border-neutral-700 text-white"
                    />
                  </div>

                  <Button
                    type="button"
                    onClick={handleSaveClonedVoice}
                    disabled={cloningVoice || !recordedAudioBase64}
                    className="w-full bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold text-xs h-9 cursor-pointer shadow-md shadow-pink-600/30 gap-1.5 mt-2"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    {cloningVoice ? "Clonando e Salvando..." : "⚡ Clonar e Salvar Voz para Sempre"}
                  </Button>
                </div>
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
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div className="p-2.5 rounded-lg border border-neutral-800 bg-[#121622] space-y-1">
                  <span className="text-[10px] font-mono text-neutral-400 uppercase block">DISCORD_BOT_TOKEN</span>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
                    <span className="text-xs font-mono text-emerald-300 font-bold">Configurado &amp; Conectado</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-neutral-800 bg-[#121622] space-y-1">
                  <span className="text-[10px] font-mono text-neutral-400 uppercase block">TEST_BOT_TOKEN (2º Bot)</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${statusInfo?.testBot?.online ? "bg-emerald-400" : "bg-amber-400"}`}></span>
                    <span className={`text-xs font-mono font-bold truncate ${statusInfo?.testBot?.online ? "text-emerald-300" : "text-amber-300"}`}>
                      {statusInfo?.testBot?.online
                        ? `Online (${statusInfo.testBot.username})`
                        : statusInfo?.testBotTokenConfigured
                        ? "Configurado no .env"
                        : "Não configurado"}
                    </span>
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
                  <div>
                    <label className="text-[11px] text-cyan-400 font-semibold block mb-1">
                      2º Bot de Testes Token (TEST_BOT_TOKEN)
                    </label>
                    <Input
                      placeholder="Cole o Token do 2º Bot para testes (/spam e /testar-bloqueio)"
                      value={configTestBotToken}
                      onChange={(e) => setConfigTestBotToken(e.target.value)}
                      type="password"
                      className="bg-[#121622] border-cyan-500/40 text-xs font-mono"
                    />
                  </div>
                  <div>
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
                    disabled={savingCreds || (!configClientSecret.trim() && !configBotToken.trim() && !configTestBotToken.trim() && !configGroqKey.trim())}
                    className="bg-pink-600 hover:bg-pink-700 text-white font-semibold text-xs cursor-pointer shadow-md shadow-pink-600/20"
                  >
                    {savingCreds ? "Salvando..." : "Salvar Credenciais e Chaves no Painel"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
          </div>
        </main>
      </div>
    </div>
  );
}
