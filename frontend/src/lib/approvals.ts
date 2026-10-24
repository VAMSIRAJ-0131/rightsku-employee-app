// HR timesheet approvals and the approval counts.
//
// Timesheets are reviewed one employee-week at a time: HR approves or
// rejects the days of that week that are still pending. Counts always come
// from the server, so they change as soon as anything is submitted or decided.
import { apiRequest } from './api'
import type { TimesheetRecord } from './workCalendar'

export interface HrTimesheetWeek {
  employeeId: number
  employeeCode: string | null
  employeeName: string | null
  weekStart: string
  weekEnd: string
  totalHours: number | string
  submittedAt: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string
  reviewedAt: string | null
  reviewNote: string | null
  days: TimesheetRecord[]
  /** Working days left at 0 hours with no leave: LOP once the week is approved (older servers leave it out). */
  zeroHourDays?: string[]
}

export interface ApprovalCounts {
  pending: number
  approved: number
  rejected: number
}

export interface ApprovalSummary {
  timesheets: ApprovalCounts
  leave: ApprovalCounts
  /** Comp-Off requests (older servers leave it out). */
  compOff?: ApprovalCounts
}

export const NO_COUNTS: ApprovalCounts = { pending: 0, approved: 0, rejected: 0 }

export const EMPTY_SUMMARY: ApprovalSummary = {
  timesheets: NO_COUNTS,
  leave: NO_COUNTS,
  compOff: NO_COUNTS,
}

/** Everything waiting for HR: timesheet weeks, leave and Comp-Off requests. */
export function pendingTotal(summary: ApprovalSummary): number {
  return summary.timesheets.pending + summary.leave.pending + (summary.compOff?.pending ?? 0)
}

/** A stable key for one employee-week. */
export function weekKey(week: Pick<HrTimesheetWeek, 'employeeId' | 'weekStart'>): string {
  return `${week.employeeId}/${week.weekStart}`
}

export function getApprovalSummary(token: string, signal?: AbortSignal) {
  return apiRequest<ApprovalSummary>('/api/hr/approvals/summary', { token, signal })
}

export function listTimesheetWeeks(token: string, status: 'PENDING' | 'APPROVED' | 'REJECTED', signal?: AbortSignal) {
  return apiRequest<HrTimesheetWeek[]>(`/api/hr/timesheets?status=${status}`, { token, signal })
}

export function reviewTimesheetWeek(
  token: string, week: Pick<HrTimesheetWeek, 'employeeId' | 'weekStart'>, decision: 'APPROVE' | 'REJECT', note?: string,
) {
  return apiRequest<HrTimesheetWeek>('/api/hr/timesheets/review', {
    token,
    method: 'POST',
    body: { employeeId: week.employeeId, weekStart: week.weekStart, decision, note: note?.trim() || null },
  })
}
