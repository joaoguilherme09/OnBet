import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Navbar from './Navbar'
import BottomNav from './BottomNav'

/** Barra superior em largura total; abaixo, menu lateral (desktop) e conteúdo. */
export default function Layout() {
  return (
    <div className="min-h-dvh">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-gold focus:px-3 focus:py-2 focus:text-on-gold"
      >
        Pular para o conteúdo
      </a>
      <Navbar />
      <div className="flex">
        <Sidebar />
        <main id="conteudo" className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
