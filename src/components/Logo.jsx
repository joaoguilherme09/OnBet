/** Marca ON BETS: monograma chanfrado + nome. */
export default function Logo({ compact = false }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="h-8 w-8 shrink-0" aria-hidden="true">
        <path d="M10 2h44l8 8v44l-8 8H10l-8-8V10z" fill="none" stroke="var(--color-gold)" strokeWidth="3" />
        <path d="M15 22l5-5h6l5 5v20l-5 5h-6l-5-5z" fill="none" stroke="var(--color-gold-bright)" strokeWidth="5" strokeLinejoin="bevel" />
        <path d="M37 47V17l12 30V17" fill="none" stroke="var(--color-gold-bright)" strokeWidth="5" strokeLinejoin="bevel" />
      </svg>
      {!compact && (
        <span className="font-display text-xl font-bold leading-none tracking-wide">
          ON <span className="text-gold">BETS</span>
        </span>
      )}
      <span className="sr-only">ON BETS</span>
    </span>
  )
}
