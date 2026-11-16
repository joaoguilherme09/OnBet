/** Escudo do time; sem imagem, mostra a sigla num brasão chanfrado. */
export default function TeamBadge({ team, size = 'md' }) {
  const box = size === 'lg' ? 'h-16 w-16 text-lg' : size === 'sm' ? 'h-7 w-7 text-[10px]' : 'h-10 w-10 text-xs'
  const label = team?.short_name || team?.name?.slice(0, 3) || '?'
  if (team?.logo_url) {
    return <img src={team.logo_url} alt="" className={`${box} shrink-0 object-contain`} loading="lazy" />
  }
  return (
    <span
      aria-hidden="true"
      className={`${box} chamfer inline-flex shrink-0 items-center justify-center bg-raised font-display font-semibold text-gold-bright`}
    >
      {label.toUpperCase()}
    </span>
  )
}
