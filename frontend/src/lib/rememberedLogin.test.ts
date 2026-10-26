import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  isNative: true,
  store: new Map<string, string>(),
  isAvailable: vi.fn(),
  verifyIdentity: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.isNative } }))
vi.mock('@capgo/capacitor-native-biometric', () => ({
  BiometryType: { FINGERPRINT: 3, FACE_AUTHENTICATION: 4, IRIS_AUTHENTICATION: 5, DEVICE_CREDENTIAL: 7 },
  NativeBiometric: {
    isDataSaved: async ({ key }: { key: string }) => ({ isSaved: native.store.has(key) }),
    getData: async ({ key }: { key: string }) => ({ value: native.store.get(key) ?? '' }),
    setData: async ({ key, value }: { key: string; value: string }) => void native.store.set(key, value),
    deleteData: async ({ key }: { key: string }) => void native.store.delete(key),
    isAvailable: native.isAvailable,
    verifyIdentity: native.verifyIdentity,
  },
}))

import { login, parseLoginResponse } from './auth'
import {
  canRememberLogin, forgetRefreshToken, loadRefreshToken, refreshSession, rememberThisPhone, revokeOnServer, saveRefreshToken,
} from './rememberedLogin'
import {
  clearLockSettings, fingerprintAvailable, isValidPin, loadLockSettings, lockLabel, pinMatches, saveLockSettings,
  setSetupDeclined, settingsFor, verifyFingerprint, wasSetupDeclined,
} from './appLock'
import { isEasyPin } from '../screens/UnlockSetup'

// Test-only values.
const TOKEN = 'test-only-token'
const REFRESH = 'test-only-refresh-token'
const SESSION_BODY = { token: TOKEN, tokenType: 'Bearer', userId: 2, loginId: 'EMP001', email: 'emp@rightsku.com', role: 'EMPLOYEE', mustChangePassword: false }

function respond(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  native.isNative = true
  native.store.clear()
  native.isAvailable.mockReset().mockResolvedValue({ isAvailable: true, deviceIsSecure: true })
  native.verifyIdentity.mockReset().mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllGlobals())

describe('remembered sign-in on the phone', () => {
  it('is only possible inside the app, never in a browser', async () => {
    expect(canRememberLogin()).toBe(true)
    native.isNative = false
    expect(canRememberLogin()).toBe(false)
    expect(await saveRefreshToken(REFRESH)).toBe(false)
    expect(await loadRefreshToken()).toBeNull()
    expect(await loadLockSettings()).toBeNull()
  })

  it('keeps the refresh token in the encrypted store until it is forgotten', async () => {
    expect(await loadRefreshToken()).toBeNull()
    await saveRefreshToken(REFRESH)
    expect(await loadRefreshToken()).toBe(REFRESH)
    await forgetRefreshToken()
    expect(await loadRefreshToken()).toBeNull()
  })

  it('signing in never asks to be remembered; the app asks only after the lock is set up', async () => {
    const loginFetch = respond(200, SESSION_BODY)
    await login('EMP001', 'x')
    const [, loginInit] = loginFetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(loginInit.body as string)).toEqual({ username: 'EMP001', password: 'x' })
    expect(parseLoginResponse(SESSION_BODY)?.refreshToken).toBeNull()

    const rememberFetch = respond(200, { refreshToken: REFRESH })
    expect(await rememberThisPhone(TOKEN)).toBe(REFRESH)
    const [url, init] = rememberFetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/auth/remember-device')
    expect(init.method).toBe('POST')
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`)

    respond(403, { error: 'x' })
    expect(await rememberThisPhone(TOKEN)).toBeNull()
  })
})

describe('refreshSession', () => {
  it('returns a new session, keeping the same refresh token', async () => {
    const fetchMock = respond(200, { ...SESSION_BODY, refreshToken: REFRESH })
    const result = await refreshSession(REFRESH)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/auth/refresh')
    expect(JSON.parse(init.body as string)).toEqual({ refreshToken: REFRESH })
    expect(result.ok && result.session.token).toBe(TOKEN)
    expect(result.ok && result.session.refreshToken).toBe(REFRESH)
  })

  it('says "ended" when the server refuses it, and "network" when it can not be reached', async () => {
    respond(401, { error: 'x' })
    expect(await refreshSession(REFRESH)).toEqual({ ok: false, reason: 'ended' })
    respond(503, { error: 'x' })
    expect(await refreshSession(REFRESH)).toEqual({ ok: false, reason: 'network' })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    expect(await refreshSession(REFRESH)).toEqual({ ok: false, reason: 'network' })
  })

  it('logs out on the server with the refresh token, and never fails when offline', async () => {
    const fetchMock = respond(204, undefined)
    await revokeOnServer(REFRESH)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/auth/logout')
    expect(JSON.parse(init.body as string)).toEqual({ refreshToken: REFRESH })
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    await expect(revokeOnServer(REFRESH)).resolves.toBeUndefined()
  })
})

describe('app lock', () => {
  it('accepts exactly four digits and refuses PINs anyone would guess', () => {
    expect(isValidPin('4826')).toBe(true)
    expect(isValidPin('123')).toBe(false)
    expect(isValidPin('12a4')).toBe(false)
    expect(isEasyPin('1111')).toBe(true)
    expect(isEasyPin('1234')).toBe(true)
    expect(isEasyPin('9876')).toBe(true)
    expect(isEasyPin('4826')).toBe(false)
  })

  it('stores only a salted hash of the PIN and checks it', async () => {
    const settings = await settingsFor('pin', '4826')
    expect(JSON.stringify(settings)).not.toContain('4826')
    expect(await pinMatches(settings, '4826')).toBe(true)
    expect(await pinMatches(settings, '4827')).toBe(false)
    // Same PIN, new salt: a different hash.
    expect((await settingsFor('pin', '4826')).pinHash).not.toBe(settings.pinHash)
  })

  it('saves, loads and clears the lock settings', async () => {
    expect(await loadLockSettings()).toBeNull()
    const settings = await settingsFor('fingerprint', '4826')
    await saveLockSettings(settings)
    expect(await loadLockSettings()).toEqual(settings)
    await clearLockSettings()
    expect(await loadLockSettings()).toBeNull()
  })

  it('remembers "Not now" until the lock is turned on', async () => {
    expect(await wasSetupDeclined()).toBe(false)
    await setSetupDeclined(true)
    expect(await wasSetupDeclined()).toBe(true)
    await setSetupDeclined(false)
    expect(await wasSetupDeclined()).toBe(false)
  })

  it('asks for the fingerprint only (the app PIN is the backup, not the phone PIN)', async () => {
    expect(await fingerprintAvailable()).toBe(true)
    expect(await verifyFingerprint()).toBe(true)
    const options = native.verifyIdentity.mock.calls[0][0] as { allowedBiometryTypes: number[]; negativeButtonText: string }
    expect(options.allowedBiometryTypes).toEqual([3, 4, 5])
    expect(options.negativeButtonText).toBe('Use PIN')
    native.verifyIdentity.mockRejectedValue(new Error('cancelled'))
    expect(await verifyFingerprint()).toBe(false)
    native.isAvailable.mockResolvedValue({ isAvailable: false, deviceIsSecure: true })
    expect(await fingerprintAvailable()).toBe(false)
  })

  it('describes the lock for Profile', () => {
    expect(lockLabel('fingerprint')).toBe('Fingerprint and PIN')
    expect(lockLabel('pin')).toBe('4-digit PIN')
    expect(lockLabel(null)).toBe('Off')
  })
})
