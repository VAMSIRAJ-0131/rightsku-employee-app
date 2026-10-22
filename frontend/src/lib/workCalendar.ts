// Working schedules, holidays and timesheets.
//
// The server decides which days are working days (HR schedule in force on
// that date, minus company holidays) and refuses timesheets for any other
// day. The app shows the same calendar so those dates are disabled up front.
// The weekly timesheet (Save / Submit for approval) is in timesheetWeek.ts.
import { apiRequest } from './api'
import { toIsoDate } from './format'
import type { Status, Timesheet } from '../data/types'

export type DayKind = 'WORKING' | 'WEEKLY_OFF' | 'HOLIDAY'
export type Weekday = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'

export const WEEKDAYS: { id: Weekday; short: string; label: string }[] = [
  { id: 'MONDAY', short: 'Mon', label: 'Monday' },
  { id: 'TUESDAY', short: 'Tue', label: 'Tuesday' },
  { id: 'WEDNESDAY', short: 'Wed', label: 'Wednesday' },
  { id: 'THURSDAY', short: 'Thu', label: 'Thursday' },
  { id: 'FRIDAY', short: 'Fri', label: 'Friday' },
  { id: 'SATURDAY', short: 'Sat', label: 'Saturday' },
  { id: 'SUNDAY', short: 'Sun', label: 'Sunday' },
]

export interface CalendarDay {
  date: string
  kind: DayKind
  /** Also true for a holiday that falls on a weekly off. */
  weeklyOff: boolean
  holidayName: string | null
  hoursPerDay: number | string
}

export interface CalendarData {
  from: string
  to: string
  today: string
  days: CalendarDay[]
}

export interface TimesheetRecord {
  id: number
  date: string
  hours: number | string
  description: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string
  submittedAt: string
  /** HR's note when the day was reviewed, if any. */
  remark?: string | null
}

export interface ScheduleView {
  effectiveFrom: string | null
  weeklyOffs: Weekday[]
  hoursPerDay: number | string
  companyDefault: boolean
}

export interface ScheduleData {
  employeeId: number
  current: ScheduleView
  upcoming: ScheduleView[]
  saved: ScheduleView[]
  companyDefault: ScheduleView
}

export interface HolidayRecord {
  id: number
  date: string
  name: string
  weekday: Weekday
}

/** Timesheets can go back this many days (same as the server). */
export const MAX_DAYS_BACK = 60
/** Fewest and most hours that can be logged for one working day (same as the server). */
export const MIN_HOURS_PER_DAY = 1
export const MAX_HOURS_PER_DAY = 9

/* ---------- Month grid for the timesheet date picker ---------- */

export type CellState =
  | 'available' // working day that can be picked
  | 'submitted' // working day with an entry already
  | 'weekly-off'
  | 'holiday'
  | 'future'
  | 'too-old' // before the allowed range (or before the calendar was loaded)
  | 'outside' // padding from the previous / next month

export interface DayCell {
  iso: string
  day: number
  state: CellState
  disabled: boolean
  /** Spoken / tooltip text, e.g. "2 Oct, holiday: Gandhi Jayanti". */
  label: string
  holidayName: string | null
  isToday: boolean
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return toIsoDate(d)
}

/** First and last date of a month ("2026-10" -> 2026-10-01 .. 2026-10-31). */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Weeks (Monday first) for one month. A date can be picked only when the
 * server's calendar says it is a working day, it is not in the future, not
 * older than MAX_DAYS_BACK days, and has no entry yet.
 */
export function buildMonthGrid(
  month: string,
  calendar: CalendarDay[],
  today: string,
  submittedDates: Set<string>,
): DayCell[][] {
  const { from, to } = monthRange(month)
  const byDate = new Map(calendar.map((d) => [d.date, d]))
  const oldest = addDays(today, -MAX_DAYS_BACK)
  const first = new Date(`${from}T00:00:00`)
  const offset = (first.getDay() + 6) % 7 // Monday = 0
  const daysInMonth = Number(to.slice(8, 10))
  const weekCount = Math.ceil((offset + daysInMonth) / 7)
  let cursor = addDays(from, -offset)
  const weeks: DayCell[][] = []
  for (let w = 0; w < weekCount; w++) {
    const week: DayCell[] = []
    for (let i = 0; i < 7; i++) {
      week.push(cellFor(cursor, from, to, byDate, today, oldest, submittedDates))
      cursor = addDays(cursor, 1)
    }
    weeks.push(week)
  }
  return weeks
}

function cellFor(
  iso: string, from: string, to: string, byDate: Map<string, CalendarDay>,
  today: string, oldest: string, submitted: Set<string>,
): DayCell {
  const day = Number(iso.slice(8, 10))
  const info = byDate.get(iso)
  const base = { iso, day, holidayName: info?.holidayName ?? null, isToday: iso === today }
  const pretty = new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  let state: CellState
  if (iso < from || iso > to) state = 'outside'
  else if (info?.kind === 'HOLIDAY') state = 'holiday'
  else if (info?.kind === 'WEEKLY_OFF') state = 'weekly-off'
  else if (iso > today) state = 'future'
  else if (iso < oldest || !info) state = 'too-old'
  else if (submitted.has(iso)) state = 'submitted'
  else state = 'available'
  const labels: Record<CellState, string> = {
    available: `${pretty}, working day`,
    submitted: `${pretty}, already submitted`,
    'weekly-off': `${pretty}, weekly off`,
    holiday: `${pretty}, holiday: ${info?.holidayName ?? ''}`,
    future: `${pretty}, future date`,
    'too-old': `${pretty}, too far back`,
    outside: pretty,
  }
  return { ...base, state, disabled: state !== 'available', label: labels[state] }
}

/* ---------- Timesheet form ---------- */

export interface TimesheetFormValues {
  date: string
  hours: string
  description: string
}

export type TimesheetFormErrors = Partial<Record<keyof TimesheetFormValues, string>>

export function validateTimesheet(values: TimesheetFormValues, pickable: Set<string>): TimesheetFormErrors {
  const errors: TimesheetFormErrors = {}
  if (!values.date) errors.date = 'Pick a working day in the calendar.'
  else if (!pickable.has(values.date)) errors.date = 'This date can’t take a timesheet. Pick a working day.'
  const hoursProblem = checkDayHours(values.hours)
  if (hoursProblem) errors.hours = hoursProblem
  const description = values.description.trim()
  if (!description) errors.description = 'Describe the work you did.'
  else if (description.length > 500) errors.description = 'Use at most 500 characters.'
  return errors
}

export const DAY_HOURS_MESSAGE = `Enter hours from ${MIN_HOURS_PER_DAY} to ${MAX_HOURS_PER_DAY}, in steps of 0.25 (for example 7.5).`

/** Hours for one day: 1 to 9 in steps of 0.25 (15 minutes). Returns the problem, if any. */
export function checkDayHours(value: string): string | undefined {
  const hours = Number(value)
  if (
    !value.trim() || !Number.isFinite(hours) || hours < MIN_HOURS_PER_DAY || hours > MAX_HOURS_PER_DAY
    || Math.round(hours * 4) !== hours * 4
  ) {
    return DAY_HOURS_MESSAGE
  }
  return undefined
}

/* ---------- Weeks ---------- */

/** Monday of the week that contains this date. */
export function weekStartOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return addDays(iso, -((d.getDay() + 6) % 7))
}

const STATUS: Record<string, Status> = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected' }

/** The shape the existing timesheet lists and home card use. */
export function toTimesheet(record: TimesheetRecord, employeeId: string): Timesheet {
  return {
    id: String(record.id),
    employeeId,
    date: record.date,
    hours: Number(record.hours),
    description: record.description,
    status: STATUS[record.status] ?? 'Pending',
    remark: record.remark ?? undefined,
    submittedAt: record.submittedAt ?? undefined,
  }
}

/* ---------- HR schedule form ---------- */

export interface ScheduleFormValues {
  weeklyOffs: Weekday[]
  hoursPerDay: string
  effectiveFrom: string
}

export type ScheduleFormErrors = Partial<Record<keyof ScheduleFormValues, string>>

/** today: "YYYY-MM-DD". A new schedule can start today or later (same rule as the server). */
export function validateSchedule(values: ScheduleFormValues, today: string): ScheduleFormErrors {
  const errors: ScheduleFormErrors = {}
  if (new Set(values.weeklyOffs).size >= 7) errors.weeklyOffs = 'Leave at least one working day in the week.'
  const hours = Number(values.hoursPerDay)
  if (!values.hoursPerDay.trim() || !Number.isFinite(hours) || hours <= 0 || hours > 24 || Math.round(hours * 4) !== hours * 4) {
    errors.hoursPerDay = 'Enter hours from 0.25 to 24, in steps of 0.25.'
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.effectiveFrom)) errors.effectiveFrom = 'Choose the date this schedule starts.'
  else if (values.effectiveFrom < today) errors.effectiveFrom = 'Choose today or a later date. Past days keep their schedule.'
  return errors
}

export function describeWeeklyOffs(offs: Weekday[]): string {
  if (offs.length === 0) return 'No weekly off'
  return WEEKDAYS.filter((d) => offs.includes(d.id)).map((d) => d.label).join(', ')
}

/* ---------- HR holiday form ---------- */

export interface HolidayFormValues {
  date: string
  name: string
}

export function validateHoliday(values: HolidayFormValues): Partial<Record<keyof HolidayFormValues, string>> {
  const errors: Partial<Record<keyof HolidayFormValues, string>> = {}
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) errors.date = 'Choose the holiday date.'
  const name = values.name.trim()
  if (!name) errors.name = 'Enter the holiday name.'
  else if (name.length > 100) errors.name = 'Use at most 100 characters.'
  return errors
}

/* ---------- API ---------- */

export function getMyCalendar(token: string, from: string, to: string, signal?: AbortSignal) {
  return apiRequest<CalendarData>(`/api/employee/calendar?from=${from}&to=${to}`, { token, signal })
}

export function listMyTimesheets(token: string, from: string, to: string, signal?: AbortSignal) {
  return apiRequest<TimesheetRecord[]>(`/api/employee/timesheets?from=${from}&to=${to}`, { token, signal })
}

export function getSchedule(token: string, employeeId: number, signal?: AbortSignal) {
  return apiRequest<ScheduleData>(`/api/hr/employees/${employeeId}/schedule`, { token, signal })
}

export function saveSchedule(token: string, employeeId: number, values: ScheduleFormValues) {
  return apiRequest<ScheduleData>(`/api/hr/employees/${employeeId}/schedule`, {
    token,
    method: 'PUT',
    body: {
      weeklyOffs: values.weeklyOffs,
      hoursPerDay: Number(values.hoursPerDay),
      effectiveFrom: values.effectiveFrom,
    },
  })
}

export function listHolidays(token: string, year: number, signal?: AbortSignal) {
  return apiRequest<HolidayRecord[]>(`/api/hr/holidays?year=${year}`, { token, signal })
}

export function addHoliday(token: string, values: HolidayFormValues) {
  return apiRequest<HolidayRecord>('/api/hr/holidays', {
    token, method: 'POST', body: { date: values.date, name: values.name.trim() },
  })
}

export function changeHoliday(token: string, id: number, values: HolidayFormValues) {
  return apiRequest<HolidayRecord>(`/api/hr/holidays/${id}`, {
    token, method: 'PUT', body: { date: values.date, name: values.name.trim() },
  })
}

export function removeHoliday(token: string, id: number) {
  return apiRequest<null>(`/api/hr/holidays/${id}`, { token, method: 'DELETE' })
}
