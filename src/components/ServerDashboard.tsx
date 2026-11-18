import { useState } from 'react';
import { Plus, ChevronRight, LogIn, LogOut, RefreshCw, AlertCircle, Server, Cloud, Check, Menu, Settings, Send, CheckCircle2 } from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import type { DiscordUser, GuildItem } from '../types';
import { apiFetch } from '../lib/api';

interface ServerDashboardProps {
  authenticated: boolean;
  user: DiscordUser | null;
  firebaseUser: FirebaseUser | null;
  cloudRestoredNotice: string | null;
  managedGuilds: GuildItem[];
  loading: boolean;
  error: string | null;
  oauthConfigured: boolean;
  onOpenDrawer: () => void;
  onOpenAvailableModal: () => void;
  onSelectGuild: (guild: GuildItem) => void;
  onLoginDiscord: () => void;
  onInviteBot: () => void;
  onLogout: () => void;
  onRefresh: () => void;
  onGoWelcome: () => void;
  onLinkCloudBackup: () => void;
  onUnlinkCloudBackup: () => void;
  onOpenConfig?: () => void;
}

function getGuildInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function ServerDashboard({
  authenticated,
  user,
  firebaseUser,
  cloudRestoredNotice,
  managedGuilds,
  loading,
  error,
  oauthConfigured,
  onOpenDrawer,
  onOpenAvailableModal,
  onSelectGuild,
  onLoginDiscord,
  onInviteBot,
  onLogout,
  onRefresh,
  onGoWelcome,
  onLinkCloudBackup,
  onUnlinkCloudBackup,
  onOpenConfig,
}: ServerDashboardProps) {
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  const handleResendAll = async () => {
    setResending(true);
    setResendNotice(null);
    try {
      const resp = await apiFetch('/api/discord/resend-all-channel-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await resp.json().catch(() => ({}))) as {
        success?: boolean;
        guildName?: string;
        messagesSent?: { channelName: string; type: string }[];
        error?: string;
      };
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Falha ao reenviar mensagens. O bot está ativo no servidor?');
      }
      setResendNotice(`Mensagens oficiais reenviadas com sucesso em ${data.messagesSent?.length ?? 0} canais no servidor "${data.guildName ?? ''}" com a identidade 5573 Satan!`);
    } catch (err) {
      setResendNotice(`Erro: ${(err as Error).message}`);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#FAFAFA] flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-[1160px] mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onOpenDrawer}
              aria-label="Abrir menu lateral"
              className="w-10 h-10 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 inline-flex items-center justify-center shrink-0 transition-colors"
            >
              <Menu className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onGoWelcome}
              className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 hover:opacity-80 transition-opacity"
            >
              573
            </button>
          </div>

          <nav aria-label="Navegação principal" className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <span className="text-slate-900 border-b-2 border-slate-900 py-1 whitespace-nowrap shrink-0">
              Servidores
            </span>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {authenticated && user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.globalName ?? user.username}
                      referrerPolicy="no-referrer"
                      className="w-7 h-7 rounded-full border border-slate-200 object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-700 text-xs font-semibold flex items-center justify-center shrink-0">
                      {(user.globalName ?? user.username).slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <span className="hidden sm:inline font-medium truncate max-w-[140px]">
                    {user.globalName ?? user.username}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Sair</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onLoginDiscord}
                className="min-h-[36px] px-4 py-2 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-medium inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Conectar Discord</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1160px] mx-auto px-6 py-10">
        {/* Section header with '+' button */}
        <div className="flex items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Seus servidores
            </h1>
            <p className="text-sm text-slate-500 mt-1 tabular-nums">
              {managedGuilds.length} {managedGuilds.length === 1 ? 'servidor conectado' : 'servidores conectados'} ao bot
              {authenticated ? ' (Discord conectado)' : ' — clique em qualquer servidor para editar'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onOpenConfig && (
              <button
                type="button"
                onClick={onOpenConfig}
                className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 transition-colors"
                title="Configurações de Credenciais do Bot e Zernio TikTok"
              >
                <Settings className="w-3.5 h-3.5 text-slate-500" />
                <span>Configurações</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleResendAll}
              disabled={resending}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-900 inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Reenviar painéis e mensagens oficiais em todos os canais com a marca 5573 Satan"
            >
              {resending ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 text-amber-700" />
              )}
              <span>Reenviar Mensagens (5573 Satan)</span>
            </button>

            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Atualizar lista de servidores"
              title="Atualizar lista de servidores"
              className="w-10 h-10 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-600 hover:text-slate-900 inline-flex items-center justify-center transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={onOpenAvailableModal}
              aria-label="Visualizar ou selecionar servidores disponíveis"
              title="Visualizar ou selecionar servidores disponíveis"
              className="w-10 h-10 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2] focus-visible:ring-offset-2"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {resendNotice && (
          <div
            role="status"
            className={`mt-4 p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
              resendNotice.startsWith('Erro')
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {resendNotice.startsWith('Erro') ? (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span className="font-medium leading-relaxed">{resendNotice}</span>
          </div>
        )}

        <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl px-5 py-3.5 text-sm">
          <div className="flex items-start gap-2.5">
            <Cloud
              className={`w-4 h-4 shrink-0 mt-0.5 ${firebaseUser ? 'text-emerald-600' : 'text-slate-500'}`}
              aria-hidden="true"
            />
            <div>
              <p className="font-medium text-slate-900">
                {firebaseUser
                  ? `Firebase conectado (${firebaseUser.email || firebaseUser.displayName || 'Google'})`
                  : 'Entrar com Firebase (Google) para restaurar configurações'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {firebaseUser
                  ? 'Todas as configurações salvas na sua conta permanecem sincronizadas neste projeto.'
                  : 'Faça login com a mesma conta Google usada anteriormente para restaurar automaticamente todas as suas configurações salvas.'}
              </p>
            </div>
          </div>
          {firebaseUser ? (
            <button
              type="button"
              onClick={onUnlinkCloudBackup}
              className="min-h-[34px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 whitespace-nowrap shrink-0 self-start sm:self-center transition-colors"
            >
              Sair do Firebase
            </button>
          ) : (
            <button
              type="button"
              onClick={onLinkCloudBackup}
              className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 self-start sm:self-center transition-colors"
            >
              <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Entrar com Google (Firebase)</span>
            </button>
          )}
        </div>

        {cloudRestoredNotice && (
          <div
            role="status"
            className="mt-4 flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 text-sm text-emerald-800"
          >
            <Check className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{cloudRestoredNotice}</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-6 flex items-center justify-between gap-4 bg-red-50 border border-red-200 rounded-xl px-5 py-3.5 text-sm text-red-700"
          >
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              className="text-xs font-medium underline underline-offset-2 whitespace-nowrap shrink-0"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {!oauthConfigured && (
          <div
            role="status"
            className="mt-6 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5 text-sm text-amber-800"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              As credenciais OAuth2 do Discord (`DISCORD_APPLICATION_ID` e `DISCORD_CLIENT_SECRET`) ainda precisam ser definidas no backend para autenticar e listar servidores reais.
            </span>
          </div>
        )}

        {/* Content states */}
        {loading ? (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-[104px] bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4 animate-pulse"
              >
                <div className="w-12 h-12 rounded-lg bg-slate-100 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/5 bg-slate-100 rounded" />
                  <div className="h-3 w-2/5 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : managedGuilds.length === 0 ? (
          <div className="mt-8 bg-white border border-slate-200 rounded-xl p-10 text-center max-w-xl mx-auto">
            <div className="mx-auto mb-4 w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
              <Server className="w-5 h-5" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              Nenhum servidor conectado ainda
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              O bot 5573 Satan ainda não apareceu em nenhum servidor conectado. Convide o bot ou atualize a lista.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onInviteBot}
                className="min-h-[44px] px-5 py-2.5 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Convidar bot para o servidor</span>
              </button>
              <button
                type="button"
                onClick={onRefresh}
                className="min-h-[44px] px-5 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-sm font-medium transition-colors whitespace-nowrap"
              >
                Atualizar lista
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {managedGuilds.map((guild) => (
              <button
                key={guild.id}
                type="button"
                onClick={() => onSelectGuild(guild)}
                className="group bg-white border border-slate-200 hover:border-slate-400 rounded-xl p-5 text-left flex items-center justify-between gap-4 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2]"
              >
                <div className="flex items-center gap-4 min-w-0">
                  {guild.iconUrl ? (
                    <img
                      src={guild.iconUrl}
                      alt={guild.name}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-sm font-semibold text-slate-700 shrink-0">
                      {getGuildInitials(guild.name)}
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="text-base font-semibold text-slate-900 truncate">
                      {guild.name}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                      <span>{guild.owner ? 'Proprietário' : 'Administrador'}</span>
                      <span aria-hidden="true">·</span>
                      <span>Bot ativo</span>
                    </div>
                  </div>
                </div>

                <ChevronRight
                  className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors shrink-0"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
