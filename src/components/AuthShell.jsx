import { Link } from 'react-router-dom'
import { ArrowLeft, Layers, ShieldCheck, Trophy } from 'lucide-react'

const PERKS = [
  { icon: Layers, text: 'Palpites simples e múltiplas' },
  { icon: Trophy, text: 'Ranking da galera do camp' },
  { icon: ShieldCheck, text: 'Pontos virtuais, sem dinheiro real' },
]

/**
 * Moldura das telas de autenticação (entrar, cadastro, recuperar e redefinir senha).
 * À esquerda (ou em cima, no celular) a logo da plataforma; à direita o formulário.
 */
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="mx-auto w-full max-w-4xl py-2 sm:py-6">
      <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-gold-bright">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Ver apostas sem entrar
      </Link>

      <div className="grid overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-black/40 md:grid-cols-2">
        {/* vitrine da marca: fundo preto para emendar com a arte da logo */}
        <div className="relative flex flex-col items-center justify-center gap-5 overflow-hidden bg-black px-6 py-8 md:px-10 md:py-12">
          <div className="pointer-events-none absolute -top-20 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-gold/25 blur-3xl" aria-hidden="true" />
          <img
            src="/assets/logo.webp"
            alt="ON BETS"
            width="480"
            height="521"
            className="relative h-auto w-40 rounded-xl drop-shadow-[0_0_30px_rgba(0,0,0,0.6)] sm:w-52 md:w-72"
          />
          <p className="relative text-center font-display text-lg font-semibold text-white">
            A central de palpites da <span className="text-gold-bright">ORG ON Camps</span>
          </p>
          <ul className="relative hidden space-y-2 md:block">
            {PERKS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2.5 text-sm text-white/80">
                <Icon className="h-4 w-4 text-gold" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col justify-center p-6 sm:p-8">
          <h1 className="text-3xl font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 border-t border-line pt-5 text-center text-sm text-muted">{footer}</div>}
        </div>
      </div>
    </div>
  )
}
