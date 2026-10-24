// Comp-Off requests: an employee who worked on a weekly off or company
// holiday asks for Comp-Off (full or half day), and HR approves it, which
// adds it to their Comp-Off balance once, or rejects it.
//
// Same rules as the server, which checks everything again: the day must be
// in the past, at most 30 days ago, a weekly off or company holiday in the
// employee's own calendar, with no pending or approved request for it.
import { apiRequest } from './api'
import { addDays, type CalendarDay } from './workCalendar'

export const COMP_OFF_MAX_DAYS_BACK = 30

export type CompOffDays = '1' | '0.5'

export interface CompOffRequestRecord {
  id: number
  employeeId: number
  employeeCode: string | null
  employeeName: string | null
  workDate: string
  /** WEEKLY_OFF or HOLIDAY: why the day was not a working day. */
  dayKind: 'WEEKLY_OFF' | 'HOLIDAY' | string | null
  holidayName: string | null
  days: number | string
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string
  submittedAt: string | null
  reviewedAt: string | null
  reviewNote: string | null
}

export interface CompOffFormValues {
  workDate: string
  days: CompOffDays
  reason: string
}

export type CompOffFormErrors = Partial<Record<keyof CompOffFormValues | 'form', string>>

/** The first and last day that can be asked for today: 30 days ago to yesterday. */
export function compOffWindow(today: string): { from: string; to: string } {
  return { from: addDays(today, -COMP_OFF_MAX_DAYS_BACK), to: addDays(today, -1) }
}

/**
 * The days that can be chosen, newest first: weekly offs and company holidays
 * inside the window that have no pending or approved request yet.
 */
export function compOffDayChoices(calendar: CalendarDay[], today: string, mine: CompOffRequestRecord[]): CalendarDay[] {
  const { from, to } = compOffWindow(today)
  const taken = new Set(mine.filter((r) => r.status !== 'REJECTED').map((r) => r.workDate))
  return calendar
    .filter((d) => d.date >= from && d.date <= to && d.kind !== 'WORKING' && !taken.has(d.date))
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** "Sun 11 Oct · Weekly off" or "Fri 2 Oct · Gandhi Jayanti". */
export function compOffDayLabel(day: Pick<CalendarDay, 'date' | 'kind' | 'holidayName'>): string {
  const d = new Date(`${day.date}T00:00:00`)
  const date = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  return `${date} · ${day.kind === 'HOLIDAY' ? day.holidayName ?? 'Company holiday' : 'Weekly off'}`
}

export function compOffDaysLabel(days: number | string): string {
  return Number(days) === 0.5 ? 'Half day' : 'Full day'
}

export function validateCompOff(values: CompOffFormValues, today: string, choices: CalendarDay[] | null): CompOffFormErrors {
  const errors: CompOffFormErrors = {}
  const { from, to } = compOffWindow(today)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.workDate)) errors.workDate = 'Choose the day you worked.'
  else if (values.workDate > to) errors.workDate = 'Choose a day that has already passed.'
  else if (values.workDate < from) errors.workDate = `Comp-Off can be asked for at most ${COMP_OFF_MAX_DAYS_BACK} days later.`
  else if (choices && !choices.some((d) => d.date === values.workDate)) {
    errors.workDate = 'Choose one of your weekly offs or company holidays.'
  }
  if (values.days !== '1' && values.days !== '0.5') errors.days = 'Choose full day or half day.'
  const reason = values.reason.trim()
  if (reason.length < 3) errors.reason = 'Describe the work you did (at least 3 characters).'
  else if (reason.length > 500) errors.reason = 'Use at most 500 characters.'
  return errors
}

/* ---------- API: employee ---------- */

export function listMyCompOffRequests(token: string, signal?: AbortSignal) {
  return apiRequest<CompOffRequestRecord[]>('/api/employee/comp-off-requests', { token, signal })
}

export function requestCompOff(token: string, values: CompOffFormValues) {
  return apiRequest<CompOffRequestRecord>('/api/employee/comp-off-requests', {
    token,
    method: 'POST',
    body: { workDate: values.workDate, days: Number(values.days), reason: values.reason.trim() },
  })
}

/* ---------- API: HR ---------- */

export function listCompOffRequests(token: string, status: 'PENDING' | 'APPROVED' | 'REJECTED', signal?: AbortSignal) {
  return apiRequest<CompOffRequestRecord[]>(`/api/hr/comp-off-requests?status=${status}`, { token, signal })
}

export function decideCompOff(token: string, id: number, decision: 'approve' | 'reject', note?: string) {
  return apiRequest<CompOffRequestRecord>(`/api/hr/comp-off-requests/${id}/${decision}`, {
    token, method: 'POST', body: { note: note?.trim() || null },
  })
}
