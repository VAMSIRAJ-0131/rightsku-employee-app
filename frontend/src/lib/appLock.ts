// App lock for the Android app: the person chooses to stay signed in on this
// phone by setting up a 4-digit app PIN, or fingerprint with that PIN as the
// backup. Nothing is remembered until they do. The PIN itself is never stored:
// only a salted PBKDF2 hash, kept (with the rest of the lock settings) in the
// phone's encrypted storage. After MAX_PIN_ATTEMPTS wrong PINs in a row the
// remembered sign-in is removed and the person signs in with their password.
import { BiometryType, NativeBiometric } from '@capgo/capacitor-native-biometric'
import { canRememberLogin } from './rememberedLogin'

export const PIN_LENGTH = 4
export const MAX_PIN_ATTEMPTS = 5
const PBKDF2_ITERATIONS = 150_000

const LOCK_KEY = 'rightcentral.applock'
const DECLINED_KEY = 'rightcentral.applock.declined'

export type LockMethod = 'pin' | 'fingerprint'

export interface AppLockSettings {
  method: LockMethod
  /** Base64 salt and PBKDF2-SHA256 hash of the PIN. */
  salt: string
  pinHash: string
  /** Wrong PINs in a row since the last correct one. */
  failedAttempts: number
}

/* ---------- PIN ---------- */

/** Exactly four digits. */
export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0))
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256)
  return toBase64(new Uint8Array(bits))
}

/** New settings for this PIN (fresh random salt). */
export async function settingsFor(method: LockMethod, pin: string): Promise<AppLockSettings> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { method, salt: toBase64(salt), pinHash: await derive(pin, salt), failedAttempts: 0 }
}

/** Whether the PIN matches, compared without stopping at the first difference. */
export async function pinMatches(settings: AppLockSettings, pin: string): Promise<boolean> {
  if (!isValidPin(pin)) return false
  const hash = await derive(pin, fromBase64(settings.salt))
  if (hash.length !== settings.pinHash.length) return false
  let diff = 0
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ settings.pinHash.charCodeAt(i)
  return diff === 0
}

/* ---------- Stored settings (encrypted on the phone) ---------- */

async function read(key: string): Promise<string | null> {
  try {
    const { isSaved } = await NativeBiometric.isDataSaved({ key })
    if (!isSaved) return null
    return (await NativeBiometric.getData({ key })).value || null
  } catch {
    return null
  }
}

/** The lock set up on this phone, or null (none, or unreadable). */
export async function loadLockSettings(): Promise<AppLockSettings | null> {
  if (!canRememberLogin()) return null
  const raw = await read(LOCK_KEY)
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as AppLockSettings
    return (s.method === 'pin' || s.method === 'fingerprint') && s.salt && s.pinHash ? s : null
  } catch {
    return null
  }
}

export async function saveLockSettings(settings: AppLockSettings): Promise<boolean> {
  try {
    await NativeBiometric.setData({ key: LOCK_KEY, value: JSON.stringify(settings) })
    return true
  } catch {
    return false
  }
}

export async function clearLockSettings(): Promise<void> {
  try {
    await NativeBiometric.deleteData({ key: LOCK_KEY })
  } catch {
    // Nothing saved.
  }
}

/** The person chose "Not now": don't offer the setup after every sign-in. */
export async function wasSetupDeclined(): Promise<boolean> {
  return canRememberLogin() && (await read(DECLINED_KEY)) === '1'
}

export async function setSetupDeclined(declined: boolean): Promise<void> {
  try {
    if (declined) await NativeBiometric.setData({ key: DECLINED_KEY, value: '1' })
    else await NativeBiometric.deleteData({ key: DECLINED_KEY })
  } catch {
    // Best effort: at worst the offer shows again after the next sign-in.
  }
}

/* ---------- Fingerprint ---------- */

/** Whether this phone has a fingerprint (or face) the app can use. */
export async function fingerprintAvailable(): Promise<boolean> {
  if (!canRememberLogin()) return false
  try {
    const result = await NativeBiometric.isAvailable({ useFallback: false })
    return result.isAvailable
  } catch {
    return false
  }
}

/** Fingerprint (or face) only: the app's own PIN is the backup, not the phone's. */
export async function verifyFingerprint(title = 'Unlock RightCentral'): Promise<boolean> {
  try {
    await NativeBiometric.verifyIdentity({
      title,
      subtitle: 'Touch the fingerprint sensor',
      reason: title,
      negativeButtonText: 'Use PIN',
      allowedBiometryTypes: [BiometryType.FINGERPRINT, BiometryType.FACE_AUTHENTICATION, BiometryType.IRIS_AUTHENTICATION],
    })
    return true
  } catch {
    return false
  }
}

/** "Fingerprint and PIN", "PIN" or "Off", for Profile. */
export function lockLabel(method: LockMethod | null): string {
  return method === 'fingerprint' ? 'Fingerprint and PIN' : method === 'pin' ? '4-digit PIN' : 'Off'
}
