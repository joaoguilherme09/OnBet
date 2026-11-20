import { Suspense, lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { ThemeProvider } from './context/ThemeContext'
import { WalletProvider } from './context/WalletContext'
import { BetSlipProvider } from './context/BetSlipContext'
import { GuestOnly, RequireAdmin, RequireAuth } from './components/RouteGuards'
import Layout from './components/Layout'
import Home from './pages/Home'
import Matches from './pages/Matches'
import Predictions from './pages/Predictions'
import EventDetail from './pages/EventDetail'
import Wallet from './pages/Wallet'
import Ranking from './pages/Ranking'
import History from './pages/History'
import MyPredictions from './pages/MyPredictions'
import Stats from './pages/Stats'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'
import { Loading } from './components/ui/StateViews'

// O painel admin só é baixado por quem o abre.
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'))
const AdminEvents = lazy(() => import('./pages/admin/Events'))
const AdminResults = lazy(() => import('./pages/admin/Results'))
const AdminMatches = lazy(() => import('./pages/admin/Matches'))
const AdminCompetitions = lazy(() => import('./pages/admin/Competitions'))
const AdminUsers = lazy(() => import('./pages/admin/Users'))

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <WalletProvider>
            <BetSlipProvider>
              <Suspense fallback={<Loading />}>
              <Routes>
                <Route element={<Layout />}>
                  {/* públicas */}
                  <Route index element={<Home />} />
                  <Route path="partidas" element={<Matches />} />
                  <Route path="palpites" element={<Predictions />} />
                  <Route path="palpites/:id" element={<EventDetail />} />
                  <Route path="ranking" element={<Ranking />} />
                  <Route path="estatisticas" element={<Stats />} />

                  {/* autenticação */}
                  <Route path="entrar" element={<Login />} />
                  <Route path="redefinir-senha" element={<ResetPassword />} />
                  <Route element={<GuestOnly />}>
                    <Route path="cadastro" element={<Register />} />
                    <Route path="recuperar-senha" element={<ForgotPassword />} />
                  </Route>

                  {/* participante logado */}
                  <Route element={<RequireAuth />}>
                    <Route path="carteira" element={<Wallet />} />
                    <Route path="meus-palpites" element={<MyPredictions />} />
                    <Route path="historico" element={<History />} />
                    <Route path="perfil" element={<Profile />} />
                    <Route path="configuracoes" element={<Settings />} />
                  </Route>

                  {/* administração */}
                  <Route path="admin" element={<RequireAdmin />}>
                    <Route element={<AdminLayout />}>
                      <Route index element={<AdminDashboard />} />
                      <Route path="eventos" element={<AdminEvents />} />
                      <Route path="resultados" element={<AdminResults />} />
                      <Route path="partidas" element={<AdminMatches />} />
                      <Route path="campeonatos" element={<AdminCompetitions />} />
                      <Route path="participantes" element={<AdminUsers />} />
                    </Route>
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
              </Suspense>
            </BetSlipProvider>
          </WalletProvider>
        </AuthProvider>
      </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
