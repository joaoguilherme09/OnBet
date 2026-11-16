import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { getWalletSummary, subscribeWallet } from '../services/walletService'

const WalletContext = createContext(null)

/**
 * Saldo do usuário logado, compartilhado pela navbar, home e cupom.
 * Atualiza ao registrar palpites (refresh) e por Realtime (apuração, ajustes).
 */
export function WalletProvider({ children }) {
  const { user } = useAuth()
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!user) {
      setSummary(null)
      return null
    }
    setLoading(true)
    try {
      const s = await getWalletSummary()
      setSummary(s)
      return s
    } catch {
      return null
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    refresh()
    if (!user) return
    let unsubscribe = () => {}
    try {
      unsubscribe = subscribeWallet(user.id, () => refresh())
    } catch {
      /* Realtime indisponível: o saldo atualiza nas ações do usuário */
    }
    return unsubscribe
  }, [user, refresh])

  const value = useMemo(
    () => ({ summary, balance: summary?.balance ?? null, loading, refresh }),
    [summary, loading, refresh],
  )
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet precisa estar dentro de <WalletProvider>')
  return ctx
}
