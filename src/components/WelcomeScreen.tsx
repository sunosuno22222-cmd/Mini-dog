import { useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { Bot, ArrowRight, AlertCircle, LogIn, Settings, Send, CheckCircle2, RefreshCw, Cloud } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface WelcomeScreenProps {
  oauthConfigured: boolean;
  authLoading: boolean;
  authError: string | null;
  firebaseUser?: FirebaseUser | null;
  onInviteBot: () => void;
  onLoginDiscord: () => void;
  onLinkCloudBackup?: () => void;
  onUnlinkCloudBackup?: () => void;
  onSkip: () => void;
  onOpenConfig?: () => void;
}

export function WelcomeScreen({
  oauthConfigured,
  authLoading,
  authError,
  firebaseUser,
  onInviteBot,
  onLoginDiscord,
  onLinkCloudBackup,
  onUnlinkCloudBackup,
  onSkip,
  onOpenConfig,
}: WelcomeScreenProps) {
  const [resending, setResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  const handleResend = async () => {
    setResending(true);
    setResendStatus(null);
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
        throw new Error(data.error || 'Não foi possível reenviar mensagens. Verifique se o bot está conectado.');
      }

      const count = data.messagesSent?.length ?? 0;
      setResendStatus(`Mensagens reenviadas com sucesso em ${count} canais no servidor ${data.guildName ?? ''} com a marca 5573 Satan!`);
    } catch (err) {
      setResendStatus(`Erro: ${(err as Error).message}`);
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-[#FAFAFA] flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 sm:p-10 text-center shadow-xs">
        <div className="mx-auto mb-6 w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-sm">
          <Bot className="w-7 h-7" aria-hidden="true" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-2 [text-wrap:balance]">
          573
        </h1>
        <p className="text-xs text-slate-500 leading-relaxed mb-6">
          Painel Discord de Segurança, Moderação, Jogo da Call e Integração TikTok Real (Zernio API).
        </p>

        {authError && (
          <div
            role="alert"
            className="mb-5 flex flex-col text-left text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-3.5 gap-2"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{authError}</span>
            </div>
            {onOpenConfig && (
              <button
                type="button"
                onClick={onOpenConfig}
                className="self-start text-[11px] font-semibold text-slate-900 bg-white px-2.5 py-1 rounded-md border border-slate-300 hover:bg-slate-100 transition-colors"
              >
                Configurar Token / Client ID
              </button>
            )}
          </div>
        )}

        {!oauthConfigured && !authError && (
          <div
            role="status"
            className="mb-5 flex flex-col text-left text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3.5 gap-2"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                As credenciais do Discord e Zernio (TikTok) podem ser inseridas no botão de configurações abaixo.
              </span>
            </div>
            {onOpenConfig && (
              <button
                type="button"
                onClick={onOpenConfig}
                className="self-start text-[11px] font-semibold text-amber-900 bg-amber-100/80 px-2.5 py-1 rounded-md border border-amber-300 hover:bg-amber-200 transition-colors"
              >
                Inserir Credenciais do Bot
              </button>
            )}
          </div>
        )}

        {resendStatus && (
          <div
            role="status"
            className={`mb-5 p-3.5 rounded-xl border text-xs text-left flex items-start gap-2 ${
              resendStatus.startsWith('Erro')
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {resendStatus.startsWith('Erro') ? (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span className="font-medium leading-relaxed">{resendStatus}</span>
          </div>
        )}

        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onInviteBot}
            disabled={authLoading}
            className="w-full min-h-[44px] px-6 py-3 rounded-xl bg-[#5865F2] hover:bg-[#4752C4] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2]"
          >
            <span>{authLoading ? 'Abrindo Discord...' : 'Colocar bot no servidor'}</span>
            <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onLoginDiscord}
            disabled={authLoading}
            className="w-full min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed text-slate-800 text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shadow-xs"
          >
            <LogIn className="w-4 h-4 shrink-0 text-slate-600" aria-hidden="true" />
            <span>Entrar com minha conta Discord</span>
          </button>

          {onLinkCloudBackup && (
            firebaseUser ? (
              <div className="w-full px-4 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-xs flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Cloud className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
                  <span className="truncate font-medium">
                    Firebase: {firebaseUser.email || firebaseUser.displayName || 'Conectado'}
                  </span>
                </div>
                {onUnlinkCloudBackup && (
                  <button
                    type="button"
                    onClick={onUnlinkCloudBackup}
                    className="text-[11px] font-semibold text-emerald-800 hover:underline shrink-0"
                  >
                    Sair
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onLinkCloudBackup}
                className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Cloud className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Entrar com Google (Firebase)</span>
              </button>
            )
          )}

          {onOpenConfig && (
            <button
              type="button"
              onClick={onOpenConfig}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Settings className="w-4 h-4 text-slate-500" />
              <span>Configurar Credenciais (Bot / Zernio)</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="w-full min-h-[42px] px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {resending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4 text-amber-700" />
            )}
            <span>Reenviar Mensagens dos Canais (5573 Satan)</span>
          </button>

          <button
            type="button"
            onClick={onSkip}
            className="min-h-[40px] px-5 py-2 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
          >
            Pular para o Painel
          </button>
        </div>
      </section>
    </main>
  );
}
