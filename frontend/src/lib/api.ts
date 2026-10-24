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
  | 'too-large' // 413: uploaded file is over the size limit
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
  'too-large': 'This file is too large.',
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
  if (status === 413) return 'too-large'
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

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

interface RequestOptions {
  token: string
  method?: ApiMethod
  /** Sent as JSON, or as multipart form data when it is a FormData (file uploads). */
  body?: unknown
  signal?: AbortSignal
}

// Remote testing through a free ngrok tunnel: without this header ngrok answers
// app (browser-like) GET requests with its own warning page instead of the API.
// Sent only when the build's API address is an ngrok one.
const NGROK_HEADERS: Record<string, string> = /\.ngrok(-free)?\.(app|dev|io)$/.test(API_BASE.replace(/^https?:\/\//, '').split(/[/:]/)[0])
  ? { 'ngrok-skip-browser-warning': '1' }
  : {}

/** Sends the request; returns the response, or null when there was no response at all. */
async function send(path: string, options: RequestOptions, accept: string): Promise<Response | null> {
  const controller = new AbortController()
  const timer = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const onOuterAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onOuterAbort)

  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData
  const hasJson = options.body !== undefined && !isForm
  try {
    return await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: accept,
        Authorization: `Bearer ${options.token}`,
        ...NGROK_HEADERS,
        // For FormData the browser sets the multipart Content-Type (with its boundary) itself.
        ...(hasJson ? { 'Content-Type': 'application/json' } : {}),
      },
      body: isForm ? (options.body as FormData) : hasJson ? JSON.stringify(options.body) : undefined,
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    })
  } catch {
    return null
  } finally {
    globalThis.clearTimeout(timer)
    options.signal?.removeEventListener('abort', onOuterAbort)
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    const text = await response.text()
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

/**
 * Shown when the server has no such endpoint at all. Spring's built-in 404
 * reply ({"timestamp", "status", "error": "Not Found", "path"}) is not one of
 * our messages: it usually means the backend is running older code.
 */
export const MISSING_ENDPOINT_MESSAGE =
  'This feature is not available on the server. The backend may be running older code: restart it with the latest version.'

/** Spring's own error reply has "path" and "timestamp"; our ApiExceptionHandler replies never do. */
function isFrameworkErrorBody(body: unknown): boolean {
  return isRecord(body) && typeof body.path === 'string' && 'timestamp' in body
}

function failure(response: Response, body: unknown): { ok: false; error: ApiError } {
  const kind = kindForStatus(response.status)
  if (kind === 'not-found' && isFrameworkErrorBody(body)) {
    return { ok: false, error: { kind, message: MISSING_ENDPOINT_MESSAGE, fields: {} } }
  }
  const { message, fields } = readErrorBody(body)
  // Only our own short JSON messages are shown; 5xx and 401/403 always use fixed text.
  const useServerMessage =
    message && (kind === 'validation' || kind === 'conflict' || kind === 'not-found' || kind === 'too-large')
  return {
    ok: false,
    error: { kind, message: useServerMessage ? message : DEFAULT_MESSAGES[kind], fields },
  }
}

const NETWORK_FAILURE = { ok: false as const, error: { kind: 'network' as const, message: DEFAULT_MESSAGES.network, fields: {} } }

export async function apiRequest<T>(path: string, options: RequestOptions): Promise<ApiResult<T>> {
  const response = await send(path, options, 'application/json')
  if (!response) return NETWORK_FAILURE
  const body = await readJson(response)
  if (response.ok) {
    return { ok: true, data: body as T, status: response.status }
  }
  return failure(response, body)
}

/** A downloaded file. The caller hands it to the browser to save; it is never stored. */
export interface DownloadedFile {
  blob: Blob
  fileName: string
}

/** Reads the file name from Content-Disposition (RFC 6266 / 5987), with a fallback. */
export function fileNameFromDisposition(header: string | null, fallback: string): string {
  if (header) {
    const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)
    if (star) {
      try {
        return cleanFileName(decodeURIComponent(star[1].trim()), fallback)
      } catch {
        /* fall through to the plain name */
      }
    }
    const plain = /filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i.exec(header)
    const value = plain?.[1] ?? plain?.[2]
    if (value) return cleanFileName(value.trim(), fallback)
  }
  return fallback
}

/** Keeps only the last path part and drops characters that are not safe in file names. */
function cleanFileName(name: string, fallback: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const safe = base.replace(/[\u0000-\u001f<>:"|?*]/g, '').trim()
  return safe && safe !== '.' && safe !== '..' ? safe : fallback
}

/** Downloads a protected file with the Bearer token (links can't carry the token). */
export async function apiDownload(
  path: string,
  options: { token: string; fallbackName: string; signal?: AbortSignal },
): Promise<ApiResult<DownloadedFile>> {
  const response = await send(path, { token: options.token, signal: options.signal }, '*/*')
  if (!response) return NETWORK_FAILURE
  if (!response.ok) return failure(response, await readJson(response))
  try {
    const blob = await response.blob()
    const fileName = fileNameFromDisposition(response.headers.get('Content-Disposition'), options.fallbackName)
    return { ok: true, data: { blob, fileName }, status: response.status }
  } catch {
    return NETWORK_FAILURE
  }
}

/** Asks the browser to save a downloaded file, then releases it from memory. */
export function saveFile(file: DownloadedFile): void {
  const url = URL.createObjectURL(file.blob)
  const link = document.createElement('a')
  link.href = url
  link.download = file.fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
