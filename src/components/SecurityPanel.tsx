import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  Check,
  ExternalLink,
  Flame,
  Lock,
  Play,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Unlock,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { GuildTextChannel } from '../types';

export interface ModerationConfigState {
  antiSpamEnabled: boolean;
  newMemberMaxDays: number;
  timeoutDurationMinutes: number;
  banOnRepeatOffense: boolean;
  antiRogueBotEnabled: boolean;
  antiMassPingEnabled: boolean;
  antiInviteLinksEnabled: boolean;
  antiRaidShieldEnabled: boolean;
  antiNukeEnabled: boolean;
  antiRoleNukeEnabled: boolean;
  antiWebhookFloodEnabled: boolean;
}

export interface SecurityLogEntry {
  id: string;
  timestamp: number;
  guildId: string;
  action: 'TIMEOUT' | 'BAN' | 'KICK' | 'BOT_BAN' | 'WARN' | 'ANTI_NUKE' | 'ANTI_RAID' | 'LOCKDOWN';
  targetTag: string;
  targetId: string;
  reason: string;
  details: string;
}

export interface TestBotStatusInfo {
  configured: boolean;
  online: boolean;
  id: string | null;
  applicationId: string | null;
  username: string | null;
  avatar: string | null;
  inviteUrl: string | null;
  guildsCount: number;
  guildIds: string[];
  lastError: string | null;
}

interface SecurityPanelProps {
  guildId: string;
  guildName: string;
  channels: GuildTextChannel[];
}

const DEFAULT_MODERATION_CONFIG: ModerationConfigState = {
  antiSpamEnabled: true,
  newMemberMaxDays: 2,
  timeoutDurationMinutes: 10,
  banOnRepeatOffense: true,
  antiRogueBotEnabled: true,
  antiMassPingEnabled: true,
  antiInviteLinksEnabled: true,
  antiRaidShieldEnabled: true,
  antiNukeEnabled: true,
  antiRoleNukeEnabled: true,
  antiWebhookFloodEnabled: true,
};

const TOGGLE_ITEMS: Array<{
  key: keyof Omit<ModerationConfigState, 'newMemberMaxDays' | 'timeoutDurationMinutes'>;
  title: string;
  description: string;
}> = [
  {
    key: 'antiSpamEnabled',
    title: 'Anti-Spam Automático (10x + Quarentena #spam-não)',
    description:
      'Detecta 10 mensagens repetidas, isola o usuário no canal #spam-não durante o castigo e apaga o spam em seguida.',
  },
  {
    key: 'banOnRepeatOffense',
    title: 'Banimento Permanente por Reincidência',
    description: 'Bane automaticamente contas que voltarem a fazer spam após já terem tomado castigo.',
  },
  {
    key: 'antiRogueBotEnabled',
    title: 'Escudo Anti-Bot Invasor',
    description:
      'Bane instantaneamente bots adicionados por não-Administradores e aplica castigo de 1h em quem convidou.',
  },
  {
    key: 'antiMassPingEnabled',
    title: 'Anti-MassPing (@everyone / @here)',
    description: 'Apaga menções em massa não autorizadas e isola contas recentes automaticamente.',
  },
  {
    key: 'antiInviteLinksEnabled',
    title: 'Filtro Anti-Links de Convite (discord.gg)',
    description: 'Remove divulgação de convites externos e pune contas recentes que enviarem convites.',
  },
  {
    key: 'antiRaidShieldEnabled',
    title: 'Escudo Anti-Raid (Entradas em Massa)',
    description: 'Detecta 5+ entradas em menos de 10 segundos e coloca as contas suspeitas em quarentena.',
  },
  {
    key: 'antiNukeEnabled',
    title: 'Proteção Anti-Nuke de Canais',
    description: 'Bane executores não-Administradores que apagarem 2 ou mais canais em menos de 30 segundos.',
  },
  {
    key: 'antiRoleNukeEnabled',
    title: 'Proteção Anti-Role Nuke',
    description: 'Bane executores não-Administradores que deletarem múltiplos cargos rapidamente.',
  },
  {
    key: 'antiWebhookFloodEnabled',
    title: 'Proteção Anti-Webhook Flood',
    description: 'Bloqueia enxurradas automatizadas disparadas por webhooks maliciosos.',
  },
];

const ACTION_BADGES: Record<SecurityLogEntry['action'], string> = {
  TIMEOUT: 'bg-amber-50 text-amber-800 border-amber-200',
  BAN: 'bg-red-50 text-red-700 border-red-200',
  KICK: 'bg-pink-50 text-pink-700 border-pink-200',
  BOT_BAN: 'bg-purple-50 text-purple-700 border-purple-200',
  WARN: 'bg-blue-50 text-blue-700 border-blue-200',
  ANTI_NUKE: 'bg-orange-50 text-orange-800 border-orange-200',
  ANTI_RAID: 'bg-orange-50 text-orange-800 border-orange-200',
  LOCKDOWN: 'bg-red-100 text-red-800 border-red-300',
};

export function SecurityPanel({ guildId, guildName, channels }: SecurityPanelProps) {
  const [config, setConfig] = useState<ModerationConfigState>(DEFAULT_MODERATION_CONFIG);
  const [guildLogs, setGuildLogs] = useState<SecurityLogEntry[]>([]);
  const [allLogs, setAllLogs] = useState<SecurityLogEntry[]>([]);
  const [showAllGuildLogs, setShowAllGuildLogs] = useState(false);
  const [testBot, setTestBot] = useState<TestBotStatusInfo | null>(null);
  const [quarantineChannel, setQuarantineChannel] = useState<{
    exists: boolean;
    id: string | null;
    name: string | null;
  }>({ exists: false, id: null, name: null });

  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 2nd Test Bot inputs
  const [testBotInput, setTestBotInput] = useState('');
  const [selectedTestChannelId, setSelectedTestChannelId] = useState('');
  const [customSpamText, setCustomSpamText] = useState('');
  const [adminWarning, setAdminWarning] = useState(false);

  useEffect(() => {
    if (!selectedTestChannelId && channels.length > 0) {
      setSelectedTestChannelId(channels[0].id);
    }
  }, [channels, selectedTestChannelId]);

  const loadSecurityState = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await apiFetch(`/api/guilds/${guildId}/moderation`);
      if (resp.ok) {
        const data = (await resp.json()) as {
          config?: ModerationConfigState;
          logs?: SecurityLogEntry[];
          allLogs?: SecurityLogEntry[];
          testBot?: TestBotStatusInfo;
          quarantineChannel?: { exists: boolean; id: string | null; name: string | null };
        };
        if (data.config) setConfig(data.config);
        if (Array.isArray(data.logs)) setGuildLogs(data.logs);
        if (Array.isArray(data.allLogs)) setAllLogs(data.allLogs);
        if (data.testBot) setTestBot(data.testBot);
        if (data.quarantineChannel) setQuarantineChannel(data.quarantineChannel);
      }
    } catch {
      // Keep UI interactive
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    void loadSecurityState();
  }, [loadSecurityState]);

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setFeedback(null);
    try {
      const resp = await apiFetch(`/api/guilds/${guildId}/moderation`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const data = (await resp.json().catch(() => ({}))) as { error?: string; config?: ModerationConfigState };
      if (!resp.ok) {
        setFeedback({ type: 'error', text: data.error || 'Falha ao salvar regras de segurança.' });
        return;
      }
      if (data.config) setConfig(data.config);
      setFeedback({ type: 'success', text: 'Regras de Moderação Avançada salvas e ativas no servidor.' });
    } catch {
      setFeedback({ type: 'error', text: 'Erro de conexão ao salvar configurações de segurança.' });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleLockdown = async (lock: boolean) => {
    setBusyAction(lock ? 'lock_on' : 'lock_off');
    setFeedback(null);
    try {
      const resp = await apiFetch(`/api/guilds/${guildId}/moderation/lockdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lock }),
      });
      const data = (await resp.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!resp.ok) {
        setFeedback({ type: 'error', text: data.error || 'Erro ao executar lockdown.' });
        return;
      }
      setFeedback({ type: 'success', text: data.message || 'Status de lockdown atualizado.' });
      await loadSecurityState();
    } catch {
      setFeedback({ type: 'error', text: 'Falha de conexão ao alterar lockdown.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleEnsureQuarantineChannel = async () => {
    setBusyAction('quarantine');
    setFeedback(null);
    try {
      const resp = await apiFetch(`/api/guilds/${guildId}/moderation/quarantine-channel`, {
        method: 'POST',
      });
      const data = (await resp.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!resp.ok) {
        setFeedback({ type: 'error', text: data.error || 'Erro ao verificar canal #spam-não.' });
        return;
      }
      setFeedback({
        type: 'success',
        text: data.message || 'Canal #spam-não verificado e ativo.',
      });
      await loadSecurityState();
    } catch {
      setFeedback({ type: 'error', text: 'Erro de conexão ao criar canal #spam-não.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfigureTestBot = async () => {
    if (!testBotInput.trim()) {
      setFeedback({ type: 'error', text: 'Cole o Token ou Client ID do 2º Bot de Testes.' });
      return;
    }
    setBusyAction('test_cfg');
    setFeedback(null);
    try {
      const resp = await apiFetch(`/api/guilds/${guildId}/moderation/test-bot/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenOrId: testBotInput.trim() }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        testBot?: TestBotStatusInfo;
      };
      if (!resp.ok) {
        setFeedback({ type: 'error', text: data.error || 'Não foi possível salvar o 2º Bot.' });
        return;
      }
      if (data.testBot) setTestBot(data.testBot);
      setTestBotInput('');
      setFeedback({
        type: data.error ? 'error' : 'success',
        text: data.error ? `${data.message || 'Salvo.'} (${data.error})` : data.message || '2º Bot configurado!',
      });
    } catch {
      setFeedback({ type: 'error', text: 'Erro de conexão ao configurar 2º Bot.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleAuthorizeTestBot = async () => {
    setBusyAction('test_auth');
    setFeedback(null);
    try {
      const resp = await apiFetch(`/api/guilds/${guildId}/moderation/test-bot/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: testBotInput.trim() || testBot?.id || testBot?.applicationId || undefined,
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        testBot?: TestBotStatusInfo;
      };
      if (!resp.ok) {
        setFeedback({ type: 'error', text: data.error || 'Erro ao autorizar 2º Bot.' });
        return;
      }
      if (data.testBot) setTestBot(data.testBot);
      setFeedback({ type: 'success', text: data.message || '2º Bot liberado na lista branca!' });
      await loadSecurityState();
    } catch {
      setFeedback({ type: 'error', text: 'Erro ao autorizar 2º Bot.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleReconnectTestBot = async () => {
    setBusyAction('test_reconnect');
    setFeedback(null);
    try {
      const resp = await apiFetch(`/api/guilds/${guildId}/moderation/test-bot/reconnect`, {
        method: 'POST',
      });
      const data = (await resp.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
        testBot?: TestBotStatusInfo;
      };
      if (data.testBot) setTestBot(data.testBot);
      setFeedback({
        type: resp.ok && data.success ? 'success' : 'error',
        text: data.message || data.error || 'Status do 2º Bot atualizado.',
      });
    } catch {
      setFeedback({ type: 'error', text: 'Erro ao reconectar 2º Bot.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRunTest = async (testType: 'spam' | 'invite' | 'massping' | 'raid' | 'all') => {
    if (!selectedTestChannelId) {
      setFeedback({ type: 'error', text: 'Selecione um canal de texto para disparar o teste.' });
      return;
    }
    setBusyAction(`run_${testType}`);
    setFeedback(null);
    setAdminWarning(false);
    try {
      const resp = await apiFetch(`/api/guilds/${guildId}/moderation/test-bot/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: selectedTestChannelId,
          testType,
          customText: customSpamText.trim() || undefined,
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        hasAdminWarning?: boolean;
      };
      if (!resp.ok) {
        setFeedback({ type: 'error', text: data.error || 'Falha ao executar teste.' });
        return;
      }
      if (data.hasAdminWarning) setAdminWarning(true);
      setFeedback({ type: 'success', text: data.message || 'Teste de segurança disparado!' });
      setTimeout(() => {
        void loadSecurityState();
      }, 2200);
    } catch {
      setFeedback({ type: 'error', text: 'Erro de conexão ao disparar teste de segurança.' });
    } finally {
      setBusyAction(null);
    }
  };

  const visibleLogs = showAllGuildLogs ? allLogs : guildLogs;
  const testBotInThisGuild = Boolean(testBot?.guildIds?.includes(guildId));

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm border ${
            feedback.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          {feedback.type === 'error' ? (
            <AlertCircle className="w-4 h-4 shrink-0" />
          ) : (
            <Check className="w-4 h-4 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Top Quick Actions: Quarantine & Emergency Lockdown */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-semibold text-slate-900">
              Moderação Avançada &amp; Ações de Emergência
            </h2>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
                quarantineChannel.exists
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {quarantineChannel.exists
                ? `Canal #${quarantineChannel.name || 'spam-não'} ativo`
                : 'Canal #spam-não pendente'}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Proteção automática ativa no Gateway Discord para <strong>{guildName}</strong> — registra cada ocorrência no canal <span className="font-mono">#segurança-log</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void handleEnsureQuarantineChannel()}
            className="min-h-[38px] px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-medium text-slate-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5 text-[#5865F2]" />
            <span>{busyAction === 'quarantine' ? 'Verificando...' : 'Verificar #spam-não'}</span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void handleLockdown(true)}
            className="min-h-[38px] px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{busyAction === 'lock_on' ? 'Trancando...' : 'Ativar Lockdown'}</span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void handleLockdown(false)}
            className="min-h-[38px] px-3.5 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-xs font-medium text-slate-800 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Unlock className="w-3.5 h-3.5 text-emerald-600" />
            <span>{busyAction === 'lock_off' ? 'Liberando...' : 'Desativar Lockdown'}</span>
          </button>
        </div>
      </section>

      {/* Main 2-column Grid: Rules Config + 2nd Security Test Bot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Protection Modules */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Escudos &amp; Regras de Segurança
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Ative ou ajuste os limites de proteção automática contra spam, invasores e nukes.
              </p>
            </div>
            <button
              type="button"
              disabled={savingConfig || loading}
              onClick={() => void handleSaveConfig()}
              className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{savingConfig ? 'Salvando...' : 'Salvar Regras'}</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {TOGGLE_ITEMS.map((item) => (
              <label
                key={item.key}
                className="py-3 flex items-start justify-between gap-4 cursor-pointer"
              >
                <div>
                  <div className="text-sm font-medium text-slate-900">{item.title}</div>
                  <p className="text-xs text-slate-500 mt-0.5">{item.description}</p>
                </div>
                <input
                  type="checkbox"
                  checked={config[item.key]}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, [item.key]: e.target.checked }))
                  }
                  className="mt-0.5 w-5 h-5 rounded accent-[#5865F2] cursor-pointer shrink-0"
                />
              </label>
            ))}
          </div>

          <div className="grid sm:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
            <div>
              <label
                htmlFor="mod-new-member-days"
                className="text-xs font-medium text-slate-700 block mb-1.5"
              >
                Dias mínimos para conta não ser recente
              </label>
              <input
                id="mod-new-member-days"
                type="number"
                min={0}
                max={90}
                value={config.newMemberMaxDays}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    newMemberMaxDays: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
                className="w-full h-10 px-3 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#5865F2]"
              />
            </div>

            <div>
              <label
                htmlFor="mod-timeout-mins"
                className="text-xs font-medium text-slate-700 block mb-1.5"
              >
                Duração do castigo em #spam-não (minutos)
              </label>
              <input
                id="mod-timeout-mins"
                type="number"
                min={1}
                max={1440}
                value={config.timeoutDurationMinutes}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    timeoutDurationMinutes: Math.max(1, Number(e.target.value) || 10),
                  }))
                }
                className="w-full h-10 px-3 text-sm text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#5865F2]"
              />
            </div>
          </div>
        </section>

        {/* Right: 2nd Security Test Bot */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-start justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Bot className="w-4 h-4 text-[#5865F2]" />
                <span>2º Bot de Testes de Segurança</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Simula spam 10x, convite, massping e quarentena #spam-não ao vivo sem banir o bot de teste.
              </p>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-semibold border shrink-0 ${
                testBot?.online
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : testBot?.configured
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {testBot?.online ? 'Online' : testBot?.configured ? 'Offline' : 'Não config.'}
            </span>
          </div>

          {testBot && (testBot.username || testBot.id) && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 truncate">
                  {testBot.username || `Bot ID ${testBot.id}`}
                </div>
                <div className="text-[11px] font-mono text-slate-500 truncate">
                  ID: {testBot.id || testBot.applicationId} ·{' '}
                  {testBotInThisGuild ? 'Presente neste servidor' : 'Ainda não está neste servidor'}
                </div>
              </div>
              {testBot.inviteUrl && (
                <a
                  href={testBot.inviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-100 text-xs font-medium text-slate-800 inline-flex items-center gap-1 shrink-0"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Convidar</span>
                </a>
              )}
            </div>
          )}

          {testBot?.lastError && !testBot.online && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {testBot.lastError}
            </div>
          )}

          <div className="space-y-2.5">
            <label htmlFor="test-bot-token" className="text-xs font-medium text-slate-700 block">
              Token ou Client ID do 2º Bot
            </label>
            <div className="flex gap-2">
              <input
                id="test-bot-token"
                type="password"
                value={testBotInput}
                onChange={(e) => setTestBotInput(e.target.value)}
                placeholder="Cole TEST_BOT_TOKEN ou Client ID..."
                className="flex-1 h-9 px-3 text-xs text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#5865F2]"
              />
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void handleConfigureTestBot()}
                className="h-9 px-3 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] disabled:opacity-50 text-white text-xs font-semibold shrink-0 cursor-pointer"
              >
                {busyAction === 'test_cfg' ? 'Salvando...' : 'Salvar'}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void handleAuthorizeTestBot()}
                className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
              >
                {busyAction === 'test_auth' ? 'Autorizando...' : 'Autorizar / Desbanir no Servidor'}
              </button>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void handleReconnectTestBot()}
                className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${busyAction === 'test_reconnect' ? 'animate-spin' : ''}`} />
                <span>Ligar 2º Bot</span>
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div>
              <label htmlFor="test-channel-select" className="text-xs font-medium text-slate-700 block mb-1">
                Canal de Texto para Teste ao Vivo
              </label>
              <select
                id="test-channel-select"
                value={selectedTestChannelId}
                onChange={(e) => setSelectedTestChannelId(e.target.value)}
                className="w-full h-9 px-3 text-xs text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#5865F2]"
              >
                {channels.length === 0 ? (
                  <option value="">Nenhum canal de texto disponível</option>
                ) : (
                  channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.categoryName ? `${c.categoryName} / #${c.name}` : `#${c.name}`}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label htmlFor="custom-spam-phrase" className="text-xs font-medium text-slate-700 block mb-1">
                Frase personalizada para Anti-Spam (opcional)
              </label>
              <input
                id="custom-spam-phrase"
                type="text"
                value={customSpamText}
                onChange={(e) => setCustomSpamText(e.target.value)}
                placeholder="Padrão: 🚨 Teste Anti-Spam do Sistema #573"
                className="w-full h-9 px-3 text-xs text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#5865F2]"
              />
            </div>

            {adminWarning && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700 mt-0.5" />
                <span>
                  O 2º Bot possui permissão de Administrador no servidor — remova Administrador do cargo dele se quiser ver a ocultação visual dos outros canais em #spam-não.
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busyAction !== null || !selectedTestChannelId}
                onClick={() => void handleRunTest('spam')}
                className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-xs font-medium text-slate-800 cursor-pointer"
              >
                {busyAction === 'run_spam' ? 'Enviando 10x...' : 'Testar Anti-Spam 10x'}
              </button>
              <button
                type="button"
                disabled={busyAction !== null || !selectedTestChannelId}
                onClick={() => void handleRunTest('invite')}
                className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-xs font-medium text-slate-800 cursor-pointer"
              >
                {busyAction === 'run_invite' ? 'Testando...' : 'Testar Anti-Convite'}
              </button>
              <button
                type="button"
                disabled={busyAction !== null || !selectedTestChannelId}
                onClick={() => void handleRunTest('massping')}
                className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-xs font-medium text-slate-800 cursor-pointer"
              >
                {busyAction === 'run_massping' ? 'Testando...' : 'Testar Anti-MassPing'}
              </button>
              <button
                type="button"
                disabled={busyAction !== null || !selectedTestChannelId}
                onClick={() => void handleRunTest('raid')}
                className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-xs font-medium text-slate-800 cursor-pointer"
              >
                {busyAction === 'run_raid' ? 'Testando...' : 'Testar Anti-Raid #spam-não'}
              </button>
            </div>

            <button
              type="button"
              disabled={busyAction !== null || !selectedTestChannelId}
              onClick={() => void handleRunTest('all')}
              className="w-full h-10 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>
                {busyAction === 'run_all'
                  ? 'Iniciando Bateria Completa...'
                  : 'Executar Bateria Completa (4 Sistemas)'}
              </span>
            </button>
          </div>
        </section>
      </div>

      {/* Security Audit Log */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-600" />
            <h3 className="text-base font-semibold text-slate-900">
              Registros de Segurança (#segurança-log)
            </h3>
            <span className="text-xs text-slate-500">({visibleLogs.length})</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAllGuildLogs((prev) => !prev)}
              className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer"
            >
              {showAllGuildLogs ? 'Somente este servidor' : 'Ver todos servidores'}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void loadSecurityState()}
              className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        {visibleLogs.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
            Nenhuma ocorrência de segurança registrada ainda nesta sessão.
          </div>
        ) : (
          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {visibleLogs.map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg border border-slate-200 bg-slate-50/70 p-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-2"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                        ACTION_BADGES[entry.action] || 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {entry.action}
                    </span>
                    <span className="text-xs font-semibold text-slate-900">{entry.reason}</span>
                  </div>
                  <p className="text-xs text-slate-600">{entry.details}</p>
                  <div className="text-[11px] font-mono text-slate-400">
                    Alvo: {entry.targetTag} ({entry.targetId})
                  </div>
                </div>

                <div className="text-[11px] font-mono text-slate-500 shrink-0 tabular-nums flex items-center gap-1">
                  <Flame className="w-3 h-3 text-slate-400" />
                  <span>{new Date(entry.timestamp).toLocaleString('pt-BR')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
