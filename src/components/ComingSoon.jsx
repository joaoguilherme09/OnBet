import Mascot from './Mascot'

/** Tela honesta para módulos que ainda serão construídos (sem dados falsos). */
export default function ComingSoon({ title, phase, children }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <Mascot className="h-20 w-20" />
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted">{children}</p>
      {phase && <p className="text-xs text-faint">Em desenvolvimento, Fase {phase}</p>}
    </div>
  )
}
