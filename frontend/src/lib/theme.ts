export const THEME_KEY = 'trimurti.theme'
export type Theme = 'light' | 'dark'

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  localStorage.setItem(THEME_KEY, t)
}

export function initialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
