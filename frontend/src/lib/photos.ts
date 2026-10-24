// Employee profile photos. Only HR Admins upload, change or remove them
// (/api/hr/employees/{id}/photo); an employee can only view their own
// (/api/employee/profile/photo). The server enforces both rules.
//
// Images are fetched with the Bearer token (an <img src> can't send it) and
// shown through a temporary object URL that the caller must revoke.
import { apiDownload, apiRequest, type ApiResult } from './api'

/** Same limits as the server (EmployeePhotoService). */
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024
export const PHOTO_TYPES = ['image/jpeg', 'image/png']

/** Checks a chosen file before uploading; the server checks again by content. */
export function checkPhotoFile(file: { type: string; size: number }): string | null {
  if (!PHOTO_TYPES.includes(file.type)) return 'Choose a JPG or PNG photo.'
  if (file.size === 0) return 'This file is empty. Choose another photo.'
  if (file.size > PHOTO_MAX_BYTES) return 'This photo is larger than 2 MB. Choose a smaller one.'
  return null
}

export function uploadEmployeePhoto(token: string, employeeId: number, file: File) {
  const form = new FormData()
  form.append('file', file)
  return apiRequest<null>(`/api/hr/employees/${employeeId}/photo`, { token, method: 'PUT', body: form })
}

export function removeEmployeePhoto(token: string, employeeId: number) {
  return apiRequest<null>(`/api/hr/employees/${employeeId}/photo`, { token, method: 'DELETE' })
}

/** An object URL for the photo, or null when there is none (404). Errors other than "no photo" are returned. */
async function photoUrl(path: string, token: string, signal?: AbortSignal): Promise<ApiResult<string | null>> {
  const result = await apiDownload(path, { token, fallbackName: 'photo', signal })
  if (result.ok) return { ok: true, data: URL.createObjectURL(result.data.blob), status: result.status }
  if (result.error.kind === 'not-found') return { ok: true, data: null, status: 404 }
  return result
}

export function loadEmployeePhoto(token: string, employeeId: number, signal?: AbortSignal) {
  return photoUrl(`/api/hr/employees/${employeeId}/photo`, token, signal)
}

export function loadMyPhoto(token: string, signal?: AbortSignal) {
  return photoUrl('/api/employee/profile/photo', token, signal)
}
