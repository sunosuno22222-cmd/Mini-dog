import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  ArrowLeft,
  Check,
  Cloud,
  Image as ImageIcon,
  Menu,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  AlertCircle,
} from 'lucide-react';
import { WelcomeBannerPreview } from './WelcomeBannerPreview';
import { ExpHistoryView } from './ExpHistoryView';
import { apiFetch } from '../lib/api';
import {
  compressImageToCloudDataUrl,
  fetchAuthorizedImageAsCloudDataUrl,
  loadGuildSnapshotFromCloud,
  loadLocalGuildSnapshot,
  restoreSnapshotToBackend,
  saveGuildSnapshotToCloud,
  saveLocalGuildSnapshot,
  type PersistedGuildSnapshot,
} from '../lib/cloudPersistence';
import type {
  BannerEventType,
  DiscordUser,
  ExpRecordView,
  GuildItem,
  GuildTextChannel,
  GuildWelcomeConfigResponse,
} from '../types';

interface ServerPanelProps {
  guild: GuildItem;
  user: DiscordUser | null;
  firebaseUser: FirebaseUser | null;
  botError: string | null;
  expRecords?: ExpRecordView[];
  nextExpCode?: string;
  expLoading?: boolean;
  tiktokConnected?: boolean;
  tiktokAccounts?: import('../types').TikTokAccountInfo[];
  onRefreshExp?: () => void;
  onOpenDrawer?: () => void;
  onOpenTikTokSettings?: () => void;
  onReconnectBot: () => Promise<void>;
  onLinkCloudBackup: () => Promise<void>;
  onBack: () => void;
}

interface EditableRuleState {
  enabled: boolean;
  channelId: string;
  title: string;
  message: string;
  savedImageUrl: string | null;
  pendingImageDataUrl: string | null;
  removeImage: boolean;
}

function getGuildInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function normalizeChannelLabel(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function looksLikeWelcomeChannel(name: string): boolean {
  const norm = normalizeChannelLabel(name);
  return (
    norm.includes('entrada') ||
    norm.includes('boas-vindas') ||
    norm.includes('boas vindas') ||
    norm.includes('bem-vindo') ||
    norm.includes('welcome')
  );
}

function looksLikeLeaveChannel(name: string): boolean {
  const norm = normalizeChannelLabel(name);
  return (
    norm.includes('saida') ||
    norm.includes('despedida') ||
    norm.includes('tchau') ||
    norm.includes('leave') ||
    norm.includes('bye')
  );
}

function createInitialRuleState(eventType: BannerEventType): EditableRuleState {
  return {
    enabled: false,
    channelId: '',
    title: eventType === 'welcome' ? 'BEM-VINDO' : 'ATÉ LOGO',
    message:
      eventType === 'welcome'
        ? 'Seja bem-vindo(a) ao servidor {server}!'
        : '{user} saiu do servidor.',
    savedImageUrl: null,
    pendingImageDataUrl: null,
    removeImage: false,
  };
}

export function ServerPanel({
  guild,
  user,
  firebaseUser,
  botError,
  expRecords = [],
  nextExpCode = 'Exp 001',
  expLoading = false,
  tiktokConnected = false,
  tiktokAccounts = [],
  onRefreshExp,
  onOpenDrawer,
  onOpenTikTokSettings,
  onReconnectBot,
  onLinkCloudBackup,
  onBack,
}: ServerPanelProps) {
  const [activeTab, setActiveTab] = useState<'welcome' | 'leave' | 'exp'>('welcome');
  const activeEvent: BannerEventType = activeTab === 'leave' ? 'leave' : 'welcome';
  const [channels, setChannels] = useState<GuildTextChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [reconnectingBot, setReconnectingBot] = useState(false);

  const [welcomeRule, setWelcomeRule] = useState<EditableRuleState>(() =>
    createInitialRuleState('welcome'),
  );
  const [leaveRule, setLeaveRule] = useState<EditableRuleState>(() =>
    createInitialRuleState('leave'),
  );

  const [configLoading, setConfigLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  const [previewMemberName, setPreviewMemberName] = useState(
    user?.globalName ?? user?.username ?? 'João Silva',
  );
  const [resolvedImages, setResolvedImages] = useState<{
    welcome: string | null;
    leave: string | null;
  }>({ welcome: null, leave: null });

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadChannels = useCallback(async () => {
    setChannelsLoading(true);
    try {
      const resp = await apiFetch(`/api/guilds/${guild.id}/channels`);
      if (resp.ok) {
        const data = (await resp.json()) as { channels: GuildTextChannel[] };
        setChannels(data.channels);
      }
    } catch {
      // Handled silently; user can retry via refresh button
    } finally {
      setChannelsLoading(false);
    }
  }, [guild.id]);

  const fetchSavedImageBlob = useCallback(async (url: string): Promise<string | null> => {
    try {
      const resp = await apiFetch(url);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }, []);

  const applyServerConfig = useCallback((data: GuildWelcomeConfigResponse) => {
    setWelcomeRule((prev) => ({
      enabled: data.welcome.enabled,
      channelId: data.welcome.channelId ?? '',
      title: data.welcome.title,
      message: data.welcome.message,
      savedImageUrl: data.welcome.imageUrl,
      // Keep data URL visible until saved blob resolves if one was just uploaded
      pendingImageDataUrl:
        data.welcome.imageUrl && prev.pendingImageDataUrl ? prev.pendingImageDataUrl : null,
      removeImage: false,
    }));
    setLeaveRule((prev) => ({
      enabled: data.leave.enabled,
      channelId: data.leave.channelId ?? '',
      title: data.leave.title,
      message: data.leave.message,
      savedImageUrl: data.leave.imageUrl,
      pendingImageDataUrl:
        data.leave.imageUrl && prev.pendingImageDataUrl ? prev.pendingImageDataUrl : null,
      removeImage: false,
    }));
  }, []);

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const resp = await apiFetch(`/api/guilds/${guild.id}/welcome-config`);
      if (resp.ok) {
        const data = (await resp.json()) as GuildWelcomeConfigResponse;

        if (data.hasSavedConfig === false) {
          let snapshot: PersistedGuildSnapshot | null = null;
          if (firebaseUser) {
            snapshot = await loadGuildSnapshotFromCloud(firebaseUser, guild.id).catch(() => null);
          }
          if (!snapshot) {
            snapshot = loadLocalGuildSnapshot(guild.id, user?.id);
          }

          if (
            snapshot &&
            (snapshot.welcome.enabled ||
              snapshot.leave.enabled ||
              snapshot.welcome.channelId ||
              snapshot.welcome.imageDataUrl)
          ) {
            const restored = await restoreSnapshotToBackend(guild.id, snapshot);
            if (restored) {
              applyServerConfig(restored);
              setFeedback({
                type: 'success',
                text: 'Configurações restauradas automaticamente da nuvem.',
              });
              return;
            }
          }
        }

        applyServerConfig(data);
        if (data.restoredFromAccount) {
          setFeedback({
            type: 'success',
            text: 'Configurações restauradas automaticamente da sua conta Discord.',
          });
        }
      }
    } catch {
      setFeedback({ type: 'error', text: 'Não foi possível carregar as configurações deste servidor.' });
    } finally {
      setConfigLoading(false);
    }
  }, [applyServerConfig, firebaseUser, guild.id, user?.id]);

  useEffect(() => {
    void loadChannels();
    void loadConfig();
  }, [loadChannels, loadConfig]);

  const currentRule = activeEvent === 'welcome' ? welcomeRule : leaveRule;
  const setCurrentRule = (updater: (prev: EditableRuleState) => EditableRuleState) => {
    setFeedback(null);
    if (activeEvent === 'welcome') {
      setWelcomeRule(updater);
    } else {
      setLeaveRule(updater);
    }
  };

  useEffect(() => {
    let active = true;
    const remoteUrl = welcomeRule.savedImageUrl;

    if (!remoteUrl || welcomeRule.removeImage) {
      setResolvedImages((prev) => {
        if (prev.welcome) URL.revokeObjectURL(prev.welcome);
        return { ...prev, welcome: null };
      });
      return;
    }

    void (async () => {
      const blobUrl = await fetchSavedImageBlob(remoteUrl);
      if (!active) {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        return;
      }
      if (blobUrl) {
        setResolvedImages((prev) => {
          if (prev.welcome) URL.revokeObjectURL(prev.welcome);
          return { ...prev, welcome: blobUrl };
        });
        setWelcomeRule((prev) =>
          prev.savedImageUrl === remoteUrl ? { ...prev, pendingImageDataUrl: null } : prev,
        );
      }
    })();

    return () => {
      active = false;
    };
  }, [fetchSavedImageBlob, welcomeRule.savedImageUrl, welcomeRule.removeImage]);

  useEffect(() => {
    let active = true;
    const remoteUrl = leaveRule.savedImageUrl;

    if (!remoteUrl || leaveRule.removeImage) {
      setResolvedImages((prev) => {
        if (prev.leave) URL.revokeObjectURL(prev.leave);
        return { ...prev, leave: null };
      });
      return;
    }

    void (async () => {
      const blobUrl = await fetchSavedImageBlob(remoteUrl);
      if (!active) {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        return;
      }
      if (blobUrl) {
        setResolvedImages((prev) => {
          if (prev.leave) URL.revokeObjectURL(prev.leave);
          return { ...prev, leave: blobUrl };
        });
        setLeaveRule((prev) =>
          prev.savedImageUrl === remoteUrl ? { ...prev, pendingImageDataUrl: null } : prev,
        );
      }
    })();

    return () => {
      active = false;
    };
  }, [fetchSavedImageBlob, leaveRule.savedImageUrl, leaveRule.removeImage]);

  const activeBackgroundUrl = currentRule.pendingImageDataUrl
    ? currentRule.pendingImageDataUrl
    : currentRule.removeImage
      ? null
      : activeEvent === 'welcome'
        ? resolvedImages.welcome
        : resolvedImages.leave;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setFeedback({
        type: 'error',
        text: 'Formato não suportado. Selecione uma imagem PNG, JPG ou WEBP.',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setFeedback({
        type: 'error',
        text: 'A imagem selecionada excede o limite de 5 MB.',
      });
      return;
    }

    const targetEvent = activeEvent;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const dataUrl = reader.result;
        setFeedback(null);
        if (targetEvent === 'welcome') {
          setWelcomeRule((prev) => ({
            ...prev,
            pendingImageDataUrl: dataUrl,
            removeImage: false,
          }));
        } else {
          setLeaveRule((prev) => ({
            ...prev,
            pendingImageDataUrl: dataUrl,
            removeImage: false,
          }));
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const saveRulesToServer = useCallback(
    async (
      nextWelcome: EditableRuleState,
      nextLeave: EditableRuleState,
      successMessage = 'Configurações salvas permanentemente.',
    ): Promise<boolean> => {
      setSaving(true);
      setFeedback(null);
      try {
        const getChannelName = (id: string) =>
          channels.find((ch) => ch.id === id)?.name ?? '';

        const buildPayload = (rule: EditableRuleState) => ({
          enabled: rule.enabled,
          channelId: rule.channelId ? rule.channelId : null,
          channelName: rule.channelId ? getChannelName(rule.channelId) : '',
          title: rule.title,
          message: rule.message,
          ...(rule.pendingImageDataUrl ? { imageDataUrl: rule.pendingImageDataUrl } : {}),
          ...(rule.removeImage ? { removeImage: true } : {}),
        });

        const resp = await apiFetch(`/api/guilds/${guild.id}/welcome-config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            welcome: buildPayload(nextWelcome),
            leave: buildPayload(nextLeave),
          }),
        });

        if (!resp.ok) {
          const body = (await resp.json().catch(() => ({}))) as { error?: string };
          setFeedback({
            type: 'error',
            text: body.error || 'Erro ao salvar alterações.',
          });
          return false;
        }

        const updated = (await resp.json()) as GuildWelcomeConfigResponse;
        applyServerConfig(updated);

        // Mirror compressed snapshot locally and in Firestore cloud backup
        const resolveCloudImage = async (
          rule: EditableRuleState,
          existingBlobUrl: string | null,
          remoteUrl: string | null,
        ): Promise<string | null> => {
          if (rule.removeImage) return null;
          if (rule.pendingImageDataUrl) {
            return await compressImageToCloudDataUrl(rule.pendingImageDataUrl);
          }
          if (existingBlobUrl) {
            return await compressImageToCloudDataUrl(existingBlobUrl);
          }
          if (remoteUrl) {
            return await fetchAuthorizedImageAsCloudDataUrl(remoteUrl);
          }
          return null;
        };

        const [welcomeCloudImg, leaveCloudImg] = await Promise.all([
          resolveCloudImage(nextWelcome, resolvedImages.welcome, updated.welcome.imageUrl),
          resolveCloudImage(nextLeave, resolvedImages.leave, updated.leave.imageUrl),
        ]);

        const snapshot: PersistedGuildSnapshot = {
          guildId: guild.id,
          guildName: guild.name,
          discordUserId: user?.id ?? '',
          welcome: {
            enabled: updated.welcome.enabled,
            channelId: updated.welcome.channelId ?? '',
            channelName: updated.welcome.channelId ? getChannelName(updated.welcome.channelId) : '',
            title: updated.welcome.title,
            message: updated.welcome.message,
            hasImage: Boolean(welcomeCloudImg),
            imageDataUrl: welcomeCloudImg,
          },
          leave: {
            enabled: updated.leave.enabled,
            channelId: updated.leave.channelId ?? '',
            channelName: updated.leave.channelId ? getChannelName(updated.leave.channelId) : '',
            title: updated.leave.title,
            message: updated.leave.message,
            hasImage: Boolean(leaveCloudImg),
            imageDataUrl: leaveCloudImg,
          },
          updatedAtMs: Date.now(),
        };

        saveLocalGuildSnapshot(snapshot);
        if (firebaseUser) {
          await saveGuildSnapshotToCloud(firebaseUser, snapshot).catch((err) => {
            console.error('[CloudBackup] Falha ao salvar no Firestore:', err);
          });
        }

        setFeedback({
          type: 'success',
          text: firebaseUser
            ? `${successMessage} (Sincronizado com a nuvem)`
            : successMessage,
        });
        return true;
      } catch {
        setFeedback({ type: 'error', text: 'Falha de conexão ao salvar configurações.' });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [
      applyServerConfig,
      channels,
      firebaseUser,
      guild.id,
      guild.name,
      resolvedImages.leave,
      resolvedImages.welcome,
      user?.id,
    ],
  );

  const saveAllConfig = useCallback(async (): Promise<boolean> => {
    return saveRulesToServer(welcomeRule, leaveRule);
  }, [leaveRule, saveRulesToServer, welcomeRule]);

  const handleSwapChannelsAndSave = useCallback(async () => {
    const nextWelcome: EditableRuleState = {
      ...welcomeRule,
      channelId: leaveRule.channelId,
    };
    const nextLeave: EditableRuleState = {
      ...leaveRule,
      channelId: welcomeRule.channelId,
    };
    setWelcomeRule(nextWelcome);
    setLeaveRule(nextLeave);
    await saveRulesToServer(
      nextWelcome,
      nextLeave,
      'Canais de Entrada e Saída invertidos e salvos com sucesso.',
    );
  }, [leaveRule, saveRulesToServer, welcomeRule]);

  const handleTestInChannel = async () => {
    if (!currentRule.channelId) {
      setFeedback({
        type: 'error',
        text: 'Selecione um canal de envio na lista antes de testar.',
      });
      return;
    }

    setTesting(true);
    setFeedback(null);

    try {
      // Save pending image/text first so the Discord channel receives the exact latest setup
      const savedOk = await saveAllConfig();
      if (!savedOk) {
        setTesting(false);
        return;
      }

      const resp = await apiFetch(`/api/guilds/${guild.id}/welcome-config/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: activeEvent,
          channelId: currentRule.channelId,
          title: currentRule.title,
          message: currentRule.message,
          memberName: previewMemberName,
        }),
      });

      if (!resp.ok) {
        const body = (await resp.json().catch(() => ({}))) as { error?: string };
        setFeedback({
          type: 'error',
          text: body.error || 'Não foi possível enviar a demonstração no canal.',
        });
        return;
      }

      setFeedback({
        type: 'success',
        text: 'Imagem dinâmica enviada no canal selecionado para demonstração.',
      });
    } catch {
      setFeedback({ type: 'error', text: 'Erro ao testar envio no canal.' });
    } finally {
      setTesting(false);
    }
  };

  const insertToken = (token: string) => {
    setCurrentRule((prev) => ({
      ...prev,
      message: prev.message ? `${prev.message} ${token}` : token,
    }));
  };

  const welcomeChannel = channels.find((ch) => ch.id === welcomeRule.channelId) ?? null;
  const leaveChannel = channels.find((ch) => ch.id === leaveRule.channelId) ?? null;
  const channelsLookSwapped = Boolean(
    (welcomeChannel && looksLikeLeaveChannel(welcomeChannel.name)) ||
      (leaveChannel && looksLikeWelcomeChannel(leaveChannel.name)),
  );

  return (
    <div className="min-h-screen w-full bg-[#FAFAFA] flex flex-col">
      {/* Top Bar Contract */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-[1160px] mx-auto px-6 py-3.5 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            {onOpenDrawer && (
              <button
                type="button"
                onClick={onOpenDrawer}
                aria-label="Abrir menu lateral"
                className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 inline-flex items-center justify-center shrink-0 transition-colors"
              >
                <Menu className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onBack}
              className="min-h-[36px] px-2.5 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              <span>Voltar</span>
            </button>

            <span className="h-5 w-px bg-slate-200 shrink-0" aria-hidden="true" />

            <div className="flex items-center gap-2.5 min-w-0">
              {guild.iconUrl ? (
                <img
                  src={guild.iconUrl}
                  alt={guild.name}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-md object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-semibold text-slate-700 shrink-0">
                  {getGuildInitials(guild.name)}
                </div>
              )}
              <span className="text-sm font-semibold text-slate-900 truncate">{guild.name}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {firebaseUser ? (
              <div
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                title={`Firebase ativo: ${firebaseUser.email || firebaseUser.displayName || 'Google'}`}
              >
                <Cloud className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                <span className="hidden sm:inline max-w-[160px] truncate">
                  {firebaseUser.email || 'Firebase ativo'}
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void onLinkCloudBackup()}
                className="min-h-[38px] px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                title="Entrar com Google / Firebase para sincronizar configurações"
              >
                <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Entrar Firebase</span>
              </button>
            )}

            {activeTab !== 'exp' && (
              <button
                type="button"
                onClick={() => void saveAllConfig()}
                disabled={saving || configLoading}
                className="min-h-[38px] px-4 py-2 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] disabled:opacity-60 text-white text-xs sm:text-sm font-medium inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                <span>{saving ? 'Salvando...' : 'Salvar alterações'}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1160px] mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
              {activeTab === 'exp'
                ? 'Sistema de Exposição (EXP)'
                : 'Mensagens de entrada e saída com imagem'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {activeTab === 'exp'
                ? 'Gerencie as ocorrências enviadas pelo canal #exp, teste prévias e acompanhe o envio ao TikTok.'
                : 'Escolha o canal, escreva a mensagem e selecione uma imagem de fundo para gerar o banner dinâmico com o nome do membro.'}
            </p>
          </div>

          {/* Interactive Event Switcher */}
          <div
            role="tablist"
            aria-label="Seção do servidor"
            className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg self-start shrink-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'welcome'}
              onClick={() => {
                setActiveTab('welcome');
                setFeedback(null);
              }}
              className={`px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'welcome'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Entrada (Boas-vindas)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'leave'}
              onClick={() => {
                setActiveTab('leave');
                setFeedback(null);
              }}
              className={`px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'leave'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Saída (Despedida)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'exp'}
              onClick={() => {
                setActiveTab('exp');
                setFeedback(null);
                onRefreshExp?.();
              }}
              className={`px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                activeTab === 'exp'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Exposições (EXP)
            </button>
          </div>
        </div>

        {botError && (
          <div
            role="alert"
            className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl px-4 py-3.5 text-sm border bg-amber-50 border-amber-200 text-amber-900"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" aria-hidden="true" />
              <div>
                <p className="font-medium">{botError}</p>
                <p className="text-xs text-amber-800 mt-0.5">
                  No Discord Developer Portal, abra sua aplicação → Bot → Privileged Gateway Intents → ative <strong>Server Members Intent</strong>, salve e clique em Reconectar bot.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={reconnectingBot}
              onClick={() => {
                setReconnectingBot(true);
                void onReconnectBot().finally(() => setReconnectingBot(false));
              }}
              className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-amber-900 hover:bg-amber-800 disabled:opacity-60 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-center transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${reconnectingBot ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>{reconnectingBot ? 'Reconectando...' : 'Reconectar bot'}</span>
            </button>
          </div>
        )}

        {feedback && (
          <div
            role={feedback.type === 'error' ? 'alert' : 'status'}
            className={`mt-6 flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm border ${
              feedback.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {feedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            ) : (
              <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
            )}
            <span>{feedback.text}</span>
          </div>
        )}

        {channelsLookSwapped && (
          <div
            role="alert"
            className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl px-4 py-3.5 text-sm border bg-amber-50 border-amber-200 text-amber-900"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" aria-hidden="true" />
              <div>
                <p className="font-medium">
                  Os canais de Entrada e Saída parecem estar invertidos.
                </p>
                <p className="text-xs text-amber-800 mt-0.5">
                  Entrada está apontando para{' '}
                  <strong>{welcomeChannel ? `#${welcomeChannel.name}` : 'nenhum canal'}</strong> e Saída
                  para <strong>{leaveChannel ? `#${leaveChannel.name}` : 'nenhum canal'}</strong>.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSwapChannelsAndSave()}
              className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-amber-900 hover:bg-amber-800 disabled:opacity-60 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-center transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span>{saving ? 'Invertendo...' : 'Inverter canais e salvar'}</span>
            </button>
          </div>
        )}

        {activeTab === 'exp' ? (
          <div className="mt-8">
            <ExpHistoryView
              embeddedInServerPanel
              fixedGuildId={guild.id}
              fixedGuildName={guild.name}
              records={expRecords}
              nextExpCode={nextExpCode}
              loading={expLoading}
              tiktokConnected={tiktokConnected}
              tiktokAccounts={tiktokAccounts}
              onRefresh={() => onRefreshExp?.()}
              onOpenTikTokSettings={onOpenTikTokSettings}
            />
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Configuration Form */}
          <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${
                  activeEvent === 'welcome'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-100 text-slate-800 border border-slate-200'
                }`}
              >
                {activeEvent === 'welcome'
                  ? 'Editando: Entrada (quando alguém entra)'
                  : 'Editando: Saída (quando alguém sai)'}
              </span>

              <span className="text-xs text-slate-500 truncate max-w-full">
                {activeEvent === 'welcome'
                  ? welcomeChannel
                    ? `Canal: #${welcomeChannel.name}`
                    : 'Canal não definido'
                  : leaveChannel
                    ? `Canal: #${leaveChannel.name}`
                    : 'Canal não definido'}
              </span>
            </div>

            <div key={activeEvent} className="space-y-6">
              {/* Enable switch */}
              <div className="flex items-center justify-between gap-4 pb-5 border-b border-slate-100">
                <div>
                  <label htmlFor="rule-enabled" className="text-sm font-semibold text-slate-900 block">
                    {activeEvent === 'welcome'
                      ? 'Ativar imagem quando alguém entrar'
                      : 'Ativar imagem quando alguém sair'}
                  </label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {activeEvent === 'welcome'
                      ? 'O bot enviará a imagem gerada automaticamente para novos membros.'
                      : 'O bot enviará a imagem gerada automaticamente quando um membro sair.'}
                  </p>
                </div>
                <input
                  id="rule-enabled"
                  type="checkbox"
                  checked={currentRule.enabled}
                  onChange={(e) =>
                    setCurrentRule((prev) => ({ ...prev, enabled: e.target.checked }))
                  }
                  className="w-5 h-5 rounded accent-[#5865F2] cursor-pointer shrink-0"
                />
              </div>

            {/* Channel selection */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <label htmlFor="channel-select" className="text-sm font-medium text-slate-900">
                  Canal de envio
                </label>
                <button
                  type="button"
                  onClick={() => void loadChannels()}
                  disabled={channelsLoading}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900 inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <RefreshCw className={`w-3 h-3 ${channelsLoading ? 'animate-spin' : ''}`} />
                  <span>Atualizar canais</span>
                </button>
              </div>

              <select
                id="channel-select"
                value={currentRule.channelId}
                onChange={(e) =>
                  setCurrentRule((prev) => ({ ...prev, channelId: e.target.value }))
                }
                disabled={channelsLoading}
                className="w-full h-11 px-3.5 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#5865F2]"
              >
                <option value="">
                  {channelsLoading
                    ? 'Carregando canais do servidor...'
                    : 'Selecione um canal de texto'}
                </option>
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.categoryName ? `${ch.categoryName} / #${ch.name}` : `#${ch.name}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Title input */}
            <div>
              <label htmlFor="banner-title" className="text-sm font-medium text-slate-900 block mb-2">
                Título acima do nome
              </label>
              <input
                id="banner-title"
                type="text"
                maxLength={40}
                value={currentRule.title}
                onChange={(e) =>
                  setCurrentRule((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder={activeEvent === 'welcome' ? 'BEM-VINDO' : 'ATÉ LOGO'}
                className="w-full h-11 px-3.5 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#5865F2]"
              />
            </div>

            {/* Message textarea */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <label htmlFor="banner-message" className="text-sm font-medium text-slate-900">
                  Mensagem na imagem
                </label>
                <span className="text-xs text-slate-400 tabular-nums">
                  {currentRule.message.length}/220
                </span>
              </div>
              <textarea
                id="banner-message"
                rows={3}
                maxLength={220}
                value={currentRule.message}
                onChange={(e) =>
                  setCurrentRule((prev) => ({ ...prev, message: e.target.value }))
                }
                placeholder={
                  activeEvent === 'welcome'
                    ? 'Ex.: Bem-vindo(a) {user}, leia as regras e divirta-se!'
                    : 'Ex.: {user} saiu do servidor.'
                }
                className="w-full p-3.5 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#5865F2] resize-none"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Variáveis disponíveis:</span>
                {['{user}', '{server}', '{membros}'].map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => insertToken(token)}
                    className="px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-mono text-[11px] transition-colors"
                  >
                    {token}
                  </button>
                ))}
              </div>
            </div>

            {/* Background image picker */}
            <div>
              <span className="text-sm font-medium text-slate-900 block mb-2">
                Imagem de fundo
              </span>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-800 inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Upload className="w-4 h-4 text-slate-600" aria-hidden="true" />
                  <span>{activeBackgroundUrl ? 'Trocar imagem' : 'Selecionar imagem'}</span>
                </button>

                {activeBackgroundUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentRule((prev) => ({
                        ...prev,
                        pendingImageDataUrl: null,
                        removeImage: true,
                      }))
                    }
                    className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 hover:text-red-700 text-sm font-medium text-slate-600 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                    <span>Remover imagem</span>
                  </button>
                )}
              </div>

              <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>
                  PNG, JPG ou WEBP (máx. 5 MB). Se nenhuma imagem for enviada, será usado o fundo padrão escuro.
                </span>
              </p>
            </div>
            </div>
          </section>

          {/* Right Column: Live Demonstration */}
          <section className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Demonstração ao vivo
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Veja exatamente como a imagem dinâmica aparecerá no Discord com o nome do membro sobre o fundo escolhido.
              </p>
            </div>

            <WelcomeBannerPreview
              title={currentRule.title}
              message={currentRule.message}
              memberName={previewMemberName}
              guildName={guild.name}
              avatarUrl={user?.avatarUrl ?? null}
              backgroundUrl={activeBackgroundUrl}
            />

            <div className="pt-2 space-y-4 border-t border-slate-100">
              <div>
                <label htmlFor="preview-name" className="text-xs font-medium text-slate-700 block mb-1.5">
                  Nome do membro para simular na demonstração
                </label>
                <input
                  id="preview-name"
                  type="text"
                  maxLength={32}
                  value={previewMemberName}
                  onChange={(e) => setPreviewMemberName(e.target.value)}
                  placeholder="Digite um nome para testar..."
                  className="w-full h-10 px-3 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-[#5865F2]"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  Dimensão final enviada pelo bot: <span className="font-mono">960×480 px</span>
                </p>

                <button
                  type="button"
                  onClick={() => void handleTestInChannel()}
                  disabled={testing || saving}
                  className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-slate-800 inline-flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Send className="w-4 h-4 text-[#5865F2]" aria-hidden="true" />
                  <span>{testing ? 'Enviando...' : 'Testar envio no canal'}</span>
                </button>
              </div>

              {feedback && (
                <div
                  role={feedback.type === 'error' ? 'alert' : 'status'}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs border ${
                    feedback.type === 'error'
                      ? 'bg-red-50 border-red-200 text-red-700'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  }`}
                >
                  {feedback.type === 'error' ? (
                    <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
                  )}
                  <span>{feedback.text}</span>
                </div>
              )}
            </div>
          </section>
        </div>
        )}
      </main>
    </div>
  );
}
