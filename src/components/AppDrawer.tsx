import { useEffect } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import { Server, ShieldAlert, Share2, X, CheckCircle2, CircleSlash, Settings, Cloud } from 'lucide-react';

export type DrawerSection = 'dashboard' | 'tiktok' | 'exp';

interface AppDrawerProps {
  open: boolean;
  activeSection: DrawerSection;
  tiktokConnected: boolean;
  tiktokUsername: string | null;
  firebaseUser?: FirebaseUser | null;
  onLinkCloudBackup?: () => void;
  onUnlinkCloudBackup?: () => void;
  onClose: () => void;
  onNavigate: (section: DrawerSection) => void;
  onOpenConfig?: () => void;
}

export function AppDrawer({
  open,
  activeSection,
  tiktokConnected,
  tiktokUsername,
  firebaseUser,
  onLinkCloudBackup,
  onUnlinkCloudBackup,
  onClose,
  onNavigate,
  onOpenConfig,
}: AppDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-label="Menu de navegação"
    >
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
      />

      <aside className="relative z-10 w-[280px] max-w-[85vw] h-full bg-white border-r border-slate-200 flex flex-col justify-between shadow-lg">
        <div>
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
            <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
              573
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar menu"
              className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 inline-flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav aria-label="Menu lateral" className="p-3 space-y-1">
            <button
              type="button"
              onClick={() => {
                onNavigate('dashboard');
                onClose();
              }}
              className={`w-full min-h-[42px] px-3.5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors whitespace-nowrap ${
                activeSection === 'dashboard'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Server className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Servidores</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onNavigate('tiktok');
                onClose();
              }}
              className={`w-full min-h-[42px] px-3.5 py-2.5 rounded-lg text-sm font-medium flex items-center justify-between gap-2 transition-colors whitespace-nowrap ${
                activeSection === 'tiktok'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-3">
                <Share2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Contas TikTok</span>
              </span>
              <span
                className={`text-xs font-normal ${
                  activeSection === 'tiktok'
                    ? 'text-slate-300'
                    : tiktokConnected
                      ? 'text-emerald-700'
                      : 'text-slate-500'
                }`}
              >
                {tiktokConnected ? 'Conectado' : 'Desconectado'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onNavigate('exp');
                onClose();
              }}
              className={`w-full min-h-[42px] px-3.5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors whitespace-nowrap ${
                activeSection === 'exp'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Histórico EXP</span>
            </button>

            {onOpenConfig && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenConfig();
                }}
                className="w-full min-h-[42px] px-3.5 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors whitespace-nowrap"
              >
                <Settings className="w-4 h-4 shrink-0 text-slate-500" aria-hidden="true" />
                <span>Configurações & Chaves</span>
              </button>
            )}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 text-xs text-slate-600 space-y-3">
          <div>
            <div className="font-medium text-slate-900 mb-1">Conta Firebase (Nuvem)</div>
            {firebaseUser ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-emerald-700 min-w-0">
                  <Cloud className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{firebaseUser.email || firebaseUser.displayName || 'Conectado'}</span>
                </div>
                {onUnlinkCloudBackup && (
                  <button
                    type="button"
                    onClick={onUnlinkCloudBackup}
                    className="text-[11px] font-medium text-slate-500 hover:text-slate-900 shrink-0"
                  >
                    Sair
                  </button>
                )}
              </div>
            ) : onLinkCloudBackup ? (
              <button
                type="button"
                onClick={onLinkCloudBackup}
                className="w-full min-h-[34px] px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors"
              >
                <Cloud className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Entrar com Google (Firebase)</span>
              </button>
            ) : (
              <div className="text-slate-500">Desconectado</div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100">
            <div className="font-medium text-slate-900 mb-1">Status TikTok (Zernio)</div>
            {tiktokConnected && tiktokUsername ? (
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">@{tiktokUsername}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-slate-500">
                <CircleSlash className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Nenhuma conta vinculada</span>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
