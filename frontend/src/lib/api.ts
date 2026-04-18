// Typed fetch wrapper. Sends credentials so the session cookie flows.
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

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  let body: BodyInit | undefined
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(options.body)
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
