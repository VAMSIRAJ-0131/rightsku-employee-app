import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from './api'

const TOKEN = 'test-only-token'

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn(async () =>
    new Response(body === undefined ? '' : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiRequest', () => {
  it('sends the token as a Bearer header and returns the data', async () => {
    const fetchMock = respond(200, { id: 5 })

    const result = await apiRequest<{ id: number }>('/api/hr/employees/5', { token: TOKEN })

    expect(result).toEqual({ ok: true, data: { id: 5 }, status: 200 })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/hr/employees/5')
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    expect(init.credentials).toBe('omit')
  })

  it('sends JSON bodies with a content type', async () => {
    const fetchMock = respond(201, { id: 1 })

    await apiRequest('/api/hr/employees', { token: TOKEN, method: 'POST', body: { firstName: 'Ravi' } })

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{"firstName":"Ravi"}')
  })

  it('maps 409 to a conflict with the server message and field errors', async () => {
    respond(409, { status: 409, error: 'This Employee ID is already in use.', fields: { employeeCode: 'This Employee ID is already in use.' } })

    const result = await apiRequest('/api/hr/employees', { token: TOKEN, method: 'POST', body: {} })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('conflict')
      expect(result.error.message).toBe('This Employee ID is already in use.')
      expect(result.error.fields).toEqual({ employeeCode: 'This Employee ID is already in use.' })
    }
  })

  it('maps 400 field errors', async () => {
    respond(400, { status: 400, error: 'Invalid request', fields: { email: 'Enter a valid email address' } })

    const result = await apiRequest('/api/hr/employees', { token: TOKEN, method: 'POST', body: {} })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('validation')
      expect(result.error.fields.email).toBe('Enter a valid email address')
    }
  })

  it('uses fixed text for 401 so the user is asked to sign in again', async () => {
    respond(401, { error: 'some server detail' })

    const result = await apiRequest('/api/hr/employees', { token: TOKEN })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('unauthorized')
      expect(result.error.message).toBe('Your session has ended. Sign in again.')
    }
  })

  it('never shows server text for 5xx errors', async () => {
    respond(500, { error: 'NullPointerException at com.rightsku...' })

    const result = await apiRequest('/api/hr/employees', { token: TOKEN })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('server')
      expect(result.error.message).not.toContain('NullPointerException')
    }
  })

  it('reports network failures without exposing the token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))

    const result = await apiRequest('/api/hr/employees', { token: TOKEN })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('network')
      expect(JSON.stringify(result)).not.toContain(TOKEN)
    }
  })

  it('handles an empty or non-JSON error body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })))

    const result = await apiRequest('/api/hr/employees', { token: TOKEN })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe('server')
      expect(result.error.message).not.toContain('html')
    }
  })
})
