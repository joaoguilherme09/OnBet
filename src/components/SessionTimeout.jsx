import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

// Sai da conta depois de 10 minutos sem uso; avisa 1 minuto antes.
export const IDLE_LIMIT_MS = 10 * 60 * 1000
const WARN_BEFORE_MS = 60 * 1000
const CHECK_EVERY_MS = 5 * 1000
const SAVE_EVERY_MS = 10 * 1000 // não grava a cada movimento, só de tempos em tempos
const STORAGE_KEY = 'onbets-last-activity'
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll', 'mousemove']

// Última atividade fica no localStorage: vale para todas as abas do aparelho
// e continua contando com o site fechado ou o celular bloqueado.
function readRecord() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    return null
  }
}
function writeRecord(record) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  } catch {
    /* sem armazenamento: o controle fica só na memória desta aba */
  }
}

/**
 * Logout automático por inatividade. Só desconecta ESTE aparelho
 * (os outros aparelhos da mesma conta seguem com o próprio controle).
 */
export default function SessionTimeout() {
  const { isAuthenticated, user, signOut } = useAuth()
  const toast = useToast()
  const [secondsLeft, setSecondsLeft] = useState(null) // != null: aviso aberto
  const memory = useRef(null) // cópia em memória, caso o localStorage falhe
  const lastSave = useRef(0)
  const signingOut = useRef(false)

  // identifica o login atual: muda a cada novo login, não muda ao renovar o token
  const loginId = user ? `${user.id}:${user.last_sign_in_at ?? ''}` : null

  const lastActivity = useCallback(() => {
    const r = readRecord() ?? memory.current
    return r && r.loginId === loginId ? r.at : null
  }, [loginId])

  const markActivity = useCallback(
    (force = false) => {
      const now = Date.now()
      if (!force && now - lastSave.current < SAVE_EVERY_MS) return
      lastSave.current = now
      memory.current = { loginId, at: now }
      writeRecord(memory.current)
    },
    [loginId],
  )

  const expire = useCallback(async (reason = 'idle') => {
    if (signingOut.current) return
    signingOut.current = true
    setSecondsLeft(null)
    try {
      await signOut({ scope: 'local' })
    } catch {
      /* mesmo com erro de rede a sessão local é apagada */
    }
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignora */
    }
    memory.current = null
    toast.info(
      reason === 'manual'
        ? 'Você saiu da conta.'
        : 'Você ficou 10 minutos sem usar o site e saiu da conta. Entre de novo para continuar.',
    )
    signingOut.current = false
  }, [signOut, toast])

  const check = useCallback(() => {
    const at = lastActivity()
    if (at == null) return
    const idle = Date.now() - at
    if (idle >= IDLE_LIMIT_MS) expire()
    else if (idle >= IDLE_LIMIT_MS - WARN_BEFORE_MS) setSecondsLeft(Math.ceil((IDLE_LIMIT_MS - idle) / 1000))
    else setSecondsLeft(null)
  }, [lastActivity, expire])

  // ao abrir o site já logado: se passou do limite desde a última atividade, sai na hora
  useEffect(() => {
    if (!isAuthenticated || !loginId) return
    const at = lastActivity()
    if (at == null) markActivity(true) // login novo (ou primeira vez neste aparelho)
    else if (Date.now() - at >= IDLE_LIMIT_MS) expire()
  }, [isAuthenticated, loginId]) // eslint-disable-line react-hooks/exhaustive-deps

  // escuta atividade e confere o tempo periodicamente
  useEffect(() => {
    if (!isAuthenticated) {
      setSecondsLeft(null)
      return
    }
    const onActivity = () => {
      markActivity()
    }
    const onVisible = () => document.visibilityState === 'visible' && check()
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    document.addEventListener('visibilitychange', onVisible)
    const timer = setInterval(check, CHECK_EVERY_MS)
    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity))
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [isAuthenticated, markActivity, check])

  // contagem regressiva por segundo enquanto o aviso está aberto
  useEffect(() => {
    if (secondsLeft == null) return
    const t = setInterval(check, 1000)
    return () => clearInterval(t)
  }, [secondsLeft == null, check]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated || secondsLeft == null) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="inatividade-titulo"
        aria-describedby="inatividade-texto"
        className="relative w-full max-w-sm space-y-4 rounded-2xl border border-gold/40 bg-surface p-6 text-center shadow-2xl"
      >
        <Clock className="mx-auto h-10 w-10 text-gold" aria-hidden="true" />
        <h2 id="inatividade-titulo" className="text-xl font-bold">
          Você ainda está aí?
        </h2>
        <p id="inatividade-texto" className="text-sm text-muted">
          Por segurança, sua conta vai sair em{' '}
          <span className="num text-lg font-bold text-gold-bright">{secondsLeft}s</span> por falta de uso.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            autoFocus
            onClick={() => {
              markActivity(true)
              setSecondsLeft(null)
            }}
            className="flex-1 rounded-full bg-win py-2.5 font-display font-bold uppercase tracking-wide text-[#08170f] hover:brightness-110"
          >
            Continuar conectado
          </button>
          <button
            type="button"
            onClick={() => expire('manual')}
            className="flex-1 rounded-full border border-line-strong py-2.5 text-sm text-muted hover:text-text"
          >
            Sair agora
          </button>
        </div>
      </div>
    </div>
  )
}
