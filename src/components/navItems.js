import { House, Swords, Ticket, Wallet, Trophy, History, ListChecks, ChartColumn } from 'lucide-react'

export const NAV_ITEMS = [
  { to: '/', label: 'Início', icon: House, end: true, mobile: true },
  { to: '/partidas', label: 'Partidas', icon: Swords, mobile: true },
  { to: '/palpites', label: 'Palpites', icon: Ticket, mobile: true },
  { to: '/meus-palpites', label: 'Meus palpites', icon: ListChecks, mobile: true },
  { to: '/ranking', label: 'Ranking', icon: Trophy, mobile: false },
  { to: '/estatisticas', label: 'Estatísticas', icon: ChartColumn, mobile: false },
  { to: '/carteira', label: 'Carteira', icon: Wallet, mobile: true },
  { to: '/historico', label: 'Histórico', icon: History, mobile: false },
]
