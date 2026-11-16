import { Link } from 'react-router-dom'
import Mascot from '../components/Mascot'
import Button from '../components/ui/Button'

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <Mascot className="h-20 w-20" />
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <p className="text-muted">O endereço digitado não existe no ON BETS.</p>
      <Button as={Link} to="/">Voltar ao início</Button>
    </div>
  )
}
