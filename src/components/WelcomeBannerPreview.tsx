interface WelcomeBannerPreviewProps {
  title: string;
  message: string;
  memberName: string;
  guildName: string;
  avatarUrl: string | null;
  backgroundUrl: string | null;
}

function getInitials(name: string): string {
  const clean = name.trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

function formatPreviewMessage(template: string, memberName: string, guildName: string): string {
  const safeName = memberName.trim() || 'Novo Membro';
  return template
    .replace(/\{user\}/gi, safeName)
    .replace(/\{username\}/gi, safeName.toLowerCase().replace(/\s+/g, ''))
    .replace(/\{server\}/gi, guildName)
    .replace(/\{membros\}/gi, '128')
    .replace(/\{memberCount\}/gi, '128');
}

export function WelcomeBannerPreview({
  title,
  message,
  memberName,
  guildName,
  avatarUrl,
  backgroundUrl,
}: WelcomeBannerPreviewProps) {
  const displayName = memberName.trim() || 'Novo Membro';
  const displayTitle = title.trim().toUpperCase();
  const displayMessage = formatPreviewMessage(message, displayName, guildName);

  return (
    <div className="relative w-full min-h-[168px] sm:aspect-[2/1] rounded-xl overflow-hidden border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 select-none flex items-center">
      {backgroundUrl && (
        <img
          src={backgroundUrl}
          alt="Pré-visualização do fundo"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover brightness-[0.88] saturate-[1.08]"
        />
      )}

      {/* Atmospheric gradient scrim + subtle radial glow matching server-side sharp renderer */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-br from-slate-950/55 via-slate-900/60 to-slate-950/75"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_18%_50%,rgba(88,101,242,0.24),transparent_55%)]"
      />

      {/* Subtle inner frame */}
      <div
        aria-hidden="true"
        className="absolute inset-2 sm:inset-2.5 rounded-lg border border-white/20 pointer-events-none"
      />

      {/* Horizontal Layout: Avatar on the left corner, centered text block on the right */}
      <div className="relative z-10 w-full flex items-center gap-4 sm:gap-7 px-4 sm:px-9 py-5">
        <div className="shrink-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              referrerPolicy="no-referrer"
              className="w-16 h-16 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full object-cover border-2 sm:border-[3px] border-white/90"
            />
          ) : (
            <div className="w-16 h-16 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full bg-slate-700 border-2 sm:border-[3px] border-white/65 flex items-center justify-center text-white text-lg sm:text-2xl font-bold">
              {getInitials(displayName)}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col items-center justify-center text-center">
          {displayTitle && (
            <p className="text-xs sm:text-sm font-bold tracking-[0.18em] text-slate-200/90 uppercase mb-0.5 sm:mb-1 truncate max-w-full">
              {displayTitle}
            </p>
          )}

          <p className="text-lg sm:text-[26px] font-bold text-white tracking-tight truncate max-w-full mb-1">
            {displayName}
          </p>

          {displayMessage && (
            <p className="text-sm sm:text-base font-medium text-slate-100/95 max-w-full line-clamp-3 leading-snug break-words">
              {displayMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
