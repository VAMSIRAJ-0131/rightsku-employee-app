import { afterEach, describe, expect, it, vi } from 'vitest'
import { changePassword, validatePasswordChange } from './password'
import { parseLoginResponse } from './auth'

// Test-only values.
const TEMP = 'Temporary-Passw0rd!'
const NEW = 'Vamsi@90'
const TOKEN = 'test-only-token'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('validatePasswordChange (employees: at least 8 characters)', () => {
  it('accepts 8 characters with letters and symbols, longer passwords and digits only', () => {
    for (const ok of ['Vamsi@90', 'Welcome@123', 'a much longer pass phrase!', '48271936']) {
      expect(validatePasswordChange({ currentPassword: TEMP, newPassword: ok, confirmPassword: ok }), ok).toEqual({})
    }
  })

  it('refuses passwords shorter than 8 characters, with the agreed message', () => {
    for (const short of ['Vams@90', '1234567', 'abc', '', '        ']) {
      const errors = validatePasswordChange({ currentPassword: TEMP, newPassword: short, confirmPassword: short })
      expect(errors.newPassword, `'${short}'`).toBe('Password must contain at least 8 characters.')
    }
  })

  it('still refuses leading or trailing spaces', () => {
    expect(validatePasswordChange({ currentPassword: TEMP, newPassword: ' Vamsi@90', confirmPassword: ' Vamsi@90' }).newPassword)
      .toBeDefined()
  })

  it('requires the current password', () => {
    expect(validatePasswordChange({ currentPassword: '', newPassword: NEW, confirmPassword: NEW }).currentPassword).toBeDefined()
  })

  it('refuses reusing the current password', () => {
    const errors = validatePasswordChange({ currentPassword: NEW, newPassword: NEW, confirmPassword: NEW })
    expect(Object.keys(errors)).toEqual(['newPassword'])
  })

  it('requires the confirmation and that both match', () => {
    expect(Object.keys(validatePasswordChange({ currentPassword: TEMP, newPassword: NEW, confirmPassword: 'Vamsi@91' })))
      .toEqual(['confirmPassword'])
    expect(Object.keys(validatePasswordChange({ currentPassword: TEMP, newPassword: NEW, confirmPassword: '' })))
      .toEqual(['confirmPassword'])
  })
})

describe('validatePasswordChange (HR Admins keep the longer rule)', () => {
  it('needs at least 12 characters', () => {
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
