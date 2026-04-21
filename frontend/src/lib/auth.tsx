import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError } from './api'

export type CompanyLite = {
  id: number
  code: string
  name_th: string
  name_en: string
  is_default: boolean
}

export type User = {
  id: number
  email: string
  username: string
  display_name: string
  roles: string[]
  permissions: string[]
  companies: CompanyLite[]
  active_company_id: number
}

type AuthState = {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  hasPermission: (code: string) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const me = await api<User>('/api/v1/auth/me')
      setUser(me)
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setUser(null)
      } else {
        throw err
      }
    }
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        await refresh()
      } finally {
        setLoading(false)
      }
    })()
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const me = await api<User>('/api/v1/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    setUser(me)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api('/api/v1/auth/logout', { method: 'POST' })
    } finally {
      setUser(null)
    }
  }, [])

  const hasPermission = useCallback(
    (code: string) => !!user?.permissions.includes(code),
    [user],
  )

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh, hasPermission }),
    [user, loading, login, logout, refresh, hasPermission],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
