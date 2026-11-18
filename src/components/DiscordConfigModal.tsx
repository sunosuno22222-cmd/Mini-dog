import { useState, useEffect } from 'react';
import {
  X,
  Key,
  Shield,
  Bot,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

interface DiscordConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved?: () => void;
}

export function DiscordConfigModal({
  isOpen,
  onClose,
  onConfigSaved,
}: DiscordConfigModalProps) {
  const [botToken, setBotToken] = useState('');
  const [applicationId, setApplicationId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [zernioApiKey, setZernioApiKey] = useState('');

  const [showBotToken, setShowBotToken] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showZernioKey, setShowZernioKey] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingZernio, setTestingZernio] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [isBotConnected, setIsBotConnected] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setStatusMessage(null);
    setLoading(true);

    void (async () => {
      try {
        const [credResp, zernioResp, botResp] = await Promise.all([
          apiFetch('/api/config/discord-credentials'),
          apiFetch('/api/tiktok/zernio-key'),
          apiFetch('/api/config/status'),
        ]);

        if (credResp.ok) {
          const credData = (await credResp.json()) as {
            applicationId?: string;
            botInviteUrl?: string;
          };
          if (credData.applicationId) setApplicationId(credData.applicationId);
          if (credData.botInviteUrl) setInviteUrl(credData.botInviteUrl);
        }

        if (zernioResp.ok) {
          const zernioData = (await zernioResp.json()) as {
            configured?: boolean;
            maskedKey?: string;
          };
          if (zernioData.configured && zernioData.maskedKey) {
            setZernioApiKey(zernioData.maskedKey);
          }
        }

        if (botResp.ok) {
          const botData = (await botResp.json()) as {
            botStatus?: { connected: boolean };
          };
          setIsBotConnected(Boolean(botData.botStatus?.connected));
        }
      } catch {
        // Non-blocking
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen]);

  if (!isOpen) return null;

  // Auto extract application ID when user types Bot Token
  const handleBotTokenChange = (val: string) => {
    setBotToken(val);
    const clean = val.trim();
    if (clean.includes('.')) {
      const firstPart = clean.split('.')[0];
      try {
        const decoded = atob(firstPart);
        if (/^\d{17,22}$/.test(decoded) && !applicationId) {
          setApplicationId(decoded);
          setInviteUrl(
            `https://discord.com/oauth2/authorize?client_id=${decoded}&permissions=8&scope=bot%20applications.commands`,
          );
        }
      } catch {}
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);

    try {
      // 1. Save Discord Credentials
      const credBody: Record<string, string> = {};
      if (botToken.trim()) credBody.botToken = botToken.trim();
      if (applicationId.trim()) credBody.applicationId = applicationId.trim();
      if (clientSecret.trim()) credBody.clientSecret = clientSecret.trim();

      const credResp = await apiFetch('/api/config/discord-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credBody),
      });

      if (!credResp.ok) {
        const errData = (await credResp.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error || 'Falha ao salvar credenciais do Discord.');
      }

      const credData = (await credResp.json()) as {
        credentials?: { botInviteUrl?: string };
        botStatus?: { connected: boolean };
      };
      if (credData.credentials?.botInviteUrl) {
        setInviteUrl(credData.credentials.botInviteUrl);
      }
      setIsBotConnected(Boolean(credData.botStatus?.connected));

      // 2. Save Zernio API Key if provided and not just the masked string
      if (zernioApiKey.trim() && !zernioApiKey.includes('••••')) {
        await apiFetch('/api/tiktok/zernio-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: zernioApiKey.trim() }),
        });
      }

      setStatusMessage({
        type: 'success',
        text: 'Configurações salvas com sucesso! O bot foi sincronizado.',
      });

      onConfigSaved?.();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: (err as Error).message || 'Erro ao salvar configurações.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestZernio = async () => {
    setTestingZernio(true);
    setStatusMessage(null);
    try {
      const resp = await apiFetch('/api/tiktok/zernio-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: zernioApiKey.includes('••••') ? undefined : zernioApiKey.trim(),
        }),
      });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        profilesCount?: number;
        error?: string;
      };
      if (data.ok) {
        setStatusMessage({
          type: 'success',
          text: `Chave Zernio válida! Conexão oficial ao TikTok ativa (${data.profilesCount ?? 1} perfil disponível).`,
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: data.error || 'Chave Zernio inválida ou sem permissão.',
        });
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: (err as Error).message || 'Erro de rede ao testar Zernio.',
      });
    } finally {
      setTestingZernio(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                Configurações de Conexão · 573
              </h2>
              <p className="text-xs text-slate-500">
                Discord Bot, OAuth2 e Conexão Real TikTok (Zernio)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5 overflow-y-auto flex-1">
          {statusMessage && (
            <div
              role="alert"
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                statusMessage.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              {statusMessage.type === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span className="font-medium leading-relaxed">{statusMessage.text}</span>
            </div>
          )}

          {/* Discord Bot Token */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="modal_bot_token" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-slate-500" />
                <span>Discord Bot Token</span>
              </label>
              {isBotConnected && (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Bot Conectado
                </span>
              )}
            </div>
            <div className="relative">
              <input
                id="modal_bot_token"
                type={showBotToken ? 'text' : 'password'}
                value={botToken}
                onChange={(e) => handleBotTokenChange(e.target.value)}
                placeholder="Insira o Token do Bot (Discord Developer Portal)"
                className="w-full h-10 px-3 pr-10 text-xs font-mono rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowBotToken(!showBotToken)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showBotToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Obtido no Portal do Discord &gt; Applications &gt; Bot &gt; Reset Token. O ID da aplicação é detectado automaticamente ao colar o token.
            </p>
          </div>

          {/* Application ID & Client Secret */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label htmlFor="modal_app_id" className="text-xs font-bold text-slate-700">
                Application ID (Client ID)
              </label>
              <input
                id="modal_app_id"
                type="text"
                value={applicationId}
                onChange={(e) => {
                  setApplicationId(e.target.value.trim());
                  if (/^\d{17,22}$/.test(e.target.value.trim())) {
                    setInviteUrl(
                      `https://discord.com/oauth2/authorize?client_id=${e.target.value.trim()}&permissions=8&scope=bot%20applications.commands`,
                    );
                  }
                }}
                placeholder="Ex.: 134567890123456789"
                className="w-full h-10 px-3 text-xs font-mono rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="modal_client_secret" className="text-xs font-bold text-slate-700">
                Client Secret (OAuth2)
              </label>
              <div className="relative">
                <input
                  id="modal_client_secret"
                  type={showClientSecret ? 'text' : 'password'}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value.trim())}
                  placeholder="Client Secret para login de usuário"
                  className="w-full h-10 px-3 pr-10 text-xs font-mono rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                <button
                  type="button"
                  onClick={() => setShowClientSecret(!showClientSecret)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showClientSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Direct Invite Link Button if Application ID is known */}
          {inviteUrl && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-800">
                  Link Direto para Adicionar Bot ao Servidor
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  Não requer Client Secret. Adicione o bot com 1 clique.
                </div>
              </div>
              <a
                href={inviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 shrink-0 transition-colors shadow-xs"
              >
                <span>Adicionar Bot</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Zernio API Key Section */}
          <div className="pt-2 border-t border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="modal_zernio_key" className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-emerald-600" />
                <span>Chave Zernio API (TikTok Oficial)</span>
              </label>
              <button
                type="button"
                onClick={handleTestZernio}
                disabled={testingZernio || (!zernioApiKey && !zernioApiKey.includes('••••'))}
                className="text-[11px] font-semibold text-slate-700 hover:text-slate-900 inline-flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${testingZernio ? 'animate-spin' : ''}`} />
                <span>Testar Conexão</span>
              </button>
            </div>
            <div className="relative">
              <input
                id="modal_zernio_key"
                type={showZernioKey ? 'text' : 'password'}
                value={zernioApiKey}
                onChange={(e) => setZernioApiKey(e.target.value)}
                placeholder="Cole sua chave da API Zernio (ex.: zernio_...)"
                className="w-full h-10 px-3 pr-10 text-xs font-mono rounded-lg border border-slate-200 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <button
                type="button"
                onClick={() => setShowZernioKey(!showZernioKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showZernioKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Essa chave é necessária para autenticar e publicar posts reais no TikTok via OAuth oficial da Zernio.
            </p>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors shadow-sm disabled:opacity-60"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Salvando...</span>
                </>
              ) : (
                <span>Salvar Credenciais</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
