// Changing the signed-in user's password (POST /api/auth/change-password).
// Used at first sign-in, when an employee still has HR's temporary password.
import { apiRequest, type ApiResult } from './api'

/** Same rules as the backend PasswordPolicy. */
export const MIN_PASSWORD_LENGTH = 12
const MAX_PASSWORD_BYTES = 72

export interface PasswordFormValues {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export type PasswordFormErrors = Partial<Record<keyof PasswordFormValues, string>>

/**
 * Checks the form before it is sent. The server checks everything again
 * (including that the current password is right); this only gives faster,
 * clearer feedback.
 */
export function validatePasswordChange(values: PasswordFormValues): PasswordFormErrors {
  const errors: PasswordFormErrors = {}
  const { currentPassword, newPassword, confirmPassword } = values
  if (!currentPassword) errors.currentPassword = 'Enter the password you just signed in with.'
  if (!newPassword) errors.newPassword = 'Choose a new password.'
  else if (newPassword !== newPassword.trim()) errors.newPassword = 'The password can’t start or end with a space.'
  else if (newPassword.length < MIN_PASSWORD_LENGTH) errors.newPassword = `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  else if (new TextEncoder().encode(newPassword).length > MAX_PASSWORD_BYTES) errors.newPassword = 'This password is too long.'
  else if (newPassword === currentPassword) errors.newPassword = 'Choose a password that is different from your current one.'
  if (!errors.newPassword && confirmPassword !== newPassword) errors.confirmPassword = 'The two passwords don’t match.'
  return errors
}

/** 204 on success. Afterwards every session of this account has ended; sign in again. */
export function changePassword(token: string, currentPassword: string, newPassword: string): Promise<ApiResult<null>> {
  return apiRequest<null>('/api/auth/change-password', {
    token,
    method: 'POST',
    body: { currentPassword, newPassword },
  })
}
