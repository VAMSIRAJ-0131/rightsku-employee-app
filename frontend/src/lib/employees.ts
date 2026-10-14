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
