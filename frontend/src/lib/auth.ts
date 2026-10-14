// Real sign-in against the Spring Boot backend: POST /api/auth/login.
//
// Employees sign in with their Employee ID (e.g. EMP001); HR Admins sign in
// with their work email. Both go in the same "username" field; the backend
// decides which lookup to use and accepts email only for HR Admins.
//
// Security notes:
// - The JWT is returned to the caller and kept in React state (memory) only.
//   It is never written to localStorage, sessionStorage, cookies or logs.
// - Error results carry a reason code only, never response bodies, so no
//   server details or tokens can end up on screen.
import type { Employee, Role } from '../data/types'

/**
 * Where the API lives. Empty in development: the Vite dev server proxies
 * /api to http://localhost:8080 (see vite.config.ts). For a build that runs
 * elsewhere (e.g. the Android app), set VITE_API_BASE_URL at build time.
 */
export const API_BASE = String(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

const LOGIN_TIMEOUT_MS = 15_000

/** Same Employee ID rule as the backend (AppUser.normalizeLoginId) and the database. */
const EMPLOYEE_ID_FORMAT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$/
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Checks what was typed in the sign-in field before calling the server.
 * Returns the trimmed value to send, or an error message to show.
 * Upper/lower case does not matter: the server treats emp001 as EMP001.
 */
export function checkLoginInput(
  username: string,
  password: string,
): { ok: true; username: string } | { ok: false; message: string } {
  const value = username.trim()
  if (!value || !password) return { ok: false, message: 'Enter your Employee ID and password to sign in.' }
  if (value.includes('@')) {
    return EMAIL_FORMAT.test(value)
      ? { ok: true, username: value }
      : { ok: false, message: 'Enter a valid work email, like name@rightsku.com.' }
  }
  return EMPLOYEE_ID_FORMAT.test(value)
    ? { ok: true, username: value }
    : { ok: false, message: 'Enter a valid Employee ID, like EMP001.' }
}

export interface AuthSession {
  /** JWT for later API calls. Memory only; never displayed or stored. */
  token: string
  userId: number
  /** Employee ID (null for HR Admins, who sign in by email). */
  loginId: string | null
  email: string
  role: Role
  /**
   * True while the account still has the temporary password HR gave out.
   * The app then shows only the "choose a new password" screen; the server
   * also refuses every other request made with this token.
   */
  mustChangePassword: boolean
  /** What the dashboards show. Only fields the backend provides are filled. */
  profile: Employee
}

export type LoginFailure =
  | 'invalid-credentials' // 401: wrong ID/email or password, unknown or inactive account
  | 'invalid-request' // 400: the server rejected the request body
  | 'rate-limited' // 429: too many failed sign-ins; wait before trying again
  | 'network' // no response: offline, server unreachable, or timed out
  | 'server' // 5xx: server error (also what the dev proxy returns if the backend is stopped)
  | 'unexpected-response' // any other status, or a response missing required fields

export type LoginResult =
  | { ok: true; session: AuthSession }
  | { ok: false; reason: LoginFailure; retryAfterSeconds?: number }

/** Backend role names mapped to the frontend's dashboard roles. Unknown roles are refused. */
export function mapBackendRole(role: unknown): Role | null {
  if (role === 'HR_ADMIN') return 'hr'
  if (role === 'EMPLOYEE') return 'employee'
  return null
}

/**
 * Builds the dashboard profile from the login response. The backend does not
 * send name, department, etc. yet, so those stay empty rather than invented.
 */
export function profileFromAuth(userId: number, loginId: string | null, email: string, role: Role): Employee {
  return {
    id: loginId ?? `USER-${userId}`,
    name: email,
    department: '',
    designation: role === 'hr' ? 'HR Admin' : '',
    joiningDate: '',
    email,
    phone: '',
    location: '',
    manager: '',
    active: true,
    role,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Checks the shape of a successful login response and turns it into a session. */
export function parseLoginResponse(data: unknown): AuthSession | null {
  if (!isRecord(data)) return null
  const { token, email, userId, role, loginId, mustChangePassword } = data
  const mappedRole = mapBackendRole(role)
  if (typeof token !== 'string' || token.length === 0) return null
  if (typeof email !== 'string' || email.length === 0) return null
  if (typeof userId !== 'number' || !Number.isFinite(userId)) return null
  if (!mappedRole) return null
  if (loginId !== undefined && loginId !== null && typeof loginId !== 'string') return null
  if (mustChangePassword !== undefined && typeof mustChangePassword !== 'boolean') return null
  const id = typeof loginId === 'string' && loginId.length > 0 ? loginId : null
  // Employees always have an Employee ID; refuse a response that says otherwise.
  if (mappedRole === 'employee' && !id) return null
  return {
    token,
    userId,
    loginId: id,
    email,
    role: mappedRole,
    mustChangePassword: mustChangePassword === true,
    profile: profileFromAuth(userId, id, email, mappedRole),
  }
}

/** username: Employee ID for employees, or work email for HR Admins. */
export async function login(username: string, password: string): Promise<LoginResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch {
    return { ok: false, reason: 'network' }
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 401) return { ok: false, reason: 'invalid-credentials' }
  if (response.status === 400) return { ok: false, reason: 'invalid-request' }
  if (response.status === 429) {
    const seconds = Number(response.headers.get('Retry-After'))
    return {
      ok: false,
      reason: 'rate-limited',
      retryAfterSeconds: Number.isFinite(seconds) && seconds > 0 ? seconds : undefined,
    }
  }
  if (response.status >= 500) return { ok: false, reason: 'server' }
  if (!response.ok) return { ok: false, reason: 'unexpected-response' }

  let data: unknown
  try {
    data = await response.json()
  } catch {
    return { ok: false, reason: 'unexpected-response' }
  }

  const session = parseLoginResponse(data)
  return session ? { ok: true, session } : { ok: false, reason: 'unexpected-response' }
}

/** Plain-language messages for each failure. They never include server text. */
export const LOGIN_ERROR_MESSAGES: Record<LoginFailure, string> = {
  'invalid-credentials':
    'Those sign-in details don’t match. Check your Employee ID (HR Admins: work email) and password.',
  'invalid-request': 'The server couldn’t read this sign-in. Try again, or contact HR if it keeps happening.',
  'rate-limited': 'Too many sign-in attempts. Wait a few minutes, then try again.',
  network: 'Can’t connect to RIGHTSKU. Check your internet connection and try again.',
  server: 'Sign-in is temporarily unavailable. Try again in a few minutes.',
  'unexpected-response': 'Something went wrong while signing in. Try again.',
}

/** Error text for a failed sign-in, including the wait time when the server gives one. */
export function loginErrorMessage(reason: LoginFailure, retryAfterSeconds?: number): string {
  if (reason === 'rate-limited' && retryAfterSeconds) {
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
    return `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
  }
  return LOGIN_ERROR_MESSAGES[reason]
}
