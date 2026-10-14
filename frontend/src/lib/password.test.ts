import { afterEach, describe, expect, it, vi } from 'vitest'
import { changePassword, validatePasswordChange } from './password'
import { parseLoginResponse } from './auth'

// Test-only values.
const TEMP = 'Temporary-Passw0rd!'
const NEW = 'My-Own-New-Passw0rd'
const TOKEN = 'test-only-token'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('validatePasswordChange', () => {
  it('accepts a valid new password that is confirmed', () => {
    expect(validatePasswordChange({ currentPassword: TEMP, newPassword: NEW, confirmPassword: NEW })).toEqual({})
  })

  it('requires the temporary password and a new one', () => {
    const errors = validatePasswordChange({ currentPassword: '', newPassword: '', confirmPassword: '' })
    expect(Object.keys(errors).sort()).toEqual(['currentPassword', 'newPassword'])
  })

  it('applies the same rules as the server', () => {
    for (const weak of ['short-1', ' Leading-space-pw', 'é'.repeat(40)]) {
      const errors = validatePasswordChange({ currentPassword: TEMP, newPassword: weak, confirmPassword: weak })
      expect(Object.keys(errors), weak).toEqual(['newPassword'])
    }
  })

  it('refuses reusing the temporary password', () => {
    const errors = validatePasswordChange({ currentPassword: TEMP, newPassword: TEMP, confirmPassword: TEMP })
    expect(Object.keys(errors)).toEqual(['newPassword'])
  })

  it('requires the confirmation to match', () => {
    const errors = validatePasswordChange({ currentPassword: TEMP, newPassword: NEW, confirmPassword: `${NEW}x` })
    expect(Object.keys(errors)).toEqual(['confirmPassword'])
  })
})

describe('changePassword', () => {
  it('posts both passwords with the token and treats 204 as success', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await changePassword(TOKEN, TEMP, NEW)

    expect(result.ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/auth/change-password')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    expect(JSON.parse(init.body as string)).toEqual({ currentPassword: TEMP, newPassword: NEW })
  })

  it('returns the server field error for a wrong current password', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ status: 400, error: 'Invalid request', fields: { currentPassword: 'Your current password is not correct.' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })))

    const result = await changePassword(TOKEN, 'wrong', NEW)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.fields.currentPassword).toBe('Your current password is not correct.')
  })
})

describe('login response flag', () => {
  const base = { token: TOKEN, userId: 2, loginId: 'EMP001', email: 'emp@rightsku.com', role: 'EMPLOYEE' }

  it('marks a temporary-password session', () => {
    expect(parseLoginResponse({ ...base, mustChangePassword: true })?.mustChangePassword).toBe(true)
  })

  it('treats a missing flag as a normal session and refuses a malformed one', () => {
    expect(parseLoginResponse(base)?.mustChangePassword).toBe(false)
    expect(parseLoginResponse({ ...base, mustChangePassword: 'yes' })).toBeNull()
  })
})
