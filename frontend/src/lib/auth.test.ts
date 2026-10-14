import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkLoginInput, login, parseLoginResponse } from './auth'

// Test-only values; not real accounts.
const PASSWORD = 'Test-Only-Passw0rd!'
const TOKEN = 'test-only-token'

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  const fetchMock = vi.fn(async () =>
    new Response(body === undefined ? '' : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('checkLoginInput', () => {
  it('accepts Employee IDs in any case and trims spaces', () => {
    expect(checkLoginInput('EMP001', PASSWORD)).toEqual({ ok: true, username: 'EMP001' })
    expect(checkLoginInput('  emp001 ', PASSWORD)).toEqual({ ok: true, username: 'emp001' })
    expect(checkLoginInput('RS-2024.07_1', PASSWORD)).toEqual({ ok: true, username: 'RS-2024.07_1' })
  })

  it('accepts the HR Admin work email', () => {
    expect(checkLoginInput(' hr@rightsku.com ', PASSWORD)).toEqual({ ok: true, username: 'hr@rightsku.com' })
    expect(checkLoginInput('HR@RightSKU.com', PASSWORD)).toEqual({ ok: true, username: 'HR@RightSKU.com' })
  })

  it('rejects values that can never be an Employee ID', () => {
    for (const bad of ['EMP 001', '-EMP1', 'EMP#1', 'E'.repeat(31)]) {
      expect(checkLoginInput(bad, PASSWORD), bad).toEqual({ ok: false, message: 'Enter a valid Employee ID, like EMP001.' })
    }
  })

  it('rejects a malformed email', () => {
    expect(checkLoginInput('hr@rightsku', PASSWORD).ok).toBe(false)
  })

  it('asks for both fields when one is missing', () => {
    expect(checkLoginInput('   ', PASSWORD).ok).toBe(false)
    expect(checkLoginInput('EMP001', '').ok).toBe(false)
  })
})

describe('login', () => {
  it('sends the Employee ID as "username" with the password, and returns the session', async () => {
    const fetchMock = respond(200, {
      token: TOKEN, tokenType: 'Bearer', userId: 2, loginId: 'EMP001', email: 'emp@rightsku.com', role: 'EMPLOYEE',
    })

    const result = await login('emp001', PASSWORD)

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/auth/login')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ username: 'emp001', password: PASSWORD })
    expect(init.credentials).toBe('omit')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.session.role).toBe('employee')
      expect(result.session.loginId).toBe('EMP001')
    }
  })

  it('signs in an HR Admin, who has no Employee ID', async () => {
    respond(200, { token: TOKEN, tokenType: 'Bearer', userId: 1, loginId: null, email: 'hr@rightsku.com', role: 'HR_ADMIN' })

    const result = await login('hr@rightsku.com', PASSWORD)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.session.role).toBe('hr')
      expect(result.session.loginId).toBeNull()
      expect(result.session.email).toBe('hr@rightsku.com')
    }
  })

  it('maps 401, 400, 429 and 5xx to reason codes', async () => {
    respond(401, { error: 'Invalid ID or password' })
    expect(await login('EMP001', PASSWORD)).toEqual({ ok: false, reason: 'invalid-credentials' })

    respond(400, { error: 'Invalid request' })
    expect(await login('EMP001', PASSWORD)).toEqual({ ok: false, reason: 'invalid-request' })

    respond(429, { error: 'Too many sign-in attempts. Try again later.' }, { 'Retry-After': '600' })
    expect(await login('EMP001', PASSWORD)).toEqual({ ok: false, reason: 'rate-limited', retryAfterSeconds: 600 })

    respond(502, undefined)
    expect(await login('EMP001', PASSWORD)).toEqual({ ok: false, reason: 'server' })
  })
})

describe('parseLoginResponse', () => {
  it('refuses an employee response without an Employee ID', () => {
    expect(parseLoginResponse({ token: TOKEN, userId: 2, loginId: null, email: 'emp@rightsku.com', role: 'EMPLOYEE' })).toBeNull()
  })

  it('refuses unknown roles', () => {
    expect(parseLoginResponse({ token: TOKEN, userId: 1, email: 'x@rightsku.com', role: 'ADMIN' })).toBeNull()
  })
})
