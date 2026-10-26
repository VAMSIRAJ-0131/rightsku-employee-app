// Personal details (phone, address, emergency contact, bank details) and the
// employee's requests to change them. Nothing changes until HR approves; the
// server checks every value again. The employee sees the bank account number
// masked ("•••• 4321"); HR sees it in full.
import { apiRequest } from './api'

export interface PersonalDetails {
  phone: string | null
  address: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  bankAccountName: string | null
  bankAccountNumber: string | null
  bankIfsc: string | null
  pendingRequestId: number | null
}

export type ProfileFieldKey = Exclude<keyof PersonalDetails, 'pendingRequestId'>

export interface ProfileChangeRecord {
  id: number
  employeeId: number
  employeeCode: string | null
  employeeName: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | string
  createdAt: string
  reviewedAt: string | null
  reviewNote: string | null
  cancelledAt: string | null
  items: { key: ProfileFieldKey; label: string; previous: string | null; requested: string | null }[]
}

/** The fields, in the order the form shows them, with the same rules as the server. */
export const PROFILE_FIELDS: { key: ProfileFieldKey; label: string; group: 'contact' | 'emergency' | 'bank'; hint?: string; max: number; multiline?: boolean; inputMode?: 'tel' | 'numeric' | 'text' }[] = [
  { key: 'phone', label: 'Phone', group: 'contact', max: 30, inputMode: 'tel' },
  { key: 'address', label: 'Address', group: 'contact', max: 300, multiline: true },
  { key: 'emergencyContactName', label: 'Contact name', group: 'emergency', max: 100 },
  { key: 'emergencyContactPhone', label: 'Contact phone', group: 'emergency', max: 20, inputMode: 'tel' },
  { key: 'bankAccountName', label: 'Account holder name', group: 'bank', max: 100 },
  { key: 'bankAccountNumber', label: 'Account number', group: 'bank', max: 18, inputMode: 'numeric', hint: '9 to 18 digits' },
  { key: 'bankIfsc', label: 'IFSC code', group: 'bank', max: 11, hint: 'Like SBIN0001234' },
]

export type ProfileForm = Record<ProfileFieldKey, string>
export type ProfileFormErrors = Partial<Record<ProfileFieldKey | 'form', string>>

/** One field's problem, or undefined (the same checks as the server). An empty value removes the detail. */
export function checkProfileField(key: ProfileFieldKey, raw: string): string | undefined {
  const v = raw.trim()
  if (!v) return undefined
  const field = PROFILE_FIELDS.find((f) => f.key === key)!
  if (key === 'phone' || key === 'emergencyContactPhone') {
    const digits = v.replace(/\D/g, '').length
    if (!/^[0-9+()\-\s]*$/.test(v) || digits < 10 || digits > 15) return 'Enter a valid phone number (10 to 15 digits).'
    return v.length > field.max ? `At most ${field.max} characters.` : undefined
  }
  if (key === 'bankAccountNumber') {
    return /^[0-9]{9,18}$/.test(v.replace(/[\s-]/g, '')) ? undefined : 'Bank account number must be 9 to 18 digits.'
  }
  if (key === 'bankIfsc') {
    return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.replace(/\s/g, '').toUpperCase()) ? undefined : 'Enter a valid IFSC code, like SBIN0001234.'
  }
  if (v.length < 2) return `${field.label} is too short.`
  return v.length > field.max ? `At most ${field.max} characters.` : undefined
}

/** The form's starting values: the current details (the masked bank number starts empty: type it only to change it). */
export function formFrom(details: PersonalDetails | null): ProfileForm {
  const form = {} as ProfileForm
  for (const f of PROFILE_FIELDS) {
    const value = details?.[f.key] ?? ''
    form[f.key] = f.key === 'bankAccountNumber' ? '' : value
  }
  return form
}

/**
 * Only what the employee changed. The account number counts only when typed
 * (it is shown masked, so an empty box means "keep it").
 */
export function changedFields(details: PersonalDetails | null, form: ProfileForm): Partial<ProfileForm> {
  const changes: Partial<ProfileForm> = {}
  for (const f of PROFILE_FIELDS) {
    const now = (details?.[f.key] ?? '').trim()
    const next = form[f.key].trim()
    if (f.key === 'bankAccountNumber') {
      if (next) changes[f.key] = next
      continue
    }
    if (next !== now) changes[f.key] = next
  }
  return changes
}

export function validateProfileForm(details: PersonalDetails | null, form: ProfileForm): ProfileFormErrors {
  const errors: ProfileFormErrors = {}
  const changes = changedFields(details, form)
  for (const key of Object.keys(changes) as ProfileFieldKey[]) {
    const problem = checkProfileField(key, form[key])
    if (problem) errors[key] = problem
  }
  if (Object.keys(changes).length === 0) errors.form = 'Change at least one detail.'
  return errors
}

/** "Phone, IFSC code". */
export function changeSummary(r: ProfileChangeRecord): string {
  return r.items.map((i) => i.label).join(', ')
}

/* ---------- API: employee ---------- */

export function getMyPersonalDetails(token: string, signal?: AbortSignal) {
  return apiRequest<PersonalDetails>('/api/employee/profile-changes/details', { token, signal })
}

export function listMyProfileChanges(token: string, signal?: AbortSignal) {
  return apiRequest<ProfileChangeRecord[]>('/api/employee/profile-changes', { token, signal })
}

export function requestProfileChange(token: string, changes: Partial<ProfileForm>) {
  return apiRequest<ProfileChangeRecord>('/api/employee/profile-changes', { token, method: 'POST', body: { changes } })
}

export function cancelProfileChange(token: string, id: number) {
  return apiRequest<ProfileChangeRecord>(`/api/employee/profile-changes/${id}/cancel`, { token, method: 'POST' })
}

/* ---------- API: HR ---------- */

export function listProfileChanges(token: string, status: 'PENDING' | 'APPROVED' | 'REJECTED', signal?: AbortSignal) {
  return apiRequest<ProfileChangeRecord[]>(`/api/hr/profile-changes?status=${status}`, { token, signal })
}

export function countPendingProfileChanges(token: string, signal?: AbortSignal) {
  return apiRequest<{ pending: number }>('/api/hr/profile-changes/count', { token, signal })
}

export function decideProfileChange(token: string, id: number, decision: 'approve' | 'reject', note?: string) {
  return apiRequest<ProfileChangeRecord>(`/api/hr/profile-changes/${id}/${decision}`, {
    token, method: 'POST', body: { note: note?.trim() || null },
  })
}

export function getEmployeePersonalDetails(token: string, employeeId: number, signal?: AbortSignal) {
  return apiRequest<PersonalDetails>(`/api/hr/employees/${employeeId}/personal-details`, { token, signal })
}
