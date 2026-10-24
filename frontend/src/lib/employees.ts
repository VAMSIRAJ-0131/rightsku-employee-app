// Employee management API (HR Admin only) and form validation.
import { apiRequest, type ApiResult } from './api'

export type EmployeeStatus = 'ACTIVE' | 'INACTIVE'
export type StatusFilter = 'ALL' | EmployeeStatus

export interface EmployeeRecord {
  id: number
  employeeCode: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  department: string | null
  jobTitle: string | null
  joiningDate: string | null
  status: EmployeeStatus | string
  createdAt: string
  updatedAt: string
  /** MALE or FEMALE; null until HR sets it (older servers leave these out). */
  gender?: Gender | null
  /** MR, MS or MRS; null when not set. */
  namePrefix?: NamePrefix | null
  /** "Mr. Vamsi Ajjampudi": prefix (if set), first and last name. */
  displayName?: string | null
  /** The office address shown on the employee's ID card. */
  companyAddressId?: number | null
}

export type Gender = 'MALE' | 'FEMALE'
export type NamePrefix = 'MR' | 'MS' | 'MRS'

export const GENDERS: { id: Gender; label: string }[] = [
  { id: 'MALE', label: 'Male' },
  { id: 'FEMALE', label: 'Female' },
]

export const NAME_PREFIXES: { id: NamePrefix; label: string }[] = [
  { id: 'MR', label: 'Mr.' },
  { id: 'MS', label: 'Ms.' },
  { id: 'MRS', label: 'Mrs.' },
]

export function genderLabel(gender: string | null | undefined): string {
  return GENDERS.find((g) => g.id === gender)?.label ?? ''
}

export function prefixLabel(prefix: string | null | undefined): string {
  return NAME_PREFIXES.find((p) => p.id === prefix)?.label ?? ''
}

/**
 * "Mr. Vamsi Ajjampudi" (same rule as the server): the prefix is left out
 * when none is set or when the first name already starts with a title, so it
 * is never shown twice.
 */
export function displayNameOf(record: Pick<EmployeeRecord, 'firstName' | 'lastName'> & { namePrefix?: string | null; displayName?: string | null }): string {
  if (record.displayName?.trim()) return record.displayName.trim()
  const name = fullName(record)
  const label = prefixLabel(record.namePrefix)
  if (!label || !name || /^(mr|ms|mrs)\.?\s/i.test(name)) return name
  return `${label} ${name}`
}

export interface EmployeePage {
  items: EmployeeRecord[]
  page: number
  size: number
  totalItems: number
  totalPages: number
  activeCount: number
  inactiveCount: number
}

/** Form values as typed. Everything is a string; empty means "not provided". */
export interface EmployeeFormValues {
  employeeCode: string
  firstName: string
  lastName: string
  email: string
  phone: string
  department: string
  jobTitle: string
  joiningDate: string
  initialPassword: string
  /** '' = not set. */
  gender: Gender | ''
  namePrefix: NamePrefix | ''
  /** An office address id, or '' for none. */
  companyAddressId: string
}

export const EMPTY_EMPLOYEE_FORM: EmployeeFormValues = {
  employeeCode: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  department: '',
  jobTitle: '',
  joiningDate: '',
  initialPassword: '',
  gender: '',
  namePrefix: '',
  companyAddressId: '',
}

export type FormErrors = Partial<Record<keyof EmployeeFormValues, string>>

/** Same rules as the backend (AppUser.normalizeLoginId and PasswordPolicy). */
export const EMPLOYEE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,29}$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[0-9+()\-\s]*$/
export const MIN_PASSWORD_LENGTH = 12
const MAX_PASSWORD_BYTES = 72

/**
 * Checks the form before it is sent. The backend checks everything again;
 * this only gives faster, clearer feedback.
 */
export function validateEmployeeForm(values: EmployeeFormValues, mode: 'create' | 'edit'): FormErrors {
  const errors: FormErrors = {}
  const code = values.employeeCode.trim()
  if (mode === 'create' && code && !EMPLOYEE_ID_PATTERN.test(code)) {
    errors.employeeCode = 'Use 1–30 letters, digits, “.”, “_” or “-”, starting with a letter or digit.'
  }
  if (!values.firstName.trim()) errors.firstName = 'Enter a first name.'
  else if (values.firstName.trim().length > 100) errors.firstName = 'First name is too long.'
  if (!values.lastName.trim()) errors.lastName = 'Enter a last name.'
  else if (values.lastName.trim().length > 100) errors.lastName = 'Last name is too long.'
  const email = values.email.trim()
  if (!email) errors.email = 'Enter a work email.'
  else if (!EMAIL_PATTERN.test(email) || email.length > 254) errors.email = 'Enter a valid email, like name@rightsku.com.'
  if (values.phone.trim().length > 30 || !PHONE_PATTERN.test(values.phone)) {
    errors.phone = 'Use digits, spaces, +, -, ( and ) only.'
  }
  if (values.department.trim().length > 100) errors.department = 'Department is too long.'
  if (values.jobTitle.trim().length > 100) errors.jobTitle = 'Job title is too long.'
  if (values.gender && !GENDERS.some((g) => g.id === values.gender)) errors.gender = 'Choose Male or Female.'
  if (values.namePrefix && !NAME_PREFIXES.some((p) => p.id === values.namePrefix)) errors.namePrefix = 'Choose Mr., Ms. or Mrs.'
  if (values.joiningDate && !/^\d{4}-\d{2}-\d{2}$/.test(values.joiningDate)) {
    errors.joiningDate = 'Enter a valid date.'
  }
  if (mode === 'create') {
    const pw = values.initialPassword
    if (!pw) errors.initialPassword = 'Enter a temporary password.'
    else if (pw !== pw.trim()) errors.initialPassword = 'The password can’t start or end with a space.'
    else if (pw.length < MIN_PASSWORD_LENGTH) errors.initialPassword = `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    else if (new TextEncoder().encode(pw).length > MAX_PASSWORD_BYTES) errors.initialPassword = 'This password is too long.'
  }
  return errors
}

const orNull = (value: string) => (value.trim() ? value.trim() : null)

/** Request body for POST /api/hr/employees. Blank Employee ID = generate one. */
export function toCreatePayload(values: EmployeeFormValues) {
  return {
    employeeCode: orNull(values.employeeCode),
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    email: values.email.trim(),
    phone: orNull(values.phone),
    department: orNull(values.department),
    jobTitle: orNull(values.jobTitle),
    joiningDate: values.joiningDate || null,
    initialPassword: values.initialPassword,
    ...profilePayload(values),
  }
}

function profilePayload(values: EmployeeFormValues) {
  return {
    gender: values.gender || null,
    namePrefix: values.namePrefix || null,
    companyAddressId: values.companyAddressId ? Number(values.companyAddressId) : null,
  }
}

/** Request body for PUT /api/hr/employees/{id}. */
export function toUpdatePayload(values: EmployeeFormValues) {
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    email: values.email.trim(),
    phone: orNull(values.phone),
    department: orNull(values.department),
    jobTitle: orNull(values.jobTitle),
    joiningDate: values.joiningDate || null,
    ...profilePayload(values),
  }
}

export function formFromRecord(record: EmployeeRecord): EmployeeFormValues {
  return {
    employeeCode: record.employeeCode,
    firstName: record.firstName,
    lastName: record.lastName,
    email: record.email,
    phone: record.phone ?? '',
    department: record.department ?? '',
    jobTitle: record.jobTitle ?? '',
    joiningDate: record.joiningDate ?? '',
    initialPassword: '',
    gender: record.gender ?? '',
    namePrefix: record.namePrefix ?? '',
    companyAddressId: record.companyAddressId ? String(record.companyAddressId) : '',
  }
}

export function fullName(record: Pick<EmployeeRecord, 'firstName' | 'lastName'>): string {
  return `${record.firstName} ${record.lastName}`.trim()
}

/* ---------- API calls ---------- */

const BASE = '/api/hr/employees'

export function listEmployees(
  token: string,
  query: { q?: string; status?: StatusFilter; page?: number; size?: number },
  signal?: AbortSignal,
): Promise<ApiResult<EmployeePage>> {
  const params = new URLSearchParams()
  if (query.q?.trim()) params.set('q', query.q.trim())
  params.set('status', query.status ?? 'ALL')
  params.set('page', String(query.page ?? 0))
  params.set('size', String(query.size ?? 20))
  return apiRequest<EmployeePage>(`${BASE}?${params.toString()}`, { token, signal })
}

export function getEmployee(token: string, id: number, signal?: AbortSignal) {
  return apiRequest<EmployeeRecord>(`${BASE}/${id}`, { token, signal })
}

export function createEmployee(token: string, values: EmployeeFormValues) {
  return apiRequest<EmployeeRecord>(BASE, { token, method: 'POST', body: toCreatePayload(values) })
}

export function updateEmployee(token: string, id: number, values: EmployeeFormValues) {
  return apiRequest<EmployeeRecord>(`${BASE}/${id}`, { token, method: 'PUT', body: toUpdatePayload(values) })
}

export function setEmployeeActive(token: string, id: number, active: boolean) {
  return apiRequest<EmployeeRecord>(`${BASE}/${id}/${active ? 'activate' : 'deactivate'}`, { token, method: 'POST' })
}

/* ---------- HR resets a forgotten password ---------- */

export interface ResetPasswordValues {
  temporaryPassword: string
  confirmPassword: string
}

/** Same rules as the server (PasswordPolicy, 12+ characters for an HR-chosen password). */
export function validateResetPassword(values: ResetPasswordValues): Partial<Record<keyof ResetPasswordValues, string>> {
  const errors: Partial<Record<keyof ResetPasswordValues, string>> = {}
  const pw = values.temporaryPassword
  if (!pw) errors.temporaryPassword = 'Enter a temporary password.'
  else if (pw !== pw.trim()) errors.temporaryPassword = 'Don’t start or end the password with spaces.'
  else if (pw.length < MIN_PASSWORD_LENGTH) errors.temporaryPassword = `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  else if (new TextEncoder().encode(pw).length > 72) errors.temporaryPassword = 'This password is too long.'
  if (!values.confirmPassword) errors.confirmPassword = 'Enter the temporary password again.'
  else if (values.confirmPassword !== pw) errors.confirmPassword = 'The two passwords don’t match.'
  return errors
}

/** 204 on success; the password is never sent back. */
export function resetEmployeePassword(token: string, id: number, values: ResetPasswordValues) {
  return apiRequest<null>(`${BASE}/${id}/reset-password`, { token, method: 'POST', body: values })
}

// Letters and digits that can't be confused when read aloud or typed (no 0/O, 1/l/I).
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

/**
 * A strong random temporary password, for example "Kq7m-Xt4P-wR9b" (14
 * characters, about 71 bits of randomness). Uses the browser's secure random
 * generator; it exists only on this screen until HR saves it.
 */
export function generateTemporaryPassword(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const groups: string[] = []
  for (let g = 0; g < 3; g++) {
    let group = ''
    while (group.length < 4) {
      const [byte] = random(new Uint8Array(1))
      // Rejection sampling keeps every character equally likely.
      if (byte < 256 - (256 % PASSWORD_ALPHABET.length)) group += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]
    }
    groups.push(group)
  }
  return groups.join('-')
}
