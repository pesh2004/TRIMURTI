import { api } from '@/lib/api'

export type Gender = 'M' | 'F' | 'O'
export type EmploymentType = 'fulltime' | 'contract' | 'daily' | 'parttime'
export type EmployeeStatus = 'active' | 'inactive' | 'terminated' | 'on_leave'

export type Company = {
  id: number
  code: string
  name_th: string
  name_en: string
  is_active: boolean
}

export type Department = {
  id: number
  company_id: number
  code: string
  name_th: string
  name_en: string
  is_active: boolean
}

export type Position = {
  id: number
  code: string
  name_th: string
  name_en: string
  level: number
  is_active: boolean
}

export type Employee = {
  id: number
  employee_code: string
  company_id: number
  department_id: number
  position_id: number
  company_name_en?: string
  company_name_th?: string
  department_name_en?: string
  department_name_th?: string
  position_name_en?: string
  position_name_th?: string
  first_name_th: string
  last_name_th: string
  first_name_en?: string | null
  last_name_en?: string | null
  nickname?: string | null
  gender: Gender
  birthdate: string
  national_id?: string | null
  phone?: string | null
  email?: string | null
  address?: unknown
  employment_type: EmploymentType
  hired_at: string
  terminated_at?: string | null
  terminated_reason?: string | null
  salary?: string | null
  status: EmployeeStatus
  created_at: string
  updated_at: string
}

export type EmployeeListItem = {
  id: number
  employee_code: string
  first_name_th: string
  last_name_th: string
  first_name_en?: string | null
  last_name_en?: string | null
  nickname?: string | null
  company_id: number
  company_name_en: string
  company_name_th: string
  department_id: number
  department_name_en: string
  department_name_th: string
  position_id: number
  position_name_en: string
  position_name_th: string
  employment_type: EmploymentType
  hired_at: string
  terminated_at?: string | null
  status: EmployeeStatus
}

export type EmployeeListResponse = {
  items: EmployeeListItem[]
  total: number
  limit: number
  offset: number
}

export type EmployeeFilters = {
  q?: string
  company_id?: number
  department_id?: number
  position_id?: number
  employment_type?: EmploymentType
  status?: EmployeeStatus
  hired_from?: string
  hired_to?: string
  limit?: number
  offset?: number
}

export type CreateEmployeeRequest = {
  company_id: number
  department_id: number
  position_id: number
  first_name_th: string
  last_name_th: string
  first_name_en?: string
  last_name_en?: string
  nickname?: string
  gender: Gender
  birthdate: string
  national_id?: string
  phone?: string
  email?: string
  address?: unknown
  employment_type: EmploymentType
  hired_at: string
  salary?: string
}

export type UpdateEmployeeRequest = Partial<Omit<CreateEmployeeRequest, 'company_id' | 'hired_at'>> & {
  status?: Exclude<EmployeeStatus, 'terminated'>
}

export type TerminateEmployeeRequest = {
  terminated_at: string
  terminated_reason: string
}

function qs(params: EmployeeFilters) {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '' || v === null) continue
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  }
  return parts.length ? '?' + parts.join('&') : ''
}

export const hrApi = {
  listCompanies: () => api<{ items: Company[] }>('/api/v1/hr/companies'),
  listDepartments: (companyId?: number) =>
    api<{ items: Department[] }>(
      '/api/v1/hr/departments' + (companyId ? `?company_id=${companyId}` : ''),
    ),
  listPositions: () => api<{ items: Position[] }>('/api/v1/hr/positions'),

  listEmployees: (filters: EmployeeFilters = {}) =>
    api<EmployeeListResponse>('/api/v1/hr/employees' + qs(filters)),
  getEmployee: (id: number) => api<Employee>(`/api/v1/hr/employees/${id}`),
  createEmployee: (body: CreateEmployeeRequest) =>
    api<Employee>('/api/v1/hr/employees', { method: 'POST', body }),
  updateEmployee: (id: number, body: UpdateEmployeeRequest) =>
    api<Employee>(`/api/v1/hr/employees/${id}`, { method: 'PATCH', body }),
  terminateEmployee: (id: number, body: TerminateEmployeeRequest) =>
    api<Employee>(`/api/v1/hr/employees/${id}/terminate`, { method: 'POST', body }),
}
