// Timesheet history, one summary per week (Monday to Sunday).
//
// Built only from saved timesheet entries (what the server returns from
// GET /api/employee/timesheets), so draft hours are never counted, and days
// submitted with the older one-day submit land in their week like any other.
// Nothing is changed or re-sent: this only groups what is already saved.
import type { Status, Timesheet } from '../data/types'
import { formatShortDate, toIsoDate } from './format'
import { MAX_DAYS_BACK, weekStartOf } from './workCalendar'

/** A week's overall status: one status when every day has it, otherwise "Mixed". */
export type WeekHistoryStatus = Status | 'Mixed'

export interface WeekHistory {
  /** Monday, "YYYY-MM-DD". */
  weekStart: string
  /** Sunday, "YYYY-MM-DD". */
  weekEnd: string
  /** "12 Oct – 18 Oct" */
  label: string
  /** The saved day entries, Monday first. */
  entries: Timesheet[]
  /** Sum of the saved entries' hours. */
  totalHours: number
  status: WeekHistoryStatus
  /** When the week (its latest day) was sent for approval, "YYYY-MM-DD", if known. */
  submittedOn: string | null
  /** How many days have each status, e.g. { Approved: 3, Pending: 2 }. */
  counts: Partial<Record<Status, number>>
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Groups saved entries by week, newest week first. Entries are not changed. */
export function groupByWeek(entries: Timesheet[]): WeekHistory[] {
  const byWeek = new Map<string, Timesheet[]>()
  for (const entry of entries) {
    const monday = weekStartOf(entry.date)
    const list = byWeek.get(monday)
    if (list) list.push(entry)
    else byWeek.set(monday, [entry])
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([weekStart, list]) => {
      const days = [...list].sort((a, b) => a.date.localeCompare(b.date))
      const counts: Partial<Record<Status, number>> = {}
      let total = 0
      for (const e of days) {
        counts[e.status] = (counts[e.status] ?? 0) + 1
        total += Number(e.hours) || 0
      }
      const statuses = Object.keys(counts) as Status[]
      const sent = days.map((e) => e.submittedAt).filter((x): x is string => !!x).sort()
      const submittedOn = sent.length ? toIsoDate(new Date(sent[sent.length - 1])) : null
      const weekEnd = addDays(weekStart, 6)
      return {
        weekStart,
        weekEnd,
        label: `${formatShortDate(weekStart)} – ${formatShortDate(weekEnd)}`,
        entries: days,
        totalHours: Math.round(total * 100) / 100,
        status: statuses.length === 1 ? statuses[0] : 'Mixed',
        submittedOn,
        counts,
      }
    })
}

/** How many different weeks these entries cover. */
export function weekCount(entries: Timesheet[]): number {
  return new Set(entries.map((e) => weekStartOf(e.date))).size
}

/** "5 entries · 44 hours" */
export function weekSummaryLine(week: WeekHistory): string {
  const n = week.entries.length
  return `${n} ${n === 1 ? 'entry' : 'entries'} · ${week.totalHours} ${week.totalHours === 1 ? 'hour' : 'hours'}`
}

/** For a mixed week: "3 approved · 2 pending". Empty for a single-status week. */
export function statusBreakdown(week: WeekHistory): string {
  if (week.status !== 'Mixed') return ''
  return (['Approved', 'Pending', 'Rejected'] as Status[])
    .filter((s) => week.counts[s])
    .map((s) => `${week.counts[s]} ${s.toLowerCase()}`)
    .join(' · ')
}

/** Opens or closes one week; every week starts closed. */
export function toggleWeek(open: ReadonlySet<string>, weekStart: string): Set<string> {
  const next = new Set(open)
  if (next.has(weekStart)) next.delete(weekStart)
  else next.add(weekStart)
  return next
}

/* ---------- Home: the month, week by week ---------- */

// Timesheets are never cancelled (only leave and Comp-Off requests are).
export type MonthWeekStatus = Exclude<Status, 'Cancelled'> | 'Not submitted'

export interface MonthWeek {
  /** "Week 1" ... "Week 5". */
  label: string
  /** Monday and Sunday of the week, "YYYY-MM-DD". */
  weekStart: string
  weekEnd: string
  /** The days of this week inside the month, e.g. "1 – 4 Oct". */
  range: string
  status: MonthWeekStatus
  /** The week that contains today. */
  current: boolean
}

/**
 * The weeks (Monday to Sunday) that have days in the month of `today`:
 * Week 1 holds the 1st, and a fifth (or sixth) week appears when the month
 * needs it. Each week's status comes from all of its saved entries: Rejected
 * if any day is rejected, otherwise Pending if any day is waiting, Approved
 * only when every saved day is approved, and Not submitted when nothing was
 * saved. One approved day never makes a whole week approved.
 */
/**
 * Whether the week starting on this Monday can be opened in the timesheet:
 * this week back to the week of 60 days ago, the same limits as the
 * timesheet's arrows, swipe and the server. Past weeks open to be looked at:
 * hours only go in on the day itself. Future weeks can't be opened.
 */
export function canOpenWeek(weekStart: string, today: string): boolean {
  return weekStart <= weekStartOf(today) && weekStart >= oldestOpenWeek(today)
}

/** The Monday of the oldest week the timesheet opens on (60 days back). */
export function oldestOpenWeek(today: string): string {
  return weekStartOf(addDays(today, -MAX_DAYS_BACK))
}

export function monthWeeks(entries: Timesheet[], today: string): MonthWeek[] {
  const first = `${today.slice(0, 7)}-01`
  const d = new Date(`${first}T00:00:00`)
  const last = toIsoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0))
  const thisMonday = weekStartOf(today)
  const weeks: MonthWeek[] = []
  for (let monday = weekStartOf(first), n = 1; monday <= last; monday = addDays(monday, 7), n++) {
    const sunday = addDays(monday, 6)
    const inWeek = entries.filter((e) => e.date >= monday && e.date <= sunday)
    const from = monday < first ? first : monday
    const to = sunday > last ? last : sunday
    weeks.push({
      label: `Week ${n}`,
      weekStart: monday,
      weekEnd: sunday,
      range: `${Number(from.slice(8))} – ${Number(to.slice(8))} ${new Date(`${to}T00:00:00`).toLocaleDateString('en-IN', { month: 'short' })}`,
      status: inWeek.length === 0 ? 'Not submitted'
        : inWeek.some((e) => e.status === 'Rejected') ? 'Rejected'
        : inWeek.some((e) => e.status === 'Pending') ? 'Pending'
        : 'Approved',
      current: monday === thisMonday,
    })
  }
  return weeks
}
