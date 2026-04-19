import '@testing-library/jest-dom/vitest'

// Initialise i18next synchronously for component tests. Mirrors the runtime
// config in src/lib/i18n/index.ts but forces English + skips the
// localStorage-driven detector so tests are deterministic.
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import th from '../lib/i18n/th.json'
import en from '../lib/i18n/en.json'

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources: { th: { translation: th }, en: { translation: en } },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })
}
