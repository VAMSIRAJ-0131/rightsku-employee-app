import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkResetForm, confirmReset, getResetStatus, requestResetCode } from './passwordReset'

afterEach(() => {
  vi.unstubAllGlobals()
})

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

describe('checkResetForm', () => {
  const ok = { username: '10002', code: '123456', newPassword: 'Test-Only-1', confirmPassword: 'Test-Only-1' }

  it('accepts a 6-digit code and matching passwords', () => {
    expect(checkResetForm(ok)).toEqual({})
  })

  it('names each problem', () => {
    expect(checkResetForm({ ...ok, code: '12a456' }).code).toMatch(/6-digit/)
    expect(checkResetForm({ ...ok, newPassword: 'short', confirmPassword: 'short' }).newPassword).toMatch(/8 characters/)
    expect(checkResetForm({ ...ok, confirmPassword: 'Other-Pass-1' }).confirmPassword).toMatch(/don’t match/)
  })

  it('uses the 12-character rule for HR Admins, who reset with their email', () => {
    const hr = { ...ok, username: 'hr@rightsku.com', newPassword: 'Short-Pass1', confirmPassword: 'Short-Pass1' }
    expect(checkResetForm(hr).newPassword).toMatch(/12 characters/)
  })
})

describe('password reset API', () => {
  it('reads whether email delivery is set up, without a token', async () => {
    const fetchMock = vi.fn(async () => json(200, { emailDelivery: false }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getResetStatus()

    expect(result).toEqual({ ok: true, data: { emailDelivery: false } })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/auth/password-reset')
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })

  it('sends the trimmed ID and returns the server’s fixed message', async () => {
    const fetchMock = vi.fn(async () => json(202, { message: 'If this ID belongs to an active account, …' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestResetCode('  10002 ')

    expect(result.ok && result.data.message).toMatch(/If this ID belongs/)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/auth/password-reset/request')
    expect(JSON.parse(init.body as string)).toEqual({ username: '10002' })
  })

  it('reports "not set up" (503) honestly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(503, { error: 'Password reset by email is not set up yet. Contact HR to reset your password.' })))
    const result = await requestResetCode('10002')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.kind).toBe('unavailable')
      expect(result.message).toMatch(/not set up/)
    }
  })

  it('passes the generic code error to the code field', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(400, { error: 'x', fields: { code: 'This code is wrong or has expired.' } })))
    const result = await confirmReset({ username: '10002', code: ' 123456 ', newPassword: 'a', confirmPassword: 'a' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.fields.code).toMatch(/wrong or has expired/)
  })

  it('treats no response as a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    const result = await getResetStatus()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.kind).toBe('network')
  })
})
