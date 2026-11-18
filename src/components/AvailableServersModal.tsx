import { useMemo, useState } from 'react';
import { X, Search, ExternalLink, ChevronRight, LogIn } from 'lucide-react';
import type { GuildItem } from '../types';

interface AvailableServersModalProps {
  open: boolean;
  authenticated: boolean;
  loading: boolean;
  availableGuilds: GuildItem[];
  onClose: () => void;
  onSelectGuild: (guild: GuildItem) => void;
  onInviteToGuild: (guildId?: string) => void;
  onLoginDiscord: () => void;
}

function getGuildInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function AvailableServersModal({
  open,
  authenticated,
  loading,
  availableGuilds,
  onClose,
  onSelectGuild,
  onInviteToGuild,
  onLoginDiscord,
}: AvailableServersModalProps) {
  const [query, setQuery] = useState('');

  const filteredGuilds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return availableGuilds;
    return availableGuilds.filter((g) => g.name.toLowerCase().includes(q));
  }, [availableGuilds, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="available-servers-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col max-h-[82vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="available-servers-title" className="text-base font-semibold text-slate-900">
              Servidores disponíveis
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Selecione um servidor ativo ou adicione o bot a um servidor onde você é administrador.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors duration-150 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!authenticated && (
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-600">
              Mostrando todos os servidores onde o bot está ativo. Conecte o Discord para convidar a outros.
            </p>
            <button
              type="button"
              onClick={onLoginDiscord}
              className="min-h-[32px] px-3 py-1 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Conectar Discord</span>
            </button>
          </div>
        )}

        <div className="px-6 py-3 border-b border-slate-100">
          <div className="relative">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrar servidor pelo nome..."
              className="w-full h-10 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#5865F2] focus:bg-white transition-colors"
            />
          </div>
        </div>

        <div className="overflow-y-auto divide-y divide-slate-100 flex-1">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((idx) => (
                <div key={idx} className="h-14 rounded-lg bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : filteredGuilds.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-500">
                {availableGuilds.length === 0
                  ? 'Nenhum servidor encontrado no momento.'
                  : 'Nenhum servidor corresponde à sua busca.'}
              </p>
            </div>
          ) : (
            filteredGuilds.map((guild) => (
              <div
                key={guild.id}
                className="flex items-center justify-between gap-4 px-6 py-3.5 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {guild.iconUrl ? (
                    <img
                      src={guild.iconUrl}
                      alt={guild.name}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-semibold text-slate-700 shrink-0">
                      {getGuildInitials(guild.name)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{guild.name}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1.5">
                      <span>{guild.owner ? 'Proprietário' : 'Administrador'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{guild.botPresent ? 'Bot ativo' : 'Bot não adicionado'}</span>
                    </div>
                  </div>
                </div>

                {guild.botPresent ? (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectGuild(guild);
                      onClose();
                    }}
                    className="min-h-[36px] px-3.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-medium text-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                  >
                    <span>Abrir painel</span>
                    <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onInviteToGuild(guild.id)}
                    className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                  >
                    <span>Adicionar bot</span>
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
