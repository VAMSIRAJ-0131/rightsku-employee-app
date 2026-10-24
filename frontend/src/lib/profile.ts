// The signed-in employee's own profile (GET /api/employee/profile).
//
// The login response only carries the account (Employee ID and email), so
// the dashboard starts with that and fills in the real name, department,
// job title, joining date and phone once this request returns.
import type { Employee } from '../data/types'
import { apiRequest, type ApiResult } from './api'
import { displayNameOf, fullName, type EmployeeRecord } from './employees'

export function getMyProfile(token: string, signal?: AbortSignal): Promise<ApiResult<EmployeeRecord>> {
  return apiRequest<EmployeeRecord>('/api/employee/profile', { token, signal })
}

/**
 * The session profile with the server's details filled in. The name and email
 * keep what the session already had if the server sends them blank, so
 * nothing shown is ever invented. The ID stays the session's Employee ID (the
 * dashboard's other requests are keyed on it). Manager and location are not
 * stored by the backend yet and stay empty.
 */
export function withProfileRecord(profile: Employee, record: EmployeeRecord): Employee {
  const name = fullName(record)
  return {
    ...profile,
    name: name || profile.name,
    // "Mr. Vamsi Ajjampudi" for the home screen; the plain name above stays for initials.
    displayName: displayNameOf(record) || name || profile.name,
    email: record.email || profile.email,
    department: record.department ?? '',
    designation: record.jobTitle ?? '',
    joiningDate: record.joiningDate ?? '',
    phone: record.phone ?? '',
    active: record.status === 'ACTIVE',
  }
}
