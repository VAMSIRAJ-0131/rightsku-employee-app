// Authorized calls to the RIGHTSKU backend.
//
// The JWT is passed in by the caller (it lives in React state only) and sent
// as a Bearer header. Errors are turned into plain, safe messages; server
// response text is only shown when it is one of our own JSON error messages.
import { API_BASE } from './auth'

const REQUEST_TIMEOUT_MS = 15_000

export type ApiErrorKind =
  | 'unauthorized' // 401: token missing, expired or no longer valid
  | 'forbidden' // 403: signed in, but not allowed
  | 'not-found' // 404
  | 'conflict' // 409: e.g. Employee ID or email already used
  | 'validation' // 400: field errors
  | 'network' // no response or timed out
  | 'server' // 5xx
  | 'unexpected'

export interface ApiError {
  kind: ApiErrorKind
  message: string
  /** Per-field messages from the server (400/409), keyed by request field name. */
  fields: Record<string, string>
}

export type ApiResult<T> = { ok: true; data: T; status: number } | { ok: false; error: ApiError }

const DEFAULT_MESSAGES: Record<ApiErrorKind, string> = {
  unauthorized: 'Your session has ended. Sign in again.',
  forbidden: 'You don’t have permission to do that.',
  'not-found': 'That record no longer exists.',
  conflict: 'This conflicts with existing data.',
  validation: 'Check the highlighted fields.',
  network: 'Can’t connect to RIGHTSKU. Check your connection and try again.',
  server: 'Something went wrong on the server. Try again in a moment.',
  unexpected: 'Something went wrong. Try again.',
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not-found'
  if (status === 409) return 'conflict'
  if (status === 400) return 'validation'
  if (status >= 500) return 'server'
  return 'unexpected'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Reads our backend's {"error": "...", "fields": {...}} body, if present. */
function readErrorBody(body: unknown): { message?: string; fields: Record<string, string> } {
  const fields: Record<string, string> = {}
  if (!isRecord(body)) return { fields }
  if (isRecord(body.fields)) {
    for (const [key, value] of Object.entries(body.fields)) {
      if (typeof value === 'string') fields[key] = value
    }
  }
  const message = typeof body.error === 'string' ? body.error : undefined
  return { message, fields }
}

export async function apiRequest<T>(
  path: string,
  options: { token: string; method?: 'GET' | 'POST' | 'PUT'; body?: unknown; signal?: AbortSignal },
): Promise<ApiResult<T>> {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const onOuterAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onOuterAbort)

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${options.token}`,
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch {
    return { ok: false, error: { kind: 'network', message: DEFAULT_MESSAGES.network, fields: {} } }
  } finally {
    globalThis.clearTimeout(timer)
    options.signal?.removeEventListener('abort', onOuterAbort)
  }

  let body: unknown = null
  try {
    const text = await response.text()
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }

  if (response.ok) {
    return { ok: true, data: body as T, status: response.status }
  }

  const kind = kindForStatus(response.status)
  const { message, fields } = readErrorBody(body)
  // Only our own short JSON messages are shown; 5xx and 401/403 always use fixed text.
  const useServerMessage = message && (kind === 'validation' || kind === 'conflict' || kind === 'not-found')
  return {
    ok: false,
    error: { kind, message: useServerMessage ? message : DEFAULT_MESSAGES[kind], fields },
  }
}
