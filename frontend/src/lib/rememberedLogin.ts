// "Stay signed in" for the Android app.
//
// Only after the person sets up an app lock (lib/appLock: a 4-digit PIN, or
// fingerprint with that PIN as backup) does the app ask the server for a
// refresh token (POST /api/auth/remember-device). It is kept encrypted on the
// phone (Android Keystore, via the native-biometric plugin) and never in
// localStorage, cookies or logs. When the app opens and is unlocked, the
// refresh token is swapped for a new sign-in token (POST /api/auth/refresh).
// Log out revokes it on the server and deletes it from the phone.
//
// In a web browser none of this applies: sign-in stays memory-only.
import { Capacitor } from '@capacitor/core'
import { NativeBiometric } from '@capgo/capacitor-native-biometric'
import { API_BASE, parseLoginResponse, type AuthSession } from './auth'
import { NGROK_HEADERS, apiRequest } from './api'

const STORAGE_KEY = 'rightcentral.session.refresh'
const REQUEST_TIMEOUT_MS = 15_000

/** Ask to unlock again after this long in the background. */
export const RELOCK_AFTER_MS = 5 * 60_000

/** True only inside the Android (or iOS) app, where the login can be remembered. */
export function canRememberLogin(): boolean {
  return Capacitor.isNativePlatform()
}

/** The refresh token kept on this phone, or null when there is none (or it can't be read). */
export async function loadRefreshToken(): Promise<string | null> {
  if (!canRememberLogin()) return null
  try {
    const { isSaved } = await NativeBiometric.isDataSaved({ key: STORAGE_KEY })
    if (!isSaved) return null
    const { value } = await NativeBiometric.getData({ key: STORAGE_KEY })
    return value || null
  } catch {
    return null
  }
}

export async function saveRefreshToken(token: string): Promise<boolean> {
  if (!canRememberLogin()) return false
  try {
    await NativeBiometric.setData({ key: STORAGE_KEY, value: token })
    return true
  } catch {
    return false
  }
}

export async function forgetRefreshToken(): Promise<void> {
  if (!canRememberLogin()) return
  try {
    await NativeBiometric.deleteData({ key: STORAGE_KEY })
  } catch {
    // Nothing saved: nothing to delete.
  }
}

/**
 * Asks the server to remember this phone (the person just set up an app lock).
 * Returns the refresh token to keep, or null when it could not be issued.
 */
export async function rememberThisPhone(token: string): Promise<string | null> {
  const result = await apiRequest<{ refreshToken?: unknown }>('/api/auth/remember-device', { token, method: 'POST' })
  return result.ok && typeof result.data.refreshToken === 'string' && result.data.refreshToken ? result.data.refreshToken : null
}

export type RefreshResult =
  | { ok: true; session: AuthSession }
  | { ok: false; reason: 'ended' | 'network' }

/**
 * A new sign-in for a remembered phone. 'ended' (401/400) means the remembered
 * login no longer works (logged out elsewhere, password changed, deactivated);
 * 'network' means try again later and keep the remembered login.
 */
export async function refreshSession(refreshToken: string): Promise<RefreshResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...NGROK_HEADERS },
      body: JSON.stringify({ refreshToken }),
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch {
    return { ok: false, reason: 'network' }
  } finally {
    clearTimeout(timer)
  }
  if (response.status === 401 || response.status === 400) return { ok: false, reason: 'ended' }
  if (!response.ok) return { ok: false, reason: 'network' }
  try {
    const session = parseLoginResponse(await response.json())
    // The server keeps the same refresh token; fall back to ours if it is left out.
    return session ? { ok: true, session: { ...session, refreshToken: session.refreshToken ?? refreshToken } } : { ok: false, reason: 'network' }
  } catch {
    return { ok: false, reason: 'network' }
  }
}

/** Tells the server this phone logged out. Best effort: the token is deleted from the phone anyway. */
export async function revokeOnServer(refreshToken: string): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...NGROK_HEADERS },
      body: JSON.stringify({ refreshToken }),
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch {
    // Offline: the phone forgets the login anyway; the server copy expires on its own.
  } finally {
    clearTimeout(timer)
  }
}

