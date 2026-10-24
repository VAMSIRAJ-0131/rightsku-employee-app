import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateTemporaryPassword, resetEmployeePassword, validateResetPassword } from './employees'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('validateResetPassword', () => {
  const ok = { temporaryPassword: 'Kq7m-Xt4P-wR9b', confirmPassword: 'Kq7m-Xt4P-wR9b' }

  it('accepts a 12+ character password typed twice', () => {
    expect(validateResetPassword(ok)).toEqual({})
  })

  it('names each problem, with the same rules as the server', () => {
    expect(validateResetPassword({ temporaryPassword: '', confirmPassword: '' })).toEqual({
      temporaryPassword: 'Enter a temporary password.',
      confirmPassword: 'Enter the temporary password again.',
    })
    expect(validateResetPassword({ temporaryPassword: 'short', confirmPassword: 'short' }).temporaryPassword).toMatch(/12 characters/)
    expect(validateResetPassword({ ...ok, temporaryPassword: ' Kq7m-Xt4P-wR9b' }).temporaryPassword).toMatch(/spaces/)
    expect(validateResetPassword({ ...ok, confirmPassword: 'Kq7m-Xt4P-wR9c' }).confirmPassword).toMatch(/don’t match/)
  })
})

describe('generateTemporaryPassword', () => {
  it('makes a 14-character password from easy-to-read characters that passes the rules', () => {
    for (let i = 0; i < 100; i++) {
      const pw = generateTemporaryPassword()
      expect(pw).toMatch(/^[A-HJ-NP-Za-km-z2-9]{4}-[A-HJ-NP-Za-km-z2-9]{4}-[A-HJ-NP-Za-km-z2-9]{4}$/)
      expect(validateResetPassword({ temporaryPassword: pw, confirmPassword: pw })).toEqual({})
    }
  })

  it('uses the secure random source and skips biased values', () => {
    const bytes = [255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]   // 255 is above the unbiased range and is skipped
    let i = 0
    const pw = generateTemporaryPassword((b) => {
      b[0] = bytes[i++ % bytes.length]
      return b
    })
    expect(pw).toBe('ABCD-EFGH-JKLM')
  })
})

describe('resetEmployeePassword', () => {
  it('posts both fields to the HR endpoint with the token', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await resetEmployeePassword('t', 5, { temporaryPassword: 'Kq7m-Xt4P-wR9b', confirmPassword: 'Kq7m-Xt4P-wR9b' })

    expect(result.ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/hr/employees/5/reset-password')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t')
  })
})
