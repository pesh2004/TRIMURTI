// Typed fetch wrapper. Sends credentials so the session cookie flows and
// mirrors the CSRF cookie into the X-CSRF-Token header on mutations — see
// backend/internal/middleware/csrf.go for the double-submit verification
// that expects this.
// Throws ApiError for non-2xx so TanStack Query surfaces failures cleanly.

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

type ApiOptions = Omit<RequestInit, 'body'> & { body?: unknown }

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const CSRF_COOKIE = 'trimurti_csrf'

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  let body: BodyInit | undefined
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(options.body)
  }

  const method = (options.method ?? 'GET').toUpperCase()
  if (MUTATION_METHODS.has(method)) {
    const csrf = readCookie(CSRF_COOKIE)
    if (csrf) headers.set('X-CSRF-Token', csrf)
  }

  const res = await fetch(path.startsWith('http') ? path : path, {
    credentials: 'include',
    ...options,
    headers,
    body,
  })
  const text = await res.text()
  const data = text ? safeJSON(text) : null
  if (!res.ok) {
    const message = extractMessage(data) ?? res.statusText
    throw new ApiError(res.status, message, data)
  }
  return data as T
}

// readCookie is exported for tests; normal code uses `api()` which calls it
// automatically for mutations.
export function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function safeJSON(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

function extractMessage(data: unknown): string | undefined {
  if (typeof data === 'object' && data && 'message' in data && typeof data.message === 'string') {
    return data.message
  }
  return undefined
}
