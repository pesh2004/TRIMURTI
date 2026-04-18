import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import th from './th.json'
import en from './en.json'

export const LANG_KEY = 'trimurti.lang'
export type Lang = 'th' | 'en'

function detectInitialLang(): Lang {
  const stored = localStorage.getItem(LANG_KEY)
  if (stored === 'th' || stored === 'en') return stored
  const nav = navigator.language?.toLowerCase() ?? ''
  return nav.startsWith('th') ? 'th' : 'en'
}

void i18n.use(initReactI18next).init({
  resources: {
    th: { translation: th },
    en: { translation: en },
  },
  lng: detectInitialLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export function setLanguage(l: Lang) {
  localStorage.setItem(LANG_KEY, l)
  void i18n.changeLanguage(l)
}

export default i18n
