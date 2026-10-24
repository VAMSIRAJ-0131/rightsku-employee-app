import { describe, expect, it } from 'vitest'
import { approvedLeaveLabel, creditedDay, progressPercent, weekTotals, type WeekData, type WeekDayData } from './timesheetWeek'

/** A week as the server sends it. kinds: W working, O weekly off, H holiday; leave: approved full days. */
function serverWeek(kinds: string, opts: { leave?: number[]; holidayHours?: number } = {}): WeekData {
  const dates = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']
  const days: WeekDayData[] = dates.map((date, i) => {
    const k = kinds[i]
    const leave = opts.leave?.includes(i) && k === 'W' ? 'FULL_DAY' : null
    return {
      date,
      kind: k === 'W' ? 'WORKING' : k === 'O' ? 'WEEKLY_OFF' : 'HOLIDAY',
      weeklyOff: k === 'O',
      holidayName: k === 'H' ? 'Dasara' : null,
      beforeJoining: false,
      leave,
      scheduledHours: k === 'O' ? 0 : 9,
      targetHours: k === 'W' && !leave ? 9 : 0,
      hours: null,
      entryStatus: null,
      editable: k === 'W' && !leave,
      pendingLeave: false,
      emptyMeaning: null,
      creditedHours: leave ? 9 : 0,
      leaveType: leave ? 'Casual' : null,
    } as WeekDayData
  })
  const working = [...kinds].filter((k) => k !== 'O').length
  const holidays = [...kinds].filter((k) => k === 'H').length * 9
  const leaveHours = (opts.leave ?? []).length * 9
  return {
    weekStart: dates[0], weekEnd: dates[6], today: '2026-10-25', status: 'DRAFT', description: null, savedAt: null,
    submittedAt: null, days, submitOpensOn: dates[6], canSubmit: false, submitBlockedReason: null, paidLeaveAvailable: true,
    target: {
      scheduledHours: working * 9, holidayHours: holidays, leaveHours, expectedHours: working * 9 - holidays - leaveHours,
      enteredHours: 0, remainingHours: 0,
    },
  } as WeekData
}

/** Hours typed per editable day, by date. */
function typed(week: WeekData, perDay: number, count = 99): Record<string, string> {
  const out: Record<string, string> = {}
  for (const d of week.days.filter((x) => x.editable).slice(0, count)) out[d.date] = String(perDay)
  return out
}

describe('Total / Filled / Unfilled hours', () => {
  it('Tuesday and Wednesday off: five 9-hour days fill the 45 hours (weekly offs are 0 h)', () => {
    const week = serverWeek('WOOWWWW')
    const t = weekTotals(week, typed(week, 9))
    expect([t.totalHours, t.filled, t.unfilled, t.progress]).toEqual([45, 45, 0, 100])
  })

  it('only three working days filled: 27 filled, 18 unfilled', () => {
    const week = serverWeek('WOOWWWW')
    const t = weekTotals(week, typed(week, 9, 3))
    expect([t.totalHours, t.filled, t.unfilled]).toEqual([45, 27, 18])
  })

  it('a holiday keeps Total at 45, adds nothing to Filled and is never unfilled', () => {
    const week = serverWeek('WWWHWOO')
    const t = weekTotals(week, typed(week, 9))
    expect([t.totalHours, t.credited, t.filled, t.unfilled, t.progress]).toEqual([45, 0, 36, 0, 100])
    const partly = weekTotals(week, typed(week, 9, 3))
    expect([partly.filled, partly.unfilled]).toEqual([27, 9])
  })

  it('approved full-day leave is credited once', () => {
    const week = serverWeek('WWWWWOO', { leave: [0] })
    const t = weekTotals(week, typed(week, 9))
    expect([t.totalHours, t.filled, t.unfilled]).toEqual([45, 45, 0])
  })

  it('the agreed example: 2 weekly offs, 1 holiday, four 9-hour days = 45 / 36 / 0 (never 63 or 54)', () => {
    const week = serverWeek('WOOHWWW')
    const t = weekTotals(week, typed(week, 9))
    expect(t.totalHours).toBe(45)
    expect(t.filled).toBe(36)
    expect(t.unfilled).toBe(0)
    expect(t.progress).toBe(100)
    expect(t.totalHours).not.toBe(63)
    expect(t.totalHours).not.toBe(54)
  })

  it('nothing entered: 0 filled and an empty bar', () => {
    const week = serverWeek('WOOWWWW')
    const t = weekTotals(week, {})
    expect([t.filled, t.unfilled, t.progress]).toEqual([0, 45, 0])
  })
})

describe('progress bar', () => {
  it('is Filled / Total and never passes 100%', () => {
    expect(progressPercent(0, 45)).toBe(0)
    expect(progressPercent(22.5, 45)).toBe(50)
    expect(progressPercent(45, 45)).toBe(100)
    expect(progressPercent(60, 45)).toBe(100)
    expect(progressPercent(10, 0)).toBe(0)
    expect(progressPercent(-5, 45)).toBe(0)
  })
})

describe('days without typing', () => {
  const week = serverWeek('WOOHWWW', { leave: [4] })
  it('weekly offs and holidays show 0 h; approved leave shows its hours and type; working days are typed', () => {
    expect(creditedDay(week.days[1])).toEqual({ hours: 0, reason: 'weekly-off' })
    expect(creditedDay(week.days[3])).toEqual({ hours: 0, reason: 'holiday' })
    expect(creditedDay(week.days[4])).toEqual({ hours: 9, reason: 'leave' })
    expect(approvedLeaveLabel(week.days[4])).toBe('Casual leave (approved)')
    expect(approvedLeaveLabel({ leaveType: null })).toBe('Approved leave')
    expect(creditedDay(week.days[0])).toBeNull()
  })

  it('a submitted day or a day before joining is never shown as credited', () => {
    expect(creditedDay({ ...week.days[1], beforeJoining: true })).toBeNull()
    expect(creditedDay({ ...week.days[0], entryStatus: 'PENDING' })).toBeNull()
  })
})
