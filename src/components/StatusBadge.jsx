const STYLES = {
  pending: ['Pendente', 'border-gold/40 text-gold-bright'],
  won: ['Vencedor', 'border-win/40 text-win'],
  lost: ['Perdedor', 'border-loss/40 text-loss'],
  void: ['Anulado', 'border-void/40 text-void'],
  // eventos
  open: ['Aberto', 'border-win/40 text-win'],
  soon: ['Abre em breve', 'border-gold/40 text-gold-bright'],
  closed: ['Aguardando resultado', 'border-line-strong text-muted'],
  settled: ['Apurado', 'border-gold/40 text-gold-bright'],
  draft: ['Rascunho', 'border-line-strong text-faint'],
}

export default function StatusBadge({ status, className = '' }) {
  const [label, tone] = STYLES[status] ?? [status, 'border-line text-muted']
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs ${tone} ${className}`}>
      {label}
    </span>
  )
}
