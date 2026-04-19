import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Icons } from './icons'

type ToastItem = { id: number; text: string }

type ToastApi = {
  push: (text: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((text: string) => {
    const id = Date.now() + Math.random()
    setItems((arr) => [...arr, { id, text }])
    setTimeout(() => setItems((arr) => arr.filter((x) => x.id !== id)), 3200)
  }, [])

  const api: ToastApi = { push }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-wrap">
        {items.map((it) => (
          <div key={it.id} className="toast">
            <span className="toast-ic">{Icons.eye(11)}</span>
            <span>{it.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  // Fall back to a no-op API so components work outside the provider during tests.
  return ctx ?? { push: () => {} }
}

