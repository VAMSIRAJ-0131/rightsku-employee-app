import { afterEach, describe, expect, it, vi } from 'vitest'
import { PHOTO_MAX_BYTES, checkPhotoFile, loadMyPhoto, uploadEmployeePhoto } from './photos'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('checkPhotoFile', () => {
  it('accepts JPG and PNG up to 2 MB', () => {
    expect(checkPhotoFile({ type: 'image/jpeg', size: 1000 })).toBeNull()
    expect(checkPhotoFile({ type: 'image/png', size: PHOTO_MAX_BYTES })).toBeNull()
  })

  it('refuses other types, empty files and files over 2 MB', () => {
    expect(checkPhotoFile({ type: 'application/pdf', size: 1000 })).toBe('Choose a JPG or PNG photo.')
    expect(checkPhotoFile({ type: 'image/svg+xml', size: 1000 })).toBe('Choose a JPG or PNG photo.')
    expect(checkPhotoFile({ type: 'image/png', size: 0 })).toMatch(/empty/)
    expect(checkPhotoFile({ type: 'image/png', size: PHOTO_MAX_BYTES + 1 })).toMatch(/larger than 2 MB/)
  })
})

describe('photo API calls', () => {
  it('HR uploads with PUT and multipart form data to the HR endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'me.jpg', { type: 'image/jpeg' })
    const result = await uploadEmployeePhoto('t', 10, file)

    expect(result.ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/hr/employees/10/photo')
    expect(init.method).toBe('PUT')
    expect(init.body).toBeInstanceOf(FormData)
  })

  it('an employee without a photo gets null (initials), not an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"No photo yet."}', { status: 404 })))
    const result = await loadMyPhoto('t')
    expect(result).toEqual({ ok: true, data: null, status: 404 })
  })

  it('an employee with a photo gets an object URL from their own endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob([new Uint8Array([1, 2])]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:photo' })

    const result = await loadMyPhoto('t')

    expect(result.ok && result.data).toBe('blob:photo')
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/api/employee/profile/photo')
  })
})
