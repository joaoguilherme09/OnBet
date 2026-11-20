import { createContext, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'onbets-theme'
const META_COLORS = { dark: '#141518', light: '#faf7f0', efootball: '#05071a' }
export const THEME_IDS = Object.keys(META_COLORS)

const ThemeContext = createContext(null)

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return THEME_IDS.includes(stored) ? stored : 'dark'
  } catch {
    return 'dark'
  }
}

/**
 * Tema da interface: "dark" (grafite e dourado, padrão), "light" (branco e dourado)
 * ou "efootball" (neon: magenta, ciano e azul royal).
 */
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readStoredTheme)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') delete root.dataset.theme
    else root.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLORS[theme])
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* armazenamento indisponível: o tema vale só nesta sessão */
    }
  }, [theme])

  const value = useMemo(() => ({ theme, setTheme }), [theme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme precisa estar dentro de <ThemeProvider>')
  return ctx
}
