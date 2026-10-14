// Changing the signed-in user's password (POST /api/auth/change-password).
// Used at first sign-in (temporary password from HR) and whenever an
// employee wants to change their password later.
import { apiRequest, type ApiResult } from './api'
import type { Role } from '../data/types'

/**
 * Employees choose at least 8 characters; letters, numbers and special
 * characters are all allowed (same rule as the backend PasswordPolicy).
 */
export const EMPLOYEE_MIN_LENGTH = 8
export const EMPLOYEE_PASSWORD_MESSAGE = 'Password must contain at least 8 characters.'

/** HR Admins keep the longer rule. */
export const MIN_PASSWORD_LENGTH = 12
const MAX_PASSWORD_BYTES = 72

export interface PasswordFormValues {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export type PasswordFormErrors = Partial<Record<keyof PasswordFormValues, string>>

/** The message for a new password that breaks the rule for this role, if any. */
export function newPasswordProblem(password: string, role: Role): string | undefined {
  if (role === 'employee') {
    // Count characters, not UTF-16 units, like the server does.
    if (!password.trim() || Array.from(password).length < EMPLOYEE_MIN_LENGTH) return EMPLOYEE_PASSWORD_MESSAGE
  } else {
    if (!password) return 'Choose a new password.'
    if (password !== password.trim()) return 'The password can’t start or end with a space.'
    if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (password !== password.trim()) return 'The password can’t start or end with a space.'
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return 'This password is too long.'
  return undefined
}

/**
 * Checks the form before it is sent. The server checks everything again
 * (including that the current password is right); this only gives faster,
 * clearer feedback.
 */
export function validatePasswordChange(values: PasswordFormValues, role: Role = 'employee'): PasswordFormErrors {
  const errors: PasswordFormErrors = {}
  const { currentPassword, newPassword, confirmPassword } = values
  if (!currentPassword) errors.currentPassword = 'Enter your current password.'
  const problem = newPasswordProblem(newPassword, role)
  if (problem) errors.newPassword = problem
  else if (newPassword === currentPassword) errors.newPassword = 'Choose a password that is different from your current one.'
  if (!confirmPassword) errors.confirmPassword = 'Enter the new password again.'
  else if (confirmPassword !== newPassword) errors.confirmPassword = 'The two passwords don’t match.'
  return errors
}

/** 204 on success. Afterwards every session of this account has ended; sign in again. */
export function changePassword(token: string, values: PasswordFormValues): Promise<ApiResult<null>> {
  return apiRequest<null>('/api/auth/change-password', {
    token,
    method: 'POST',
    body: {
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      confirmPassword: values.confirmPassword,
    },
  })
}
