import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api, readCookie } from './api'

describe('readCookie', () => {
  afterEach(() => {
    // jsdom's document.cookie is shared across tests; clear between runs.
    document.cookie = 'trimurti_csrf=; Max-Age=0; path=/'
  })

  it('returns null when the cookie is absent', () => {
    expect(readCookie('trimurti_csrf')).toBeNull()
  })

  it('returns the cookie value when present', () => {
    document.cookie = 'trimurti_csrf=abc123xyz; path=/'
    expect(readCookie('trimurti_csrf')).toBe('abc123xyz')
  })

  it('decodes URL-encoded values', () => {
    document.cookie = 'trimurti_csrf=a%3Db%20c; path=/'
    expect(readCookie('trimurti_csrf')).toBe('a=b c')
  })

  it("doesn't confuse a prefix match with a real match", () => {
    document.cookie = 'other_name=nope; path=/'
    expect(readCookie('trimurti_csrf')).toBeNull()
  })
})

describe('api() CSRF header', () => {
  beforeEach(() => {
    document.cookie = 'trimurti_csrf=token-from-cookie; path=/'
    // Return a fresh Response each call — body streams can only be read
    // once, so reusing a single instance across `api()` calls fails.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      ),
    )
  })

  afterEach(() => {
    document.cookie = 'trimurti_csrf=; Max-Age=0; path=/'
    vi.unstubAllGlobals()
  })

  it('attaches X-CSRF-Token header on POST', async () => {
    await api('/api/v1/foo', { method: 'POST', body: { a: 1 } })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const headers = new Headers(init!.headers)
    expect(headers.get('X-CSRF-Token')).toBe('token-from-cookie')
  })

  it('attaches X-CSRF-Token on PATCH + DELETE', async () => {
    await api('/api/v1/foo', { method: 'PATCH', body: {} })
    await api('/api/v1/foo', { method: 'DELETE' })

    for (const call of vi.mocked(fetch).mock.calls) {
      const headers = new Headers(call[1]!.headers)
      expect(headers.get('X-CSRF-Token')).toBe('token-from-cookie')
    }
  })

  it('does NOT attach the header on GET', async () => {
    await api('/api/v1/foo')
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const headers = new Headers(init!.headers)
    expect(headers.get('X-CSRF-Token')).toBeNull()
  })

  it('omits the header when no cookie is set (first mutation after logout)', async () => {
    document.cookie = 'trimurti_csrf=; Max-Age=0; path=/'
    await api('/api/v1/foo', { method: 'POST', body: {} })
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const headers = new Headers(init!.headers)
    expect(headers.get('X-CSRF-Token')).toBeNull()
  })
})
