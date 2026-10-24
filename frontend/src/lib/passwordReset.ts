// "Forgot password" (public, before sign-in): /api/auth/password-reset.
//
// 1. status: is reset by email set up on the server? If not, the app says
//    "Contact HR" instead of pretending to send anything.
// 2. request: the server emails a 6-digit code to the account's registered
//    address. The answer is the same whether or not the ID exists.
// 3. confirm: the code plus the new password (typed twice).
//
// Nothing here is stored or logged; the code and passwords stay in React state.
import { API_BASE } from './auth'
import { newPasswordProblem } from './password'

const TIMEOUT_MS = 15_000

/** Messages keyed by request field (username, code, newPassword, confirmPassword). */
export type FieldErrors = Record<string, string>

export type ResetResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; fields: FieldErrors; kind: 'validation' | 'unavailable' | 'rate-limited' | 'network' | 'server' }

const NETWORK = 'Can’t connect to RIGHTSKU. Check your connection and try again.'
const SERVER = 'Something went wrong on the server. Try again in a moment.'

async function call<T>(path: string, init: RequestInit): Promise<ResetResult<T>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/auth/password-reset${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch {
    return { ok: false, kind: 'network', message: NETWORK, fields: {} }
  } finally {
    clearTimeout(timer)
  }

  let body: unknown = null
  try {
    const text = await response.text()
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (response.ok) return { ok: true, data: body as T }

  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  const fields: FieldErrors = {}
  if (typeof record.fields === 'object' && record.fields !== null) {
    for (const [k, v] of Object.entries(record.fields as Record<string, unknown>)) {
      if (typeof v === 'string') fields[k] = v
    }
  }
  const serverMessage = typeof record.error === 'string' ? record.error : ''
  if (response.status === 400) {
    return { ok: false, kind: 'validation', message: serverMessage || 'Check the highlighted fields.', fields }
  }
  if (response.status === 503) {
    return { ok: false, kind: 'unavailable', message: serverMessage || RESET_NOT_SET_UP, fields }
  }
  if (response.status === 429) {
    return { ok: false, kind: 'rate-limited', message: 'Too many tries. Wait a few minutes, then try again.', fields }
  }
  return { ok: false, kind: 'server', message: SERVER, fields }
}

export const RESET_NOT_SET_UP =
  'Ask HR to reset your password. They’ll give you a temporary password, and you’ll choose your own as soon as you sign in.'

export function getResetStatus() {
  return call<{ emailDelivery: boolean }>('', { method: 'GET' })
}

export function requestResetCode(username: string) {
  return call<{ message: string }>('/request', { method: 'POST', body: JSON.stringify({ username: username.trim() }) })
}

export function confirmReset(values: { username: string; code: string; newPassword: string; confirmPassword: string }) {
  return call<null>('/confirm', {
    method: 'POST',
    body: JSON.stringify({ ...values, username: values.username.trim(), code: values.code.trim() }),
  })
}

/**
 * Checks the form before sending, with the same password rules as changing a
 * password: HR Admins (who reset with their email) need 12+ characters,
 * employees 8+. The server checks everything again.
 */
export function checkResetForm(values: {
  username: string
  code: string
  newPassword: string
  confirmPassword: string
}): FieldErrors {
  const errors: FieldErrors = {}
  if (!/^\d{6}$/.test(values.code.trim())) errors.code = 'Enter the 6-digit code from the email.'
  const problem = newPasswordProblem(values.newPassword, values.username.includes('@') ? 'hr' : 'employee')
  if (problem) errors.newPassword = problem
  if (!values.confirmPassword) errors.confirmPassword = 'Enter the new password again.'
  else if (values.confirmPassword !== values.newPassword) errors.confirmPassword = 'The two new passwords don’t match.'
  return errors
}
