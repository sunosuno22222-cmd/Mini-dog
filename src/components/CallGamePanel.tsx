import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Gamepad2,
  Play,
  StopCircle,
  Volume2,
  Lock,
  CheckCircle2,
  RefreshCw,
  Crown,
  Users,
  Trophy,
  Scale,
  Sparkles,
  Link2,
  Copy,
  ExternalLink,
  LogOut,
  Monitor,
  Globe,
  ShieldCheck,
  Tv,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BroadcastStage } from "@/components/BroadcastStage";
import { useBroadcastSocket } from "@/hooks/useBroadcastSocket";
import { apiFetch } from "@/lib/api";

interface GuildChannel {
  id: string;
  name: string;
  type: number;
}

interface ClonedVoice {
  id: string;
  name: string;
}

interface CallGameRoundAnswer {
  userId: string;
  username: string;
  answer: string;
  points: number;
  aiComment: string;
  answeredAt: number;
}

interface CallGameRoundResult {
  roundIndex: number;
  question: string;
  winnerUserId: string | null;
  winnerUsername: string | null;
  winnerAnswer: string | null;
  explanation: string;
  answers: CallGameRoundAnswer[];
}

interface CallGameSession {
  active: boolean;
  phase: "idle" | "lobby" | "starting" | "playing" | "finished";
  guildId: string;
  ownerUserId: string;
  voiceChannelId: string;
  voiceChannelName: string;
  tempVoiceChannelId: string | null;
  tempVoiceChannelName: string | null;
  privateChannelId: string | null;
  privateChannelName: string | null;
  voice: string;
  expression: string;
  rulesText: string;
  questionPool?: string[];
  questionsPerMatch?: number;
  questions: string[];
  roundSeconds: number;
  currentRoundIndex: number;
  currentQuestion: string | null;
  roundDeadlineAt: number | null;
  startedAt: number;
  connectedAccount?: { userId: string; username: string; avatar?: string | null } | null;
  autoScreenBroadcast?: boolean;
  readyPlayers: Array<{ userId: string; username: string; readyAt: number }>;
  matchPlayers: Array<{
    userId: string;
    username: string;
    privateTextChannelId: string | null;
    totalPoints: number;
  }>;
  roundResults: CallGameRoundResult[];
  events: Array<{ id: string; time: number; text: string }>;
}

interface OAuthUser {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string;
}

interface OAuthSetupMeta {
  clientId: string | null;
  clientSecretConfigured: boolean;
  redirectUri: string;
  altRedirectUri?: string;
  botInviteUrl: string | null;
  customProvidedLink: string | null;
  linkRedirectUri?: string | null;
  linkOriginMismatch?: boolean;
  restrictedRpcScopes?: string[];
  scopes: string[];
}

interface ServerScreenStatusInfo {
  active: boolean;
  internalStage?: boolean;
  region?: string;
  framesSent?: number;
  discordChannelName?: string | null;
  lastError?: string | null;
}

const SESSION_REF_KEY = "discord_tx_session_ref";

interface CallGamePanelProps {
  password?: string;
  guildId: string | null;
  channels: GuildChannel[];
  voiceChannelId: string;
  setVoiceChannelId: (id: string) => void;
  clonedVoices: ClonedVoice[];
}

const DEFAULT_QUESTIONS_TEXT = [
  "Se você ficasse preso dentro de um elevador sozinho e sem sinal no celular, o que você faria?",
  "Se você ganhasse 1 milhão de reais na loteria hoje à tarde, qual seria a primeira coisa que faria?",
  "Se você acordasse atrasado 2 horas para o compromisso mais importante da sua vida, como resolveria?",
  "Se você perdesse seu celular e sua carteira em outra cidade durante uma viagem, o que faria primeiro?",
  "Se acabasse a energia elétrica no seu bairro por 3 dias seguidos, como você se viraria?",
  "Se você encontrasse uma carteira na rua com 5 mil reais e nenhum documento, o que você faria?",
  "Se você tivesse que cozinhar um jantar completo em 20 minutos para impressionar alguém, o que faria?",
  "Se seu cachorro ou gato saísse correndo para a rua à noite, como você faria para encontrá-lo rápido?",
  "Se você esquecesse o aniversário da pessoa mais importante para você no próprio dia, como salvaria a situação?",
  "Se você ficasse preso numa ilha deserta podendo levar apenas 3 itens da sua mochila, quais escolheria?",
  "Se o pneu do seu carro ou bicicleta furasse no meio da chuva longe de casa, o que você faria?",
  "Se você derrubasse café quente no notebook minutos antes de uma apresentação, qual seria seu plano?",
  "Se você recebesse uma mensagem dizendo que ganhou uma viagem gratuita para sair em 1 hora, para onde iria e como se prepararia?",
  "Se todos os seus aplicativos de banco parassem de funcionar bem na hora de pagar a conta no restaurante, como sairia dessa?",
  "Se você tivesse que sobreviver uma semana inteira gastando no máximo 50 reais, o que compraria?",
  "Se um amigo próximo contasse um segredo enorme e outra pessoa começasse a perguntar sobre isso, como reagiria?",
  "Se você ficasse trancado do lado de fora de casa de pijama e sem chave, como entraria ou o que faria?",
  "Se você pudesse voltar exatamente 5 anos no tempo mantendo todas as memórias de hoje, o que mudaria?",
  "Se você fosse convidado para dar uma palestra improvisada sobre um assunto que não domina, como conduziria?",
  "Se você perdesse o último ônibus ou metrô de volta para casa de madrugada sem bateria no celular, o que faria?",
  "Se você descobrisse que seu vizinho está fazendo uma obra barulhenta às 6 da manhã todo domingo, como resolveria?",
  "Se você tivesse que aprender uma habilidade nova do zero em apenas 7 dias, qual escolheria e como estudaria?",
  "Se a internet do mundo inteiro caísse por 30 dias, o que você faria com todo o seu tempo livre?",
  "Se você comprasse algo caro pela internet e chegasse uma caixa com um tijolo dentro, o que faria passo a passo?",
  "Se você entrasse no ônibus ou metrô errado e só percebesse 1 hora depois em um lugar desconhecido, como voltaria?",
  "Se você tivesse que escolher um único prato para comer pelo resto da vida, qual seria e por quê?",
  "Se você fosse chefe de uma empresa por um dia, qual mudança prática faria primeiro?",
  "Se você estivesse numa entrevista de emprego e o entrevistador fizesse uma pergunta que você não sabe responder, o que diria?",
  "Se você precisasse acalmar uma criança chorando muito no meio de um voo longo, qual estratégia usaria?",
  "Se você descobrisse que tem apenas 24 horas livres sem nenhuma obrigação no mundo, como aproveitaria?",
  "Se você fosse morar sozinho pela primeira vez amanhã com orçamento apertado, quais 3 coisas priorizaria?",
  "Se você encontrasse um animal silvestre perdido no quintal da sua casa, como agiria com segurança?",
  "Se você tivesse que convencer alguém desconhecido a te ajudar numa mudança sem pagar nada, o que ofereceria em troca?",
  "Se você recebesse por engano uma encomenda gigante na sua porta no nome de outra pessoa, o que faria?",
  "Se você percebesse no meio de uma prova importante que estudou a matéria errada, como tentaria ir bem mesmo assim?",
  "Se você tivesse que ficar 48 horas acordado trabalhando num projeto urgente, como manteria o foco sem desistir?",
  "Se você viajasse para um país onde ninguém fala o seu idioma e seu tradutor não funcionasse, como se comunicaria?",
  "Se você estivesse num restaurante e percebesse que a comida veio completamente errada, mas está com muita pressa, o que faria?",
  "Se você pudesse criar uma lei simples que todo mundo no Brasil tivesse que seguir amanhã, qual seria?",
  "Se você tivesse que organizar uma festa surpresa incrível em apenas 3 horas, qual seria o seu plano?",
  "Se o seu melhor amigo pedisse sua opinião sincera sobre uma ideia muito ruim que ele está animado, o que você diria?",
  "Se você acordasse falando fluentemente qualquer idioma que escolher, qual escolheria e como usaria isso?",
  "Se você precisasse guardar um objeto muito valioso em casa sem ter cofre, onde esconderia?",
  "Se você ficasse sem água em casa bem na hora de tomar banho antes de sair, como resolveria rápido?",
  "Se você visse alguém passando mal na rua e ninguém ao redor estivesse ajudando, quais seriam suas primeiras ações?",
  "Se você tivesse que escolher entre um trabalho dos sonhos ganhando pouco ou um trabalho chato ganhando muito, qual escolheria e como lidaria?",
  "Se você perdesse todas as fotos e arquivos do seu computador hoje, o que faria para reconstruir tudo?",
  "Se você tivesse que passar um fim de semana inteiro numa cabana na serra sem televisão nem celular, o que levaria para se divertir?",
  "Se um amigo te emprestasse algo caro e você acabasse quebrando sem querer, como contaria e resolveria?",
  "Se você recebesse uma proposta para mudar de país amanhã com tudo pago, aceitaria na hora ou o que avaliaria antes?",
  "Se você fosse responsável por animar uma festa em que ninguém se conhece e todo mundo está quieto, o que faria?",
  "Se você acordasse com 10 anos de idade mantendo a cabeça de hoje, qual seria seu plano de vida?",
  "Se você tivesse que economizar metade do seu dinheiro todo mês a partir de agora, o que cortaria primeiro?",
  "Se você estivesse perdido numa trilha no meio do mato ao entardecer, o que faria para ficar seguro?",
  "Se você pudesse conversar por 10 minutos com qualquer pessoa da história, quem escolheria e o que perguntaria?",
  "Se você tivesse que montar um pequeno negócio do zero com apenas 200 reais, o que venderia ou faria?",
  "Se você esquecesse completamente o nome de alguém que veio falar com você todo animado na rua, como disfarçaria?",
  "Se você percebesse que pegou o carrinho de compras de outra pessoa no supermercado só depois de chegar no caixa, o que faria?",
  "Se você pudesse eliminar um único problema do seu dia a dia para sempre, qual escolheria?",
  "Se você tivesse que escolher 3 regras básicas para uma amizade durar a vida toda, quais seriam?",
].join("\n");

export function CallGamePanel({
  password = "",
  guildId,
  channels,
  voiceChannelId,
  setVoiceChannelId,
  clonedVoices,
}: CallGamePanelProps) {
  const voiceChannels = channels.filter((c) => c.type === 2 || c.type === 13);
  const textChannels = channels.filter((c) => c.type === 0 || c.type === 5);

  useEffect(() => {
    if (!voiceChannelId && voiceChannels.length > 0) {
      setVoiceChannelId(voiceChannels[0].id);
    }
  }, [voiceChannelId, voiceChannels, setVoiceChannelId]);

  const [game, setGame] = useState<CallGameSession | null>(null);
  const [selectedVoice, setSelectedVoice] = useState("narrator");
  const [selectedExpression, setSelectedExpression] = useState("shy");
  const [ownerUserId, setOwnerUserId] = useState("1554257592015003674");
  const [smsChannelId, setSmsChannelId] = useState("");
  const [roundSeconds, setRoundSeconds] = useState(60);
  const [questionsPerMatch, setQuestionsPerMatch] = useState(4);
  const [questionsText, setQuestionsText] = useState(DEFAULT_QUESTIONS_TEXT);
  const [rulesText, setRulesText] = useState(
    "1. Entre na call normal e aguarde o dono iniciar tudo.\n2. Ao começar, todos serão movidos para a call principal privada.\n3. Responda cada pergunta apenas no seu canal privado!"
  );
  const [busy, setBusy] = useState(false);
  const [deleteChannelOnStop, setDeleteChannelOnStop] = useState(true);
  const [disconnectCallOnStop, setDisconnectCallOnStop] = useState(true);
  const [autoScreenBroadcast, setAutoScreenBroadcast] = useState(true);
  const [nowMs, setNowMs] = useState(Date.now());

  // Mandatory OAuth2 state + Owner-provided link setup
  const [oauthLoading, setOauthLoading] = useState(true);
  const [oauthConnected, setOauthConnected] = useState(false);
  const [oauthUser, setOauthUser] = useState<OAuthUser | null>(null);
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const [disconnectingOAuth, setDisconnectingOAuth] = useState(false);
  const [oauthFallbackUrl, setOauthFallbackUrl] = useState<string | null>(null);
  const [setupMeta, setSetupMeta] = useState<OAuthSetupMeta | null>(null);
  const [showLinkConfig, setShowLinkConfig] = useState(false);
  const [customLinkInput, setCustomLinkInput] = useState("");
  const [savingCustomLink, setSavingCustomLink] = useState(false);

  // Live US Chromium stage telemetry
  const { state: broadcastState, wsConnected } = useBroadcastSocket();
  const [serverScreen, setServerScreen] = useState<ServerScreenStatusInfo | null>(null);

  const getSessionHeaders = (): Record<string, string> => {
    const ref = sessionStorage.getItem(SESSION_REF_KEY);
    return ref ? { "x-discord-session": ref } : {};
  };

  const fetchOAuthSetup = useCallback(async () => {
    try {
      const origin = encodeURIComponent(window.location.origin);
      const res = await fetch(`/api/auth/discord/setup?origin=${origin}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setSetupMeta(data);
        if (data.customProvidedLink) {
          setCustomLinkInput(data.customProvidedLink);
        }
      }
    } catch {}
  }, []);

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
        if (data.sessionRef) {
          sessionStorage.setItem(SESSION_REF_KEY, data.sessionRef);
        }
      } else {
        setOauthConnected(false);
        setOauthUser(null);
      }
    } catch {
      // ignore transient glitch
    } finally {
      setOauthLoading(false);
    }
  }, []);

  const fetchServerScreenStatus = useCallback(async () => {
    if (!guildId) return;
    try {
      const res = await apiFetch(`/api/guilds/${guildId}/broadcast/server-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, refresh: false }),
      });
      const data = await res.json();
      if (res.ok && data.state) {
        setServerScreen(data.state);
      }
    } catch {}
  }, [guildId, password]);

  useEffect(() => {
    fetchOAuthSession();
    fetchOAuthSetup();
    fetchServerScreenStatus();
  }, [fetchOAuthSession, fetchOAuthSetup, fetchServerScreenStatus]);

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
        toast.success("Conta Discord conectada! Pronto para iniciar o Jogo da Call.");
        setConnectingOAuth(false);
        setOauthFallbackUrl(null);
        fetchOAuthSession();
      } else if (event.data?.type === "OAUTH_AUTH_ERROR") {
        toast.error(event.data.message || "Falha ao autenticar conta Discord.");
        setConnectingOAuth(false);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [fetchOAuthSession]);

  const handleConnectDiscord = async (opts?: { useShortCallback?: boolean }) => {
    setConnectingOAuth(true);
    try {
      const origin = encodeURIComponent(window.location.origin);
      const cbMode = opts?.useShortCallback ? "short" : "api";
      const res = await fetch(`/api/auth/discord/url?origin=${origin}&callbackMode=${cbMode}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Não foi possível gerar a URL OAuth2.");
      }
      setOauthFallbackUrl(data.url);

      const width = 520;
      const height = 740;
      const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
      const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
      const authPopup = window.open(
        data.url,
        "discord_oauth_callgame",
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );
      if (!authPopup) {
        toast.info("Use o link direto exibido abaixo para autorizar sua conta Discord.");
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
      toast.info("Conta Discord desconectada.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDisconnectingOAuth(false);
    }
  };

  const handleSaveCustomLink = async () => {
    setSavingCustomLink(true);
    try {
      const res = await apiFetch("/api/auth/discord/custom-link-panel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, link: customLinkInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao salvar link.");
      toast.success(
        data.extractedClientId
          ? `Link salvo! Client ID ${data.extractedClientId} atualizado no OAuth2.`
          : "Link salvo nas configurações."
      );
      fetchOAuthSetup();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingCustomLink(false);
    }
  };

  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado!`);
    } catch {
      toast.error("Não foi possível copiar automaticamente.");
    }
  };

  const fetchGameStatus = async () => {
    if (!guildId) return;
    try {
      const res = await apiFetch(`/api/guilds/${guildId}/call-game/status`);
      const data = await res.json();
      if (data.success && data.game) {
        setGame(data.game);
        if (data.game.active && data.game.rulesText) {
          setRulesText(data.game.rulesText);
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchGameStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guildId]);

  useEffect(() => {
    if (!game?.active || !guildId) return;
    const timer = setInterval(() => {
      setNowMs(Date.now());
      fetchGameStatus();
      fetchServerScreenStatus();
    }, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.active, guildId, fetchServerScreenStatus]);

  const handleStartLobby = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guildId || !voiceChannelId) {
      toast.error("Selecione a call normal para iniciar o Jogo da Call!");
      return;
    }

    const parsedQuestions = questionsText
      .split("\n")
      .map((q) => q.trim())
      .filter(Boolean);

    if (parsedQuestions.length === 0) {
      toast.error("Adicione pelo menos 1 pergunta!");
      return;
    }

    setBusy(true);
    try {
      const res = await apiFetch(`/api/guilds/${guildId}/call-game/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getSessionHeaders() },
        body: JSON.stringify({
          password,
          guildId,
          channelId: voiceChannelId,
          voice: selectedVoice,
          expression: selectedExpression,
          rulesText,
          ownerUserId: ownerUserId.trim() || "1554257592015003674",
          smsChannelId: smsChannelId || null,
          questions: parsedQuestions,
          questionsPerMatch,
          roundSeconds,
          autoScreenBroadcast,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao iniciar o Jogo da Call.");
      setGame(data.game);
      fetchServerScreenStatus();
      toast.success(
        `Lobby aberto em "${data.game.voiceChannelName}"! Tela de espera (EUA us-east5) iniciada no servidor.`
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleBeginMatchNow = async () => {
    if (!guildId) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/guilds/${guildId}/call-game/begin-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, guildId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao começar tudo.");
      setGame(data.game);
      toast.success("Todos movidos para a call principal privada! Perguntas iniciando em 3s.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleStopGame = async () => {
    if (!guildId) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/guilds/${guildId}/call-game/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          guildId,
          deleteChannel: deleteChannelOnStop,
          disconnectCall: disconnectCallOnStop,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao encerrar o jogo.");
      setGame(data.game);
      toast.info("Jogo da Call encerrado.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remainingRoundSecs =
    game?.roundDeadlineAt && game.phase === "playing"
      ? Math.max(0, Math.ceil((game.roundDeadlineAt - nowMs) / 1000))
      : null;

  const sortedMatchRanking = [...(game?.matchPlayers || [])].sort(
    (a, b) => b.totalPoints - a.totalPoints
  );

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            <Gamepad2 className="h-5 w-5 text-emerald-400" />
            Jogo da Call — Julgamento &amp; Perguntas IA
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Call normal de espera → botão privado do dono (Começar Tudo) → call principal temporária + canal secreto por jogador + leitura em voz alta e pontuação por IA.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-300 shrink-0">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              game?.phase === "playing"
                ? "bg-emerald-400"
                : game?.active
                ? "bg-amber-400"
                : "bg-slate-500"
            }`}
          />
          <span>
            {game?.phase === "playing"
              ? `Partida ativa · Pergunta ${game.currentRoundIndex + 1}/${game.questions.length}`
              : game?.phase === "lobby"
              ? `Lobby aberto em: ${game.voiceChannelName}`
              : game?.phase === "finished"
              ? "Última partida finalizada"
              : "Jogo parado"}
          </span>
        </div>
      </div>

      {/* Mandatory Discord Account OAuth2 Card */}
      <div
        className={`rounded-xl border p-4 space-y-3 ${
          oauthConnected
            ? "border-emerald-500/30 bg-[#0f131d]"
            : "border-red-500/35 bg-red-950/[0.15]"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {oauthConnected && oauthUser ? (
              <img
                src={oauthUser.avatarUrl}
                alt={oauthUser.globalName || oauthUser.username}
                className="w-11 h-11 rounded-lg object-cover border border-emerald-500/40 shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-lg bg-[#151a27] border border-white/[0.1] flex items-center justify-center shrink-0">
                <ShieldCheck
                  className={`h-5 w-5 ${oauthConnected ? "text-emerald-400" : "text-red-400"}`}
                />
              </div>
            )}

            <div>
              <div className="text-xs font-bold text-white flex flex-wrap items-center gap-2">
                <span>Conexão Obrigatória da Conta Discord (OAuth2)</span>
                {oauthConnected ? (
                  <span className="text-[11px] font-medium text-emerald-300">· Conectado</span>
                ) : (
                  <span className="text-[11px] font-medium text-red-300">
                    · Obrigatório para jogar
                  </span>
                )}
              </div>
              {oauthLoading ? (
                <p className="text-[11px] text-slate-400 mt-0.5">Verificando sessão Discord...</p>
              ) : oauthConnected && oauthUser ? (
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Conta ativa:{" "}
                  <strong className="text-white">
                    {oauthUser.globalName || oauthUser.username}
                  </strong>{" "}
                  (@{oauthUser.username}) · ID{" "}
                  <span className="font-mono text-slate-400">{oauthUser.id}</span>
                </p>
              ) : (
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Conecte sua conta Discord pelo OAuth2 oficial antes de abrir a call. Servidor de
                  transmissão ativo em{" "}
                  <strong className="text-white">us-east5 (Estados Unidos)</strong>.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowLinkConfig((prev) => !prev)}
              className="h-9 border-white/[0.12] bg-[#141926] hover:bg-[#1c2335] text-slate-200 text-xs cursor-pointer"
            >
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              {showLinkConfig ? "Ocultar Link / Callback" : "Link Fornecido / Callback"}
            </Button>

            {oauthConnected ? (
              <Button
                type="button"
                variant="outline"
                disabled={disconnectingOAuth}
                onClick={handleDisconnectDiscord}
                className="h-9 border-white/[0.12] bg-[#141926] hover:bg-red-950/50 text-slate-200 text-xs cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5 mr-1.5" /> Desconectar
              </Button>
            ) : (
              <Button
                type="button"
                disabled={connectingOAuth}
                onClick={() => handleConnectDiscord()}
                className="h-9 bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-semibold px-4 cursor-pointer"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                {connectingOAuth ? "Conectando..." : "Conectar Conta Discord"}
              </Button>
            )}
          </div>
        </div>

        {setupMeta?.linkOriginMismatch && !oauthConnected && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-[11px] text-amber-200 flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>Seu link OAuth2 (Client ID {setupMeta.clientId})</strong> já está carregado! O redirect do link original apontava para outro host antigo — atualize no Discord Developer Portal para este domínio ativo e clique em{" "}
              <strong>Conectar Conta Discord</strong>.
            </span>
            <button
              type="button"
              onClick={() => setShowLinkConfig(true)}
              className="text-white font-semibold underline underline-offset-2 shrink-0 cursor-pointer"
            >
              Ver URLs exatas →
            </button>
          </div>
        )}

        {oauthFallbackUrl && !oauthConnected && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="text-amber-200 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Se a janela não abriu, autorize clicando no link oficial do Discord:
            </span>
            <a
              href={oauthFallbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-white underline underline-offset-2 hover:text-amber-200"
            >
              Abrir Autorização Discord OAuth2 →
            </a>
          </div>
        )}

        {showLinkConfig && (
          <div className="pt-3 border-t border-white/[0.08] space-y-3">
            {setupMeta?.restrictedRpcScopes && setupMeta.restrictedRpcScopes.length > 0 && (
              <div className="rounded-lg border border-white/[0.08] bg-[#0b0e16] px-3 py-2 text-[11px] text-slate-300 leading-relaxed">
                <strong className="text-white">Observação sobre escopos do link:</strong> seu link inclui escopos restritos de RPC (
                <span className="font-mono text-amber-300">
                  {setupMeta.restrictedRpcScopes.slice(0, 4).join(", ")}
                  {setupMeta.restrictedRpcScopes.length > 4 ? "..." : ""}
                </span>
                ), que o Discord bloqueia na web para apps sem aprovação GameSDK. Por isso, o botão{" "}
                <strong>Conectar Conta Discord</strong> usa os escopos oficiais válidos (<span className="font-mono text-emerald-300">identify guilds</span>) com seu{" "}
                <span className="font-mono text-white">client_id={setupMeta.clientId}</span>, enquanto a transmissão da tela roda automaticamente no servidor dos EUA (<span className="font-mono text-emerald-300">us-east5</span>).
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Link Fornecido do Seu Bot / OAuth2 Discord
                </label>
                <div className="flex gap-1.5">
                  <Input
                    value={customLinkInput}
                    onChange={(e) => setCustomLinkInput(e.target.value)}
                    placeholder="https://discord.com/oauth2/authorize?client_id=..."
                    className="h-9 bg-[#141926] border-white/[0.1] text-xs font-mono text-white"
                  />
                  <Button
                    type="button"
                    disabled={savingCustomLink}
                    onClick={handleSaveCustomLink}
                    className="h-9 bg-emerald-600 hover:bg-emerald-500 text-white text-xs shrink-0 cursor-pointer"
                  >
                    {savingCustomLink ? "Salvando..." : "Salvar Link"}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Redirect URI OAuth2 Principal (Discord Developer Portal)
                  </label>
                  <div className="flex gap-1.5">
                    <Input
                      readOnly
                      value={
                        setupMeta?.redirectUri ||
                        `${typeof window !== "undefined" ? window.location.origin : ""}/api/auth/discord/callback`
                      }
                      className="h-9 bg-[#0b0e16] border-white/[0.08] text-xs font-mono text-slate-300"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        handleCopyText(
                          setupMeta?.redirectUri ||
                            `${window.location.origin}/api/auth/discord/callback`,
                          "Redirect URI Principal"
                        )
                      }
                      className="h-9 border-white/[0.1] bg-[#141926] text-xs shrink-0 cursor-pointer"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {setupMeta?.altRedirectUri && (
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                      Redirect URI Alternativo (/auth/callback)
                    </label>
                    <div className="flex gap-1.5">
                      <Input
                        readOnly
                        value={setupMeta.altRedirectUri}
                        className="h-8 bg-[#0b0e16] border-white/[0.08] text-[11px] font-mono text-slate-400"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          handleCopyText(setupMeta.altRedirectUri || "", "Redirect URI /auth/callback")
                        }
                        className="h-8 border-white/[0.1] bg-[#141926] text-xs shrink-0 cursor-pointer"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={connectingOAuth}
                        onClick={() => handleConnectDiscord({ useShortCallback: true })}
                        className="h-8 border-white/[0.1] bg-[#141926] hover:bg-[#1c2335] text-[11px] text-white shrink-0 cursor-pointer"
                      >
                        Usar este
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {setupMeta?.botInviteUrl && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#0b0e16] border border-white/[0.06] px-3 py-2 text-[11px]">
                <span className="text-slate-300">
                  Link de Convite do Bot (Client ID:{" "}
                  <strong className="font-mono text-white">{setupMeta.clientId}</strong>):
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyText(setupMeta.botInviteUrl || "", "Link de convite")}
                    className="text-slate-300 hover:text-white underline cursor-pointer"
                  >
                    Copiar convite
                  </button>
                  <a
                    href={setupMeta.botInviteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 font-semibold"
                  >
                    Abrir convite →
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live Match Banner if Active */}
      {game?.active && (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-xs font-bold text-emerald-300 flex flex-wrap items-center gap-2">
                {game.phase === "lobby" ? (
                  <>
                    <Users className="h-4 w-4" />
                    Aguardando na call normal: {game.voiceChannelName} ({game.readyPlayers.length} pronto(s))
                  </>
                ) : (
                  <>
                    <Scale className="h-4 w-4" />
                    Call Principal Privada: {game.tempVoiceChannelName || "Em criação..."}
                    {remainingRoundSecs !== null && (
                      <span className="font-mono text-white bg-black/30 px-2 py-0.5 rounded">
                        {remainingRoundSecs}s
                      </span>
                    )}
                  </>
                )}
              </div>
              {game.currentQuestion && (
                <p className="text-xs text-white">
                  Pergunta atual: <span className="font-semibold">&quot;{game.currentQuestion}&quot;</span>
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-300 pt-0.5">
                <span className="flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5 text-emerald-400" />
                  Servidor EUA ({serverScreen?.region || "us-east5"})
                </span>
                <span className="flex items-center gap-1">
                  <Monitor className="h-3.5 w-3.5 text-pink-400" />
                  Frame do navegador:{" "}
                  {serverScreen?.active
                    ? `Transmitindo (${serverScreen.framesSent || 0} frames)`
                    : "Iniciando navegador no servidor..."}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <a
                href={`https://discord.com/channels/${game.guildId}/${
                  game.tempVoiceChannelId || game.voiceChannelId
                }`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md border border-white/[0.15] bg-[#141926] hover:bg-[#1e2639] text-white text-xs font-semibold h-9 px-3"
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Entrar na Call no Discord
              </a>

              {game.phase === "lobby" && (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={handleBeginMatchNow}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold h-9 px-4 cursor-pointer"
                >
                  <Crown className="h-3.5 w-3.5 mr-1.5" />
                  Começar Tudo Agora (Mover para Call Principal)
                </Button>
              )}
            </div>
          </div>

          {/* Embedded 16:9 Live Browser Frame Preview */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0a0c12] p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-white font-semibold">
                <Tv className="h-4 w-4 text-red-500" />
                <span>
                  Tela ao Vivo no Navegador do Servidor (EUA us-east5 — continua mesmo saindo do app)
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-400">
                <span>WebSocket: {wsConnected ? "Sincronizado" : "Reconectando"}</span>
                <a
                  href="/?stage=broadcast"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-red-400 hover:text-red-300 font-semibold flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" /> Abrir Palco 16:9
                </a>
              </div>
            </div>

            <div className="w-full max-w-4xl mx-auto">
              <BroadcastStage state={broadcastState} />
            </div>
          </div>
        </div>
      )}

      {/* Flow Summary */}
      <div className="grid sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/[0.08] bg-[#0f131d] p-3.5 space-y-1">
          <div className="text-xs font-semibold text-white flex items-center gap-1.5">
            <Crown className="h-3.5 w-3.5 text-amber-400" /> 1. Call Normal &amp; Dono
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Bot entra na call normal, fala boas-vindas em 3s e cria botão exclusivo pro dono (ID {ownerUserId.slice(0, 6)}...) iniciar tudo.
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#0f131d] p-3.5 space-y-1">
          <div className="text-xs font-semibold text-white flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-pink-400" /> 2. Call &amp; Chats Privados
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Move todos e o bot para a call privada temporária e cria 1 canal privado individual por jogador.
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#0f131d] p-3.5 space-y-1">
          <div className="text-xs font-semibold text-white flex items-center gap-1.5">
            <Volume2 className="h-3.5 w-3.5 text-cyan-400" /> 3. Resposta &amp; Limpeza
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Ao responder no canal privado, o bot diz OK, guarda a resposta e apaga todas as mensagens do canal.
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#0f131d] p-3.5 space-y-1">
          <div className="text-xs font-semibold text-white flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" /> 4. IA Lê &amp; Julga
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Lê todas as respostas em voz alta, analisa quem chegou mais perto com IA, explica o porquê, soma pontos e sai sozinho.
          </p>
        </div>
      </div>

      {/* Config & Start Form */}
      <form
        onSubmit={handleStartLobby}
        className="rounded-xl border border-white/[0.08] bg-[#0f131d] p-4 space-y-4"
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Call Normal (Espera)
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

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              ID do Dono (Botão Começar Tudo)
            </label>
            <Input
              value={ownerUserId}
              onChange={(e) => setOwnerUserId(e.target.value)}
              placeholder="1554257592015003674"
              className="h-10 bg-[#141926] border-white/[0.1] text-xs font-mono text-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Voz do Bot no Jogo
            </label>
            <select
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="h-10 w-full rounded-lg border border-white/[0.1] bg-[#141926] px-3 text-xs text-white focus:outline-none focus:border-pink-500"
            >
              <optgroup label="👑 Exclusivas de Quem Começa — Engraçadas (PT-BR)">
                <option value="tiktok_funny_male">🤡 Zé Maluco / Esquilo (PT-BR Masculina Engraçada)</option>
                <option value="tiktok_funny_male_grumpy">🐸 Pato / Voz Engrossada (PT-BR Masculina Engraçada)</option>
                <option value="tiktok_funny_female">🤪 Paty Esquilo / Maluca (PT-BR Feminina Engraçada)</option>
                <option value="tiktok_funny_female_drama">🎭 Tia Dramática / Doida (PT-BR Feminina Engraçada)</option>
              </optgroup>
              <optgroup label="Vozes Portuguesas Masculinas (TikTok PT-BR)">
                <option value="narrator">🎙️ Lucas / Narrador (PT-BR Masculino)</option>
                <option value="tiktok_contra">🧔 Contra / Luiz (PT-BR Masculino)</option>
                <option value="tiktok_bueno">⚽ Galvão Bueno (PT-BR Masculino)</option>
                <option value="tiktok_bv_male">🎧 Bruno (PT-BR Masculino)</option>
              </optgroup>
              <optgroup label="Vozes Portuguesas Femininas (TikTok PT-BR)">
                <option value="tiktok_laizza">👩 Laizza (PT-BR Feminino)</option>
                <option value="lhays_anime">🎀 Lhays Macedo (PT-BR Feminino)</option>
                <option value="tiktok_ivete">🎤 Ivete Sangalo (PT-BR Feminino)</option>
                <option value="tiktok_ludmilla">🎶 Ludmilla (PT-BR Feminino)</option>
                <option value="garota_timida">🌸 Júlia / Tímida (PT-BR Feminino)</option>
                <option value="tiktok_br_f1">✨ Camila (PT-BR Feminino)</option>
                <option value="tiktok_br_f3">💎 Ana (PT-BR Feminino)</option>
              </optgroup>
              <option value="anytospeech_mcp">⚡ AnyToSpeech MCP</option>
              {clonedVoices.map((cv) => (
                <option key={cv.id} value={cv.id}>
                  Voz Clonada: {cv.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Tempo (seg) / Sorteio / Expressão
            </label>
            <div className="flex gap-1.5">
              <Input
                type="number"
                min={15}
                max={180}
                title="Segundos por rodada"
                value={roundSeconds}
                onChange={(e) => setRoundSeconds(Number(e.target.value) || 60)}
                className="h-10 w-16 bg-[#141926] border-white/[0.1] text-xs text-white px-2"
              />
              <Input
                type="number"
                min={1}
                max={20}
                title="Perguntas sorteadas por jogo"
                value={questionsPerMatch}
                onChange={(e) => setQuestionsPerMatch(Math.max(1, Number(e.target.value) || 4))}
                className="h-10 w-14 bg-[#141926] border-white/[0.1] text-xs text-white px-2"
              />
              <select
                value={selectedExpression}
                onChange={(e) => setSelectedExpression(e.target.value)}
                className="h-10 flex-1 rounded-lg border border-white/[0.1] bg-[#141926] px-2 text-xs text-white focus:outline-none focus:border-pink-500"
              >
                <option value="shy">Tímida</option>
                <option value="cute">Fofa</option>
                <option value="happy">Alegre</option>
                <option value="whisper">Sussurro</option>
                <option value="angry">Irritada</option>
                <option value="neutral">Neutra</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Banco de Perguntas ({questionsText.split("\n").filter((q) => q.trim()).length} perguntas — sorteia {questionsPerMatch} aleatórias por jogo)
            </label>
            <Textarea
              value={questionsText}
              onChange={(e) => setQuestionsText(e.target.value)}
              placeholder="Escreva uma pergunta por linha..."
              className="bg-[#141926] border-white/[0.1] text-xs min-h-[120px] text-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Regras exibidas no canal do jogo &amp; Canal Principal (SMS)
            </label>
            <div className="space-y-2">
              <select
                value={smsChannelId}
                onChange={(e) => setSmsChannelId(e.target.value)}
                className="h-9 w-full rounded-lg border border-white/[0.1] bg-[#141926] px-3 text-xs text-white focus:outline-none focus:border-pink-500"
              >
                <option value="">Canal SMS (Auto-detectar canal principal SMS)</option>
                {textChannels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
              <Textarea
                value={rulesText}
                onChange={(e) => setRulesText(e.target.value)}
                placeholder="Escreva as regras do Jogo da Call..."
                className="bg-[#141926] border-white/[0.1] text-xs min-h-[76px] text-white"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300">
            <label className="flex items-center gap-2 cursor-pointer text-emerald-300 font-medium">
              <input
                type="checkbox"
                checked={autoScreenBroadcast}
                onChange={(e) => setAutoScreenBroadcast(e.target.checked)}
                className="accent-emerald-500"
              />
              Iniciar tela no frame EUA (us-east5) automaticamente (continua se sair do app)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteChannelOnStop}
                onChange={(e) => setDeleteChannelOnStop(e.target.checked)}
                className="accent-pink-500"
              />
              Apagar canal central ao encerrar manualmente
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={disconnectCallOnStop}
                onChange={(e) => setDisconnectCallOnStop(e.target.checked)}
                className="accent-pink-500"
              />
              Sair da call ao encerrar manualmente
            </label>
          </div>

          <div className="flex items-center gap-2">
            {game?.active && (
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={handleStopGame}
                className="h-9 text-xs font-semibold cursor-pointer"
              >
                <StopCircle className="h-3.5 w-3.5 mr-1.5" /> Encerrar Tudo
              </Button>
            )}

            <Button
              type="submit"
              disabled={busy || !voiceChannelId}
              className="h-9 bg-pink-600 hover:bg-pink-500 text-white text-xs font-semibold px-4 cursor-pointer"
            >
              <Play className="h-3.5 w-3.5 mr-1.5" />
              {busy
                ? "Iniciando..."
                : game?.active
                ? "Reiniciar Lobby na Call"
                : "Abrir Lobby na Call Normal"}
            </Button>
          </div>
        </div>
      </form>

      {/* Live Ranking & Ready Players & Event Log */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/[0.08] bg-[#0f131d] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-amber-400" />
              {sortedMatchRanking.length > 0
                ? `Placar da Partida (${sortedMatchRanking.length})`
                : `Jogadores Prontos no Lobby (${game?.readyPlayers?.length || 0})`}
            </h3>
            <button
              type="button"
              onClick={fetchGameStatus}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" /> Atualizar
            </button>
          </div>

          {sortedMatchRanking.length > 0 ? (
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {sortedMatchRanking.map((p, idx) => (
                <div
                  key={p.userId}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#141926] border border-white/[0.06] text-xs"
                >
                  <span className="flex items-center gap-2 text-white font-medium">
                    <span className="font-mono text-amber-400">{idx + 1}º</span>
                    {p.username}
                  </span>
                  <span className="font-mono font-semibold text-emerald-400 tabular-nums">
                    {p.totalPoints} pts
                  </span>
                </div>
              ))}
            </div>
          ) : !game?.readyPlayers?.length ? (
            <div className="p-4 rounded-lg bg-[#090b11] border border-white/[0.06] text-xs text-slate-500 text-center">
              Ninguém clicou em Estou Pronto ainda.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {game.readyPlayers.map((p, idx) => (
                <div
                  key={p.userId}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#141926] border border-white/[0.06] text-xs"
                >
                  <span className="flex items-center gap-2 text-white font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    {idx + 1}. {p.username}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                    {new Date(p.readyAt).toLocaleTimeString("pt-BR")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#0f131d] p-4 space-y-3">
          <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
            <Volume2 className="h-4 w-4 text-pink-400" />
            Log de Eventos &amp; Fila de Áudio
          </h3>

          {!game?.events?.length ? (
            <div className="p-4 rounded-lg bg-[#090b11] border border-white/[0.06] text-xs text-slate-500 text-center">
              Abra o lobby do Jogo da Call para acompanhar as etapas.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {game.events.map((ev) => (
                <div
                  key={ev.id}
                  className="px-3 py-2 rounded-lg bg-[#141926] border border-white/[0.06] text-xs flex items-start justify-between gap-2"
                >
                  <span className="text-slate-200">{ev.text}</span>
                  <span className="font-mono text-[10px] text-slate-500 shrink-0 tabular-nums">
                    {new Date(ev.time).toLocaleTimeString("pt-BR")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Round-by-Round AI Verdicts */}
      {game?.roundResults && game.roundResults.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-[#0f131d] p-4 space-y-3">
          <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
            <Scale className="h-4 w-4 text-emerald-400" />
            Julgamento da IA por Rodada
          </h3>
          <div className="space-y-3">
            {game.roundResults.map((rr) => (
              <div
                key={rr.roundIndex}
                className="rounded-lg bg-[#141926] border border-white/[0.06] p-3 space-y-2"
              >
                <div className="text-xs font-semibold text-white">
                  Pergunta {rr.roundIndex + 1}: {rr.question}
                </div>
                {rr.winnerUsername && (
                  <div className="text-xs text-emerald-300">
                    🏆 <strong>Mais perto:</strong> {rr.winnerUsername} — &quot;{rr.winnerAnswer}&quot;
                    <div className="text-[11px] text-slate-300 mt-0.5">
                      Por quê: {rr.explanation}
                    </div>
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-1.5 pt-1">
                  {rr.answers.map((ans) => (
                    <div
                      key={ans.userId}
                      className="text-[11px] text-slate-300 bg-[#0b0e16] px-2.5 py-1.5 rounded border border-white/[0.05] flex justify-between gap-2"
                    >
                      <span className="truncate">
                        <strong>{ans.username}:</strong> {ans.answer}
                      </span>
                      <span className="font-mono text-amber-400 shrink-0">{ans.points} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
