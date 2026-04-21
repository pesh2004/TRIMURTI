import { api } from '../api'

// Mirrors backend/internal/modules/settings/types.go. Keep the two in sync
// by hand until we ship OpenAPI — the backend handler is the contract.

export type Address = {
  lines: string[]
  country?: string | null
}

export type CompanyProfile = {
  id: number
  code: string
  name_th: string
  name_en: string
  tax_id: string | null
  phone: string | null
  email: string | null
  website: string | null
  address: Address | null
  currency: string
  timezone: string
  fiscal_year_start_month: number
  vat_rate: string
  wht_rate: string
  is_active: boolean
  created_at: string
  updated_at: string
}

// Request shape mirrors UpdateCompanyRequest — sparse patch. Every field
// optional; backend only writes the ones you send.
export type UpdateCompanyRequest = {
  name_th?: string
  name_en?: string
  tax_id?: string
  phone?: string
  email?: string
  website?: string
  address?: Address
  currency?: string
  timezone?: string
  fiscal_year_start_month?: number
  vat_rate?: string
  wht_rate?: string
}

export type IntegrationsStatus = {
  smtp: { configured: boolean; host: string; port: number; from: string }
  storage: { mode: string }
  payment: { configured: boolean; provider: string; note: string }
  e_tax: { configured: boolean; provider: string; note: string }
}

export const settingsApi = {
  getCompany: () => api<CompanyProfile>('/api/v1/settings/company'),
  updateCompany: (body: UpdateCompanyRequest) =>
    api<CompanyProfile>('/api/v1/settings/company', { method: 'PUT', body }),
  getIntegrations: () => api<IntegrationsStatus>('/api/v1/settings/integrations'),
  switchCompany: (company_id: number) =>
    api<unknown>('/api/v1/auth/switch-company', { method: 'POST', body: { company_id } }),
}
