import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { isSupabaseConfigured, supabase } from '../services/supabase'
import * as authService from '../services/authService'

const AuthContext = createContext(null)

/**
 * Mantém sessão + perfil do usuário. O papel (role) vem do banco e só
 * serve para a interface; a permissão real é sempre checada pela RLS.
 */
export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [profileLoading, setProfileLoading] = useState(false)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      return
    }
    setProfileLoading(true)
    try {
      setProfile(await authService.getProfile(userId))
    } catch {
      setProfile(null)
    } finally {
      setProfileLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadProfile(data.session?.user.id)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)
      if (newSession) setProfileLoading(true)
      // Não chamar o Supabase de forma síncrona dentro do callback (evita deadlock).
      setTimeout(() => loadProfile(newSession?.user.id), 0)
      if (event === 'PASSWORD_RECOVERY') navigate('/redefinir-senha')
    })
    return () => sub.subscription.unsubscribe()
  }, [loadProfile, navigate])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      profileLoading,
      isAuthenticated: Boolean(session),
      isAdmin: profile?.role === 'admin',
      refreshProfile: () => loadProfile(session?.user.id),
      setProfile,
      // scope 'local' sai só deste aparelho; o padrão ('global') sai de todos
      signOut: async (options) => {
        await authService.signOut(options)
        setSession(null)
        setProfile(null)
      },
    }),
    [session, profile, loading, profileLoading, loadProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}
