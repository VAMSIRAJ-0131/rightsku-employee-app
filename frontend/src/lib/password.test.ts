import { afterEach, describe, expect, it, vi } from 'vitest'
import { changePassword, validatePasswordChange } from './password'
import { parseLoginResponse } from './auth'

// Test-only values.
const TEMP = 'Temporary-Passw0rd!'
const NEW = '48271936'
const TOKEN = 'test-only-token'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('validatePasswordChange (employees: exactly 8 digits)', () => {
  it('accepts 8 digits typed twice', () => {
    expect(validatePasswordChange({ currentPassword: TEMP, newPassword: NEW, confirmPassword: NEW })).toEqual({})
    expect(validatePasswordChange({ currentPassword: TEMP, newPassword: '00000000', confirmPassword: '00000000' })).toEqual({})
  })

  it('refuses anything that is not exactly 8 digits, with the agreed message', () => {
    for (const bad of ['1234567', '123456789', '1234567a', '1234-678', '1234 678', ' 12345678', '１２３４５６７８', 'My-Own-Passw0rd!', '']) {
      const errors = validatePasswordChange({ currentPassword: TEMP, newPassword: bad, confirmPassword: bad })
      expect(errors.newPassword, bad).toBe('Password must contain exactly 8 digits.')
    }
  })

  it('requires the current password', () => {
    expect(validatePasswordChange({ currentPassword: '', newPassword: NEW, confirmPassword: NEW }).currentPassword).toBeDefined()
  })

  it('refuses reusing the current password', () => {
    const errors = validatePasswordChange({ currentPassword: NEW, newPassword: NEW, confirmPassword: NEW })
    expect(Object.keys(errors)).toEqual(['newPassword'])
  })

  it('requires the confirmation and that both match', () => {
    expect(Object.keys(validatePasswordChange({ currentPassword: TEMP, newPassword: NEW, confirmPassword: '48271937' })))
      .toEqual(['confirmPassword'])
    expect(Object.keys(validatePasswordChange({ currentPassword: TEMP, newPassword: NEW, confirmPassword: '' })))
      .toEqual(['confirmPassword'])
  })
})

describe('validatePasswordChange (HR Admins keep the longer rule)', () => {
  it('needs at least 12 characters, not 8 digits', () => {
    expect(validatePasswordChange({ currentPassword: TEMP, newPassword: NEW, confirmPassword: NEW }, 'hr').newPassword)
      .toBe('Use at least 12 characters.')
    const ok = 'Hr-New-Passw0rd-2026'
    expect(validatePasswordChange({ currentPassword: TEMP, newPassword: ok, confirmPassword: ok }, 'hr')).toEqual({})
  })
})

describe('changePassword', () => {
  it('posts the current password and the new one twice, with the token; 204 is success', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await changePassword(TOKEN, { currentPassword: TEMP, newPassword: NEW, confirmPassword: NEW })

    expect(result.ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/auth/change-password')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    expect(JSON.parse(init.body as string)).toEqual({ currentPassword: TEMP, newPassword: NEW, confirmPassword: NEW })
  })

  it('returns the server field error for a wrong current password', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ status: 400, error: 'Invalid request', fields: { currentPassword: 'Your current password is not correct.' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })))

    const result = await changePassword(TOKEN, { currentPassword: 'wrong', newPassword: NEW, confirmPassword: NEW })

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
