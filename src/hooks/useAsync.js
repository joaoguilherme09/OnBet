import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Executa uma função assíncrona e expõe { data, error, loading, reload }.
 * Ignora respostas que chegam depois de o componente desmontar.
 */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const alive = useRef(true)

  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await fn()
      if (alive.current) setState({ data, error: null, loading: false })
    } catch (error) {
      if (alive.current) setState({ data: null, error, loading: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    alive.current = true
    run()
    return () => {
      alive.current = false
    }
  }, [run])

  return { ...state, reload: run }
}
