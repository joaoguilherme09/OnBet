import { formatOdds } from '../utils/format'

/**
 * Botão de odd no estilo casa de aposta: rótulo pequeno em cima, odd grande embaixo.
 * Selecionado (no cupom) fica na cor do tema; vencedor ganha contorno.
 */
export default function OddButton({ label, odds, selected = false, winner = false, disabled = false, onClick, size = 'md', className = '' }) {
  const big = size === 'lg'
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${label}, odd ${formatOdds(odds)}`}
      className={`chamfer flex w-full min-w-0 flex-col items-center justify-center transition-all disabled:cursor-default ${
        big ? 'gap-1 px-3 py-3.5' : 'gap-0.5 px-2 py-2'
      } ${
        selected
          ? 'bg-gold text-on-gold shadow-lg shadow-gold/30'
          : winner
            ? 'bg-gold/15 ring-1 ring-gold'
            : 'bg-raised enabled:hover:-translate-y-0.5 enabled:hover:bg-line-strong'
      } ${className}`}
    >
      <span className={`w-full truncate text-center ${big ? 'text-sm' : 'text-[11px]'} ${selected ? 'text-on-gold' : 'text-muted'}`}>{label}</span>
      <span
        className={`num font-bold leading-none ${big ? 'text-2xl sm:text-3xl' : 'text-lg'} ${
          selected ? 'text-on-gold' : disabled && !winner ? 'text-faint' : 'text-gold-bright'
        }`}
      >
        {formatOdds(odds)}
      </span>
    </button>
  )
}
