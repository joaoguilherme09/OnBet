import TeamBadge from './TeamBadge'

/** Escudo do time quando tem imagem; senão, círculo com a inicial (sem siglas). */
export default function TeamAvatar({ team, size = 'md' }) {
  if (team?.logo_url) return <TeamBadge team={team} size={size} />
  const box = size === 'lg' ? 'h-16 w-16 text-2xl' : size === 'sm' ? 'h-7 w-7 text-xs' : 'h-10 w-10 text-base'
  return (
    <span
      aria-hidden="true"
      className={`${box} inline-flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-gold/30 to-raised font-display font-bold uppercase text-gold-bright ring-1 ring-gold/40`}
    >
      {team?.name?.trim()?.[0] ?? '?'}
    </span>
  )
}
