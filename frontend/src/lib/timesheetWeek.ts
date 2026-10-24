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
  /** Approved leave hours on this day, counted without typing (0 on weekly offs and holidays). */
  creditedHours?: number | string
  /** The approved leave's type, e.g. "Casual" (older servers leave it out). */
  leaveType?: string | null
  /** A leave request for this day is waiting for HR. */
  pendingLeave?: boolean
  /** For a working day left at 0 hours: LOP, PENDING_LEAVE or NEEDS_LEAVE (server's view of the saved week). */
  emptyMeaning?: EmptyMeaning | null
}

/**
 * What a working day without hours means (the same rule as the server's WeekSubmission).
 * A blank box is UNFILLED (still to be entered; blocks submitting), unless its leave is
 * waiting for HR. A box with 0 ("did not work") is one of:
 * PENDING_LEAVE: its leave is waiting for HR, so it leaves the week's total and is not LOP;
 * LOP: no paid leave is left, so it is Loss of Pay and leaves the week's total;
 * NEEDS_LEAVE: paid leave is still available, so apply for leave or enter hours before submitting.
 */
export type EmptyMeaning = 'LOP' | 'PENDING_LEAVE' | 'NEEDS_LEAVE' | 'UNFILLED'

export interface WeekTargetData {
  scheduledHours: number | string
  holidayHours: number | string
  leaveHours: number | string
  expectedHours: number | string
  enteredHours: number | string
  remainingHours: number | string
  /** What must be entered exactly: expected hours minus empty LOP and pending-leave days. */
  requiredHours?: number | string
  lopDays?: number
  /** The summary (older servers leave these out): Total 45 for a normal week, Filled = worked + credits. */
  totalHours?: number | string
  filledHours?: number | string
  unfilledHours?: number | string
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
  /** Whether at least one day of paid leave is still available (decides what an empty day means). */
  paidLeaveAvailable?: boolean
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

/** "2026-10-16" -> "Fri 16 Oct" (the same wording as the server's day lists). */
export function formatDayShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return `${SHORT_DAYS[d.getDay()]} ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`
}

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
  /** The week's own target: scheduled hours minus holidays and approved leave. */
  expected: number
  /** What must be entered exactly: expected minus empty LOP and pending-leave days. */
  required: number
  /** Hours worked only: submitted days (not rejected) plus what is typed now. */
  entered: number
  remaining: number
  /** Hours of approved leave this week: they count toward the week's hours. */
  leave: number
  /** Everything the week must add up to: required (worked) plus approved leave. 45 for a normal week. */
  total: number
  /** What counts so far: hours worked plus approved leave. */
  counted: number
  /** Hours counted above the total. */
  over: number
  /** What each empty editable working day currently means, by date. */
  empty: Record<string, EmptyMeaning>
  lopDays: number
  /** Total hours: the scheduled hours of the working days (45 for a normal week). */
  totalHours: number
  /** Hours counted without typing: approved leave on working days (holidays and weekly offs add nothing). */
  credited: number
  /** Filled hours: worked + credited, at most Total. */
  filled: number
  /** Unfilled hours: Total - holiday hours (excused) - Filled, never below 0. */
  unfilled: number
  /** Filled / Total, from 0 to 100. */
  progress: number
}

/** What an editable working day without hours means right now: blank, or 0 typed. */
export function emptyMeaningOf(week: WeekData, day: WeekDayData, zeroTyped = true): EmptyMeaning {
  if (day.pendingLeave) return 'PENDING_LEAVE'
  if (!zeroTyped) return 'UNFILLED'
  // An older server does not say; treat it as "paid leave available" so nothing turns into LOP silently.
  return week.paidLeaveAvailable === false ? 'LOP' : 'NEEDS_LEAVE'
}

/** Live totals while the employee types (the same rule as the server's WeekSubmission). */
export function weekTotals(week: WeekData, hours: Record<string, string>): WeekTotals {
  let entered = 0
  const expected = round(num(week.target.expectedHours))
  let required = expected
  const empty: Record<string, EmptyMeaning> = {}
  for (const day of week.days) {
    if (day.editable) {
      const text = (hours[day.date] ?? '').trim()
      const value = Number(text)
      if (text && Number.isFinite(value) && value > 0) {
        entered += value
      } else if (!text || value === 0) {
        const meaning = emptyMeaningOf(week, day, !!text)
        empty[day.date] = meaning
        if (meaning === 'LOP' || meaning === 'PENDING_LEAVE') required -= num(day.targetHours)
      }
    } else if (day.entryStatus && day.entryStatus !== 'REJECTED') {
      entered += num(day.hours)
    }
  }
  entered = round(entered)
  required = round(required)
  const leave = round(num(week.target.leaveHours))
  // The summary the employee sees (same rule as the server's WeekTarget): Total is
  // the schedule's working days (45, also with a holiday); Filled = worked + approved
  // leave. Weekly offs and holidays are 0 h.
  const totalHours = round(num(week.target.scheduledHours))
  const credited = leave
  const filled = round(Math.min(totalHours, Math.max(0, entered + credited)))
  // A holiday's hours are excused, not owed: they are never unfilled (or LOP).
  const owed = round(Math.max(0, totalHours - num(week.target.holidayHours)))
  const unfilled = round(Math.max(0, owed - filled))
  return {
    expected,
    required,
    entered,
    leave,
    total: round(required + leave),
    counted: round(entered + leave),
    remaining: round(Math.max(0, required - entered)),
    over: round(Math.max(0, entered - required)),
    empty,
    lopDays: Object.values(empty).filter((m) => m === 'LOP').length,
    totalHours,
    credited,
    filled,
    unfilled,
    // Full when nothing is unfilled (in a holiday week, at 36 of 45 hours).
    progress: progressPercent(filled, owed),
  }
}

/** How full the progress bar is: Filled / Total as 0-100, never below 0 or above 100. */
export function progressPercent(filled: number, total: number): number {
  if (!(total > 0) || !(filled > 0)) return 0
  return Math.min(100, Math.round((filled / total) * 1000) / 10)
}

/**
 * A day the employee does not type hours for, with the hours it shows and
 * why: a weekly off or company holiday (always 0 h), or approved full-day
 * leave (its hours, counted in Filled once). null when hours are entered.
 */
export function creditedDay(day: WeekDayData): { hours: number; reason: 'weekly-off' | 'holiday' | 'leave' } | null {
  if (day.beforeJoining || day.entryStatus) return null
  if (day.kind === 'WEEKLY_OFF' || (day.kind === 'HOLIDAY' && day.weeklyOff)) return { hours: 0, reason: 'weekly-off' }
  if (day.kind === 'HOLIDAY') return { hours: 0, reason: 'holiday' }
  if (day.leave === 'FULL_DAY') {
    return { hours: day.creditedHours === undefined ? num(day.scheduledHours) : num(day.creditedHours), reason: 'leave' }
  }
  return null
}

/** "Holiday - Dasara" (just "Holiday" when it has no name). */
export function holidayLabel(day: Pick<WeekDayData, 'holidayName'>): string {
  return day.holidayName ? `Holiday - ${day.holidayName}` : 'Holiday'
}

/** "Casual leave (approved)", or "Approved leave" when the server does not say which type. */
export function approvedLeaveLabel(day: Pick<WeekDayData, 'leaveType'>): string {
  return day.leaveType ? `${day.leaveType} leave (approved)` : 'Approved leave'
}

/** Why the week can't be submitted yet because of its hours (the server's wording), or null. */
export function hoursProblem(totals: WeekTotals): string | null {
  const needLeave = Object.entries(totals.empty).filter(([, m]) => m === 'NEEDS_LEAVE').map(([d]) => d).sort()
  const split = totals.leave > 0
    ? ` (${formatHours(totals.leave)} h approved leave + ${formatHours(totals.required)} h worked)`
    : ''
  if (totals.entered === 0) {
    if (totals.required <= 0) return 'Enter hours for at least one working day.'
    return totals.leave > 0
      ? `Enter this week's hours worked: ${formatHours(totals.total)} h less ${formatHours(totals.leave)} h approved leave leaves ${
        formatHours(totals.required)} h.`
      : `Enter this week's ${formatHours(totals.required)} hours.`
  }
  if (needLeave.length > 0) {
    const days = needLeave.map(formatDayShort).join(', ')
    return `${days} ${needLeave.length === 1 ? 'has' : 'have'} no hours. You still have paid leave, so apply for leave for ${
      needLeave.length === 1 ? 'that day' : 'those days'} or enter the hours worked.`
  }
  const unfilled = Object.entries(totals.empty).filter(([, m]) => m === 'UNFILLED').map(([d]) => d).sort()
  if (unfilled.length > 0) {
    return `${unfilled.map(formatDayShort).join(', ')} ${unfilled.length === 1 ? 'is' : 'are'
    } not filled in. Enter the hours worked, or 0 for a day you did not work.`
  }
  if (totals.remaining > 0) {
    return `Enter ${formatHours(totals.remaining)} more hours: this week needs exactly ${formatHours(totals.total)} hours${split}.`
  }
  if (totals.over > 0) {
    return `This week needs exactly ${formatHours(totals.total)} hours${split}, but ${formatHours(totals.counted)} are ${
      totals.leave > 0 ? 'counted' : 'entered'}. Remove ${formatHours(totals.over)} hours.`
  }
  return null
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
 * last working day reached and exactly the week's required hours (see weekTotals).
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
    if (Number(value) === 0) {
      days.push({ date: day.date, hours: 0 }) // "did not work": LOP or leave (see weekTotals)
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
    } else {
      const problem = hoursProblem(totals)
      if (problem) errors.form = problem
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
