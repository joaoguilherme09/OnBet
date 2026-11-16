const TZ = 'America/Sao_Paulo'

const coins = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const odds = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** 1000 → "1.000" */
export const formatCoins = (n) => coins.format(Number(n ?? 0))

/** 2.1 → "2,10" */
export const formatOdds = (n) => odds.format(Number(n ?? 0))

/** Retorno total de um palpite (inclui o valor apostado). Igual ao cálculo do banco. */
export const potentialPayout = (stake, odd) => Math.floor(Number(stake) * Number(odd))

const dayFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const fullFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })

/** "sáb., 21/11" */
export const formatDay = (iso) => dayFmt.format(new Date(iso))
/** "20:30" */
export const formatTime = (iso) => timeFmt.format(new Date(iso))
/** "21/11/2026, 20:30" */
export const formatDateTime = (iso) => fullFmt.format(new Date(iso))

/** "fecha em 3 h", "fecha em 2 dias" */
export function formatClosesIn(iso) {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'Encerrado'
  const min = Math.round(diff / 60000)
  if (min < 60) return `Fecha em ${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `Fecha em ${h} h`
  return `Fecha em ${Math.round(h / 24)} dias`
}

export const CATEGORY_LABEL = {
  match: 'Partida',
  competition: 'Campeão',
  milestone: 'Marco histórico',
}

/** ISO → valor de <input type="datetime-local"> no fuso do navegador. */
export function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Valor de <input type="datetime-local"> → ISO (UTC). */
export const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null)

export const EVENT_STATUS_LABEL = {
  draft: 'Rascunho',
  open: 'Aberto',
  closed: 'Fechado',
  settled: 'Apurado',
  void: 'Anulado',
}
export const MATCH_STATUS_LABEL = {
  scheduled: 'Agendada',
  live: 'Em andamento',
  finished: 'Finalizada',
  cancelled: 'Cancelada',
}
export const COMPETITION_STATUS_LABEL = {
  planned: 'Planejado',
  ongoing: 'Em andamento',
  finished: 'Encerrado',
}
