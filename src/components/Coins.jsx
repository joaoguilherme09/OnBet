import { formatCoins } from '../utils/format'

/** Valor em ON Coins com o símbolo da moeda (moeda chanfrada dourada). */
export default function Coins({ value, className = '', signed = false }) {
  const n = Number(value ?? 0)
  const sign = signed && n > 0 ? '+' : signed && n < 0 ? '−' : ''
  return (
    <span className={`num inline-flex items-baseline gap-1 ${className}`}>
      {sign}
      {formatCoins(Math.abs(n))}
      <span className="text-[0.7em] font-medium text-gold">ON</span>
    </span>
  )
}
