// Leave balances and leave requests (employee and HR).
//
// The server decides everything that matters: the number of working days
// (weekly offs and company holidays are not counted), whether enough balance
// is available, overlaps, and the approval itself. The app shows the same
// numbers before sending, so problems show up early.
import { apiRequest } from './api'
import type { LeaveBalance, LeaveRequest, Status } from '../data/types'
import type { CalendarDay } from './workCalendar'

export type LeaveTypeId = 'CASUAL' | 'SICK' | 'EARNED' | 'COMP_OFF'

export const LEAVE_TYPES: { id: LeaveTypeId; label: string }[] = [
  { id: 'CASUAL', label: 'Casual' },
  { id: 'SICK', label: 'Sick' },
  { id: 'EARNED', label: 'Earned' },
  { id: 'COMP_OFF', label: 'Comp-Off' },
]

/**
 * Comp-Off's balance is never set directly: HR adds or deducts days with a
 * reason, and every change is kept (see lib/compOff.ts). The others are set.
 */
export function isSetDirectly(type: LeaveTypeId | string): boolean {
  return type !== 'COMP_OFF'
}

/** The names shown in the "Leave Type" dropdown (employee and HR). */
const DROPDOWN_NAME: Record<LeaveTypeId, string> = {
  CASUAL: 'Casual Leave',
  SICK: 'Sick Leave',
  EARNED: 'Earned Leave',
  COMP_OFF: 'Comp-Off',
}

export function leaveTypeName(type: LeaveTypeId | string): string {
  return DROPDOWN_NAME[type as LeaveTypeId] ?? String(type)
}

/** "1 day", "0 days", "2.5 days". */
export function dayCountLabel(value: number | string | null | undefined): string {
  const n = days(value)
  return `${n} ${n === 1 ? 'day' : 'days'}`
}

/** Total days the employee can still request, across every leave type (from the server's balances). */
export function totalAvailable(balances: LeaveBalanceRecord[]): number {
  return Math.round(balances.reduce((sum, b) => sum + days(b.availableDays), 0) * 10) / 10
}

/** Shown under the Leave Type dropdown: "Available balance: 1 day" (0 days when the type has none). */
export function availableBalanceText(type: LeaveTypeId | '', balances: LeaveBalanceRecord[] | null): string | null {
  if (!type || !balances) return null
  const b = balances.find((x) => x.leaveType === type)
  return `Available balance: ${dayCountLabel(b ? b.availableDays : 0)}`
}

/** One dropdown option: "Casual Leave · 2 days available", or just the name when the balance is unknown. */
export function leaveTypeOption(type: LeaveTypeId, balances?: LeaveBalanceRecord[] | null): string {
  const b = balances?.find((x) => x.leaveType === type)
  if (!b) return leaveTypeName(type)
  const n = days(b.availableDays)
  return `${leaveTypeName(type)} · ${n} ${n === 1 ? 'day' : 'days'} available`
}

export interface LeaveBalanceRecord {
  leaveType: LeaveTypeId
  label: string
  /** Set by HR; goes down when a request is approved. */
  balanceDays: number | string
  /** Requested and waiting for HR (held back). */
  pendingDays: number | string
  /** What a new request can use: balance minus pending. */
  availableDays: number | string
  updatedAt: string | null
}

export interface LeaveRequestRecord {
  id: number
  employeeId: number
  employeeCode: string | null
  employeeName: string | null
  leaveType: LeaveTypeId
  label: string
  startDate: string
  endDate: string
  days: number | string
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string
  submittedAt: string | null
  reviewedAt: string | null
  reviewNote: string | null
}

const STATUS: Record<string, Status> = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected' }

/** Numbers like 7.5 or "7.5" -> 7.5. */
export function days(value: number | string | null | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0
}

/** The shape the existing leave lists and home card use. */
export function toLeaveRequest(r: LeaveRequestRecord, employeeId: string): LeaveRequest {
  return {
    id: String(r.id),
    employeeId,
    type: r.label,
    from: r.startDate,
    to: r.endDate,
    days: days(r.days),
    reason: r.reason,
    status: STATUS[r.status] ?? 'Pending',
    remark: r.reviewNote ?? undefined,
  }
}

/** For the existing balance card: "left" is what can still be requested; "total" is HR's balance. */
export function toLeaveBalance(b: LeaveBalanceRecord): LeaveBalance {
  return { type: b.label, left: days(b.availableDays), total: days(b.balanceDays) }
}

/* ---------- Apply form ---------- */

export interface LeaveFormValues {
  leaveType: LeaveTypeId | ''
  startDate: string
  endDate: string
  reason: string
}

export type LeaveFormErrors = Partial<Record<keyof LeaveFormValues | 'form', string>>

/** Working days from start to end (both included), from the server's calendar for those dates. */
export function countWorkingDays(calendar: CalendarDay[], start: string, end: string): number {
  return calendar.filter((d) => d.date >= start && d.date <= end && d.kind === 'WORKING').length
}

/**
 * Checks the form before sending. workingDays: from countWorkingDays, or
 * null while the calendar is still loading.
 */
export function validateLeave(
  values: LeaveFormValues, balances: LeaveBalanceRecord[], workingDays: number | null,
): LeaveFormErrors {
  const errors: LeaveFormErrors = {}
  if (!values.leaveType) errors.leaveType = 'Choose the leave type.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.startDate)) errors.startDate = 'Choose the first day.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.endDate)) errors.endDate = 'Choose the last day.'
  else if (values.startDate && values.endDate < values.startDate) errors.endDate = 'The last day must be on or after the first day.'
  const reason = values.reason.trim()
  if (!reason) errors.reason = 'Give a reason.'
  else if (reason.length > 500) errors.reason = 'Use at most 500 characters.'

  if (!errors.startDate && !errors.endDate && workingDays !== null) {
    if (workingDays === 0) {
      errors.endDate = 'These dates are all weekly offs or company holidays, so no leave is needed.'
    } else if (values.leaveType) {
      const balance = balances.find((b) => b.leaveType === values.leaveType)
      const available = balance ? days(balance.availableDays) : 0
      if (workingDays > available) {
        const label = balance?.label ?? values.leaveType
        errors.form = `Not enough ${label} leave: this request needs ${workingDays} ${workingDays === 1 ? 'day' : 'days'}, and you have ${available} available.`
      }
    }
  }
  return errors
}

export function hasLeaveErrors(errors: LeaveFormErrors): boolean {
  return Object.values(errors).some(Boolean)
}

/* ---------- HR balance form ---------- */

/** HR's new balance: 0 to 365 days in half days. Returns the problem, if any. */
export function checkBalance(value: string): string | undefined {
  const n = Number(value)
  if (!value.trim() || !Number.isFinite(n) || n < 0 || n > 365 || Math.round(n * 2) !== n * 2) {
    return 'Enter a balance from 0 to 365 days, in half days (for example 7.5).'
  }
  return undefined
}

/* ---------- API: employee ---------- */

export function getMyLeaveBalances(token: string, signal?: AbortSignal) {
  return apiRequest<LeaveBalanceRecord[]>('/api/employee/leave/balances', { token, signal })
}

export function getMyLeaveRequests(token: string, signal?: AbortSignal) {
  return apiRequest<LeaveRequestRecord[]>('/api/employee/leave/requests', { token, signal })
}

export function applyForLeave(token: string, values: LeaveFormValues) {
  return apiRequest<LeaveRequestRecord>('/api/employee/leave/requests', {
    token,
    method: 'POST',
    body: { leaveType: values.leaveType, startDate: values.startDate, endDate: values.endDate, reason: values.reason.trim() },
  })
}

/* ---------- API: HR ---------- */

export function getLeaveBalances(token: string, employeeId: number, signal?: AbortSignal) {
  return apiRequest<LeaveBalanceRecord[]>(`/api/hr/employees/${employeeId}/leave-balances`, { token, signal })
}

export function setLeaveBalance(token: string, employeeId: number, leaveType: LeaveTypeId, balanceDays: string) {
  return apiRequest<LeaveBalanceRecord[]>(`/api/hr/employees/${employeeId}/leave-balances/${leaveType}`, {
    token, method: 'PUT', body: { balanceDays: Number(balanceDays) },
  })
}

export function listLeaveRequests(token: string, status: 'PENDING' | 'APPROVED' | 'REJECTED', signal?: AbortSignal) {
  return apiRequest<LeaveRequestRecord[]>(`/api/hr/leave-requests?status=${status}`, { token, signal })
}

export function decideLeave(token: string, id: number, decision: 'approve' | 'reject', note?: string) {
  return apiRequest<LeaveRequestRecord>(`/api/hr/leave-requests/${id}/${decision}`, {
    token, method: 'POST', body: { note: note?.trim() || null },
  })
}
