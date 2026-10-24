// The company profile (name, phone, office addresses), managed by HR, and the
// employee's virtual ID card. Nothing here is filled in by the app: every
// value comes from what HR saved, and a missing value shows as missing.
import { apiRequest } from './api'

export interface CompanyAddressRecord {
  id: number
  label: string
  address: string
  /** Inactive addresses are kept (ID cards that use them still work) but can't be chosen again. */
  active: boolean
}

export interface CompanyProfileRecord {
  /** null until HR saves the profile. */
  name: string | null
  phone: string | null
  updatedAt: string | null
  addresses: CompanyAddressRecord[]
}

export interface IdCardRecord {
  displayName: string
  employeeCode: string
  department: string | null
  jobTitle: string | null
  companyName: string | null
  companyPhone: string | null
  officeLabel: string | null
  officeAddress: string | null
}

export interface CompanyFormValues {
  name: string
  phone: string
}

export interface AddressFormValues {
  label: string
  address: string
}

const PHONE_CHARS = /^[0-9+()\-\s]+$/

/** Same rules as the server (CompanyService). */
export function validateCompany(values: CompanyFormValues): Partial<Record<keyof CompanyFormValues, string>> {
  const errors: Partial<Record<keyof CompanyFormValues, string>> = {}
  const name = values.name.trim()
  if (!name) errors.name = 'Enter the company name.'
  else if (name.length > 150) errors.name = 'Use at most 150 characters.'
  const phone = values.phone.trim()
  if (phone) {
    const digits = phone.replace(/\D/g, '').length
    if (!PHONE_CHARS.test(phone) || digits < 7 || digits > 15) {
      errors.phone = 'Enter a valid phone number (7 to 15 digits; spaces, +, - and brackets allowed).'
    }
  }
  return errors
}

export function validateAddress(values: AddressFormValues): Partial<Record<keyof AddressFormValues, string>> {
  const errors: Partial<Record<keyof AddressFormValues, string>> = {}
  const label = values.label.trim()
  if (!label) errors.label = 'Give the office a name, for example Head office.'
  else if (label.length > 60) errors.label = 'Use at most 60 characters.'
  const address = values.address.trim()
  if (!address) errors.address = 'Enter the address.'
  else if (address.length > 300) errors.address = 'Use at most 300 characters.'
  return errors
}

/** The addresses HR can pick for an employee: active ones, plus the one already chosen (even if inactive). */
export function addressChoices(addresses: CompanyAddressRecord[], currentId?: number | null): CompanyAddressRecord[] {
  return addresses.filter((a) => a.active || a.id === currentId)
}

/* ---------- API: HR ---------- */

export function getCompany(token: string, signal?: AbortSignal) {
  return apiRequest<CompanyProfileRecord>('/api/hr/company', { token, signal })
}

export function saveCompany(token: string, values: CompanyFormValues) {
  return apiRequest<CompanyProfileRecord>('/api/hr/company', {
    token, method: 'PUT', body: { name: values.name.trim(), phone: values.phone.trim() || null },
  })
}

export function addAddress(token: string, values: AddressFormValues) {
  return apiRequest<CompanyProfileRecord>('/api/hr/company/addresses', {
    token, method: 'POST', body: { label: values.label.trim(), address: values.address.trim() },
  })
}

export function changeAddress(token: string, id: number, values: AddressFormValues & { active: boolean }) {
  return apiRequest<CompanyProfileRecord>(`/api/hr/company/addresses/${id}`, {
    token, method: 'PUT', body: { label: values.label.trim(), address: values.address.trim(), active: values.active },
  })
}

/* ---------- API: employee ---------- */

export function getMyIdCard(token: string, signal?: AbortSignal) {
  return apiRequest<IdCardRecord>('/api/employee/profile/id-card', { token, signal })
}
