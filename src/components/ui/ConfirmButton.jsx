import { useState } from 'react'
import Button from './Button'

/** Botão que pede um segundo clique antes de executar (sem window.confirm). */
export default function ConfirmButton({ onConfirm, children, confirmLabel = 'Confirmar?', variant = 'ghost', className = '', ...props }) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  async function click() {
    if (!armed) {
      setArmed(true)
      setTimeout(() => setArmed(false), 3500)
      return
    }
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
      setArmed(false)
    }
  }
  return (
    <Button
      type="button"
      variant={armed ? 'secondary' : variant}
      className={`${armed ? 'border-loss text-loss hover:border-loss hover:text-loss' : ''} ${className}`}
      onClick={click}
      disabled={busy}
      {...props}
    >
      {busy ? 'Aguarde…' : armed ? confirmLabel : children}
    </Button>
  )
}
