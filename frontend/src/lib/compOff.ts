// HR: an employee's Comp-Off balance, its change history, and manual changes.
//
// The server decides everything that matters (HR permission, the 0–365 day
// range, whether a change was already applied); the app checks the same
// things first so mistakes show up before sending. Each change carries a
// unique key: if the same change is sent twice (double tap, retry after a lost
// reply), the server applies it only once.
import { apiRequest } from './api'
import { days } from './leave'

export interface CompOffAdjustmentRecord {
  id: number
  /** MANUAL: HR's change with a reason. LEAVE_APPROVED: days taken off by an approved request. */
  source: 'MANUAL' | 'LEAVE_APPROVED' | string
  changeDays: number | string
  balanceBefore: number | string
  balanceAfter: number | string
  reason: string
  leaveRequestId: number | null
  changedBy: string | null
  changedAt: string | null
}

export interface CompOffRecord {
  employeeId: number
  balanceDays: number | string
  pendingDays: number | string
  availableDays: number | string
  /** Newest first. */
  history: CompOffAdjustmentRecord[]
}

export type Direction = 'add' | 'deduct'

export interface AdjustmentForm {
  direction: Direction
  days: string
  reason: string
}

export type AdjustmentErrors = Partial<Record<'days' | 'reason', string>>

/** The signed change: "1.5" to add -> 1.5, to deduct -> -1.5. */
export function signedChange(form: AdjustmentForm): number {
  const n = Number(form.days)
  return form.direction === 'deduct' ? -n : n
}

/** The balance after this change, or null while the days are not a valid number. */
export function balanceAfter(form: AdjustmentForm, balance: number): number | null {
  const n = Number(form.days)
  if (!form.days.trim() || !Number.isFinite(n)) return null
  return Math.round((balance + signedChange(form)) * 10) / 10
}

/** The same checks the server makes: half days, not 0, balance stays 0–365, reason 3–500 characters. */
export function validateAdjustment(form: AdjustmentForm, balance: number): AdjustmentErrors {
  const errors: AdjustmentErrors = {}
  const n = Number(form.days)
  if (!form.days.trim() || !Number.isFinite(n) || n <= 0) {
    errors.days = 'Enter the number of days (more than 0).'
  } else if (Math.round(n * 2) !== n * 2) {
    errors.days = 'Use whole or half days (for example 1 or 0.5).'
  } else if (form.direction === 'deduct' && n > balance) {
    errors.days = `You can deduct at most ${balance} ${balance === 1 ? 'day' : 'days'}: the Comp-Off balance is ${balance}.`
  } else if (form.direction === 'add' && balance + n > 365) {
    errors.days = 'The Comp-Off balance can be at most 365 days.'
  }
  const reason = form.reason.trim()
  if (reason.length < 3) errors.reason = 'Give a reason (at least 3 characters).'
  else if (reason.length > 500) errors.reason = 'Use at most 500 characters.'
  return errors
}

export function hasAdjustmentErrors(errors: AdjustmentErrors): boolean {
  return Boolean(errors.days || errors.reason)
}

/** A new key for one change; the same key is reused if that change is retried. */
export function newRequestKey(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

/** "+1.5 days", "−0.5 day" (a real minus sign). */
export function changeLabel(value: number | string): string {
  const n = days(value)
  const size = Math.abs(n)
  return `${n > 0 ? '+' : '−'}${size} ${size === 1 ? 'day' : 'days'}`
}

/** "22 Oct 2026, 10:30" in the viewer's time zone, or "" when unknown. */
export function changedAtLabel(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/* ---------- API (HR only; the server refuses everyone else) ---------- */

export function getCompOff(token: string, employeeId: number, signal?: AbortSignal) {
  return apiRequest<CompOffRecord>(`/api/hr/employees/${employeeId}/comp-off`, { token, signal })
}

export function adjustCompOff(token: string, employeeId: number, form: AdjustmentForm, requestKey: string) {
  return apiRequest<CompOffRecord>(`/api/hr/employees/${employeeId}/comp-off/adjustments`, {
    token,
    method: 'POST',
    body: { changeDays: signedChange(form), reason: form.reason.trim(), requestKey },
  })
}
