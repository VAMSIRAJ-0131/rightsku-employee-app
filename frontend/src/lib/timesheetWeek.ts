// Weekly timesheet: Save (draft) and Submit for approval.
//
// The server works out each week's target (schedule hours, minus company
// holidays on working days, minus approved leave) and enforces every rule.
// The app shows the same numbers while the employee types and checks the
// same rules before sending, so problems show up before a round trip.
import { apiRequest, type ApiError, type ApiResult } from './api'
import { checkDayHours, type DayKind } from './workCalendar'

/** ALREADY_SUBMITTED: every working day was already submitted one day at a time; nothing to save or submit. */
export type WeekStatus = 'NOT_STARTED' | 'DRAFT' | 'SUBMITTED' | 'ALREADY_SUBMITTED'
export type LeavePortion = 'FULL_DAY' | 'HALF_DAY'

export interface WeekDayData {
  date: string
  kind: DayKind
  weeklyOff: boolean
  holidayName: string | null
  beforeJoining: boolean
  /** Approved leave on this day only (pending leave is never sent). */
  leave: LeavePortion | null
  scheduledHours: number | string
  /** Hours expected on this day after holidays and leave. */
  targetHours: number | string
  /** Saved draft hours, or the submitted entry's hours. */
  hours: number | string | null
  /** PENDING / APPROVED / REJECTED once the day is submitted. */
  entryStatus: string | null
  editable: boolean
}

export interface WeekTargetData {
  scheduledHours: number | string
  holidayHours: number | string
  leaveHours: number | string
  expectedHours: number | string
  enteredHours: number | string
  remainingHours: number | string
}

export interface WeekData {
  weekStart: string
  weekEnd: string
  today: string
  status: WeekStatus
  description: string | null
  savedAt: string | null
  submittedAt: string | null
  days: WeekDayData[]
  target: WeekTargetData
  /** Submitting opens on the week's last working day. */
  submitOpensOn: string | null
  canSubmit: boolean
  submitBlockedReason: string | null
}

export interface WeekBody {
  weekStart: string
  description: string
  days: { date: string; hours: number | null }[]
}

export const DRAFT_SAVED_MESSAGE = 'Draft saved successfully'
export const SUBMITTED_MESSAGE = 'Your timesheet has been submitted successfully.'
export const CONFIRM_SUBMIT_MESSAGE = 'Are you sure you want to submit this timesheet for approval?'
export const ALREADY_SUBMITTED_MESSAGE =
  'All working days of this week were already submitted, so there is nothing to save or submit.'

/* ---------- Numbers ---------- */

function num(value: number | string | null | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Rounds to 2 decimals so 0.1-style float noise never shows. */
function round(n: number): number {
  return Math.round(n * 100) / 100
}

/** 45 -> "45", 40.5 -> "40.5", 8.25 -> "8.25". */
export function formatHours(value: number | string | null | undefined): string {
  return String(round(num(value)))
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10-16" -> "Fri 16 Oct 2026" (the same wording as the server). */
export function formatDayLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return `${SHORT_DAYS[d.getDay()]} ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/* ---------- Form values ---------- */

/**
 * What each hours box starts with: the saved hours, or for a week not
 * started yet the day's expected hours (9 on a normal day, 4.5 on a half day
 * of leave), so a normal week takes two taps. Boxes of locked days are left out.
 */
export function startingHours(week: WeekData): Record<string, string> {
  const result: Record<string, string> = {}
  for (const day of week.days) {
    if (!day.editable) continue
    if (day.hours !== null && day.hours !== undefined) result[day.date] = formatHours(day.hours)
    else if (week.status === 'NOT_STARTED' && num(day.targetHours) >= 1) result[day.date] = formatHours(day.targetHours)
    else result[day.date] = ''
  }
  return result
}

export interface WeekTotals {
  expected: number
  /** Hours worked only: submitted days (not rejected) plus what is typed now. Leave is never added. */
  entered: number
  remaining: number
}

/** Live totals while the employee types, using the server's expected hours. */
export function weekTotals(week: WeekData, hours: Record<string, string>): WeekTotals {
  let entered = 0
  for (const day of week.days) {
    if (day.editable) {
      const value = Number((hours[day.date] ?? '').trim())
      if ((hours[day.date] ?? '').trim() && Number.isFinite(value) && value > 0) entered += value
    } else if (day.entryStatus && day.entryStatus !== 'REJECTED') {
      entered += num(day.hours)
    }
  }
  const expected = round(num(week.target.expectedHours))
  entered = round(entered)
  return { expected, entered, remaining: round(Math.max(0, expected - entered)) }
}

export interface WeekFormErrors {
  /** Per date: the problem with that day. */
  hours: Record<string, string>
  description?: string
  /** A problem with the week as a whole (hours missing, too early, already submitted). */
  form?: string
}

export function hasWeekErrors(errors: WeekFormErrors): boolean {
  return Object.keys(errors.hours).length > 0 || !!errors.description || !!errors.form
}

/**
 * Checks the week before Save or Submit and builds the request.
 * Save: each filled box must be 1-9 hours in quarter hours; empty boxes and
 * no description are fine. Submit: also needs the description, the week's
 * last working day reached and at least the week's target.
 */
export function prepareWeek(
  week: WeekData, hours: Record<string, string>, description: string, mode: 'draft' | 'submit',
): { body: WeekBody; errors: WeekFormErrors } {
  const errors: WeekFormErrors = { hours: {} }
  const days: WeekBody['days'] = []
  for (const day of week.days) {
    if (!day.editable) continue
    const value = (hours[day.date] ?? '').trim()
    if (!value) {
      days.push({ date: day.date, hours: null })
      continue
    }
    const problem = checkDayHours(value)
    if (problem) errors.hours[day.date] = problem
    else days.push({ date: day.date, hours: Number(value) })
  }

  const text = description.trim()
  if (text.length > 500) errors.description = 'Use at most 500 characters.'
  else if (!text && mode === 'submit') errors.description = 'Describe the work you did.'

  if (week.status === 'SUBMITTED') {
    errors.form = 'This week has already been submitted.'
  } else if (week.status === 'ALREADY_SUBMITTED') {
    errors.form = ALREADY_SUBMITTED_MESSAGE
  } else if (mode === 'submit' && Object.keys(errors.hours).length === 0) {
    const totals = weekTotals(week, hours)
    if (!week.submitOpensOn) errors.form = 'This week has no working days to submit.'
    else if (week.today < week.submitOpensOn) {
      errors.form = `You can submit this week from ${formatDayLong(week.submitOpensOn)}, its last working day. Save it as a draft until then.`
    } else if (totals.remaining > 0) {
      errors.form = `Enter ${formatHours(totals.remaining)} more hours to reach this week's ${formatHours(totals.expected)} hours.`
    }
  }
  return { body: { weekStart: week.weekStart, description: text, days }, errors }
}

/** Puts the server's refusal next to the right day, the description or the week. */
export function errorsFromServer(error: ApiError): WeekFormErrors {
  const errors: WeekFormErrors = { hours: {} }
  for (const [field, message] of Object.entries(error.fields)) {
    const day = /^days\[(\d{4}-\d{2}-\d{2})\]$/.exec(field)
    if (day) errors.hours[day[1]] = message
    else if (field === 'description') errors.description = message
    else errors.form = message
  }
  if (!hasWeekErrors(errors)) errors.form = error.message
  return errors
}

/* ---------- Save and Submit ---------- */

export type WeekActionResult =
  | { kind: 'saved' | 'submitted'; week: WeekData; message: string }
  | { kind: 'invalid'; errors: WeekFormErrors }
  | { kind: 'failed'; error: ApiError; errors: WeekFormErrors }
  /** The employee chose Cancel in the confirmation: nothing was sent. */
  | { kind: 'cancelled' }
  /** A save or submit is already running; this tap was ignored. */
  | { kind: 'busy' }

export interface WeekActionDeps {
  saveDraft: (body: WeekBody) => Promise<ApiResult<WeekData>>
  submit: (body: WeekBody) => Promise<ApiResult<WeekData>>
  /** Shows "Are you sure…?" and resolves true for Confirm, false for Cancel. */
  confirm: () => Promise<boolean>
}

/**
 * Save and Submit for one screen. Only one request runs at a time, so a
 * double tap can never send the week twice, and the success message is only
 * returned after the server has confirmed.
 */
export function createWeekActions(deps: WeekActionDeps) {
  let busy = false

  async function run(kind: 'saved' | 'submitted', send: () => Promise<ApiResult<WeekData>>): Promise<WeekActionResult> {
    busy = true
    try {
      const result = await send()
      if (!result.ok) return { kind: 'failed', error: result.error, errors: errorsFromServer(result.error) }
      return { kind, week: result.data, message: kind === 'saved' ? DRAFT_SAVED_MESSAGE : SUBMITTED_MESSAGE }
    } finally {
      busy = false
    }
  }

  return {
    isBusy: () => busy,

    async save(week: WeekData, hours: Record<string, string>, description: string): Promise<WeekActionResult> {
      if (busy) return { kind: 'busy' }
      const { body, errors } = prepareWeek(week, hours, description, 'draft')
      if (hasWeekErrors(errors)) return { kind: 'invalid', errors }
      return run('saved', () => deps.saveDraft(body))
    },

    async submit(week: WeekData, hours: Record<string, string>, description: string): Promise<WeekActionResult> {
      if (busy) return { kind: 'busy' }
      const { body, errors } = prepareWeek(week, hours, description, 'submit')
      if (hasWeekErrors(errors)) return { kind: 'invalid', errors }
      busy = true // no second tap while the question is open
      let confirmed: boolean
      try {
        confirmed = await deps.confirm()
      } catch {
        confirmed = false
      }
      if (!confirmed) {
        busy = false
        return { kind: 'cancelled' }
      }
      return run('submitted', () => deps.submit(body))
    },
  }
}

/* ---------- API ---------- */

export function getMyWeek(token: string, weekStart: string, signal?: AbortSignal) {
  return apiRequest<WeekData>(`/api/employee/timesheets/week?start=${weekStart}`, { token, signal })
}

export function saveWeekDraft(token: string, body: WeekBody) {
  return apiRequest<WeekData>('/api/employee/timesheets/week/draft', { token, method: 'PUT', body })
}

export function submitMyWeek(token: string, body: WeekBody) {
  return apiRequest<WeekData>('/api/employee/timesheets/week/submit', { token, method: 'POST', body })
}
