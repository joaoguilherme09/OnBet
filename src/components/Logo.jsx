/**
 * Marca ON BETS.
 * variant="full": logo completa (menu lateral, desktop).
 * variant="icon": logo minimalista em formato quadrado + nome (barra do topo, celular).
 */
export default function Logo({ variant = 'icon', compact = false }) {
  if (variant === 'full') {
    return (
      <img
        src="/assets/logo.webp"
        alt="ON BETS"
        width="480"
        height="521"
        className="h-auto w-full max-w-28 rounded-xl"
      />
    )
  }
  return (
    <span className="inline-flex items-center gap-2.5">
      <img src="/assets/logo-icone.webp" alt="" width="96" height="96" className="h-9 w-9 shrink-0 rounded-lg" />
      {!compact && (
        <span className="font-display text-xl font-bold leading-none tracking-wide">
          ON <span className="text-gold">BETS</span>
        </span>
      )}
      <span className="sr-only">ON BETS</span>
    </span>
  )
}
