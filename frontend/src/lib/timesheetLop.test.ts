import { describe, expect, it } from 'vitest'
import { hoursProblem, prepareWeek, weekTotals, type WeekData, type WeekDayData } from './timesheetWeek'

/**
 * Week of Mon 5 Oct 2026. Pattern letters: W working, H holiday, F full day of
 * approved leave, P working day with leave waiting for HR, O weekly off.
 */
function week(pattern: string, paidLeaveAvailable: boolean | undefined): WeekData {
  const days: WeekDayData[] = [...pattern].map((c, i) => {
    const date = `2026-10-${String(5 + i).padStart(2, '0')}`
    const weeklyOff = c === 'O'
    const scheduled = weeklyOff ? 0 : 9
    const target = c === 'W' || c === 'P' ? 9 : 0
    return {
      date,
      kind: c === 'H' ? 'HOLIDAY' : weeklyOff ? 'WEEKLY_OFF' : 'WORKING',
      weeklyOff,
      holidayName: c === 'H' ? 'Holiday' : null,
      beforeJoining: false,
      leave: c === 'F' ? 'FULL_DAY' : null,
      scheduledHours: scheduled,
      targetHours: target,
      hours: null,
      entryStatus: null,
      editable: c === 'W' || c === 'P',
      pendingLeave: c === 'P',
    }
  })
  const expected = days.reduce((sum, d) => sum + Number(d.targetHours), 0)
  return {
    weekStart: '2026-10-05', weekEnd: '2026-10-11', today: '2026-10-14', status: 'DRAFT', description: null,
    savedAt: null, submittedAt: null, days,
    target: { scheduledHours: 45, holidayHours: 0, leaveHours: 0, expectedHours: expected, enteredHours: 0, remainingHours: expected },
    submitOpensOn: '2026-10-09', canSubmit: false, submitBlockedReason: null, paidLeaveAvailable,
  }
}

const hours = (...values: string[]) =>
  Object.fromEntries(values.map((v, i) => [`2026-10-${String(5 + i).padStart(2, '0')}`, v]))

describe('LOP: an employee with no paid leave left', () => {
  const noLeave = week('WWWWWOO', false)

  it('a 0-hour working day is LOP and leaves the total, so 36 hours must be entered exactly', () => {
    const t = weekTotals(noLeave, hours('9', '9', '9', '9', '0'))
    expect(t).toMatchObject({ expected: 45, required: 36, entered: 36, remaining: 0, over: 0, lopDays: 1 })
    expect(t.empty).toEqual({ '2026-10-09': 'LOP' })
    expect(hoursProblem(t)).toBeNull()
    const { body, errors } = prepareWeek(noLeave, hours('9', '9', '9', '9', '0'), 'Work', 'submit')
    expect(errors.form).toBeUndefined()
    expect(body.days).toContainEqual({ date: '2026-10-09', hours: 0 })
  })

  it('partial days are not LOP: the rest must still match exactly', () => {
    const t = weekTotals(noLeave, hours('9', '9', '9', '8', '0'))
    expect(t.required).toBe(36)
    expect(hoursProblem(t)).toBe('Enter 1 more hours: this week needs exactly 36 hours.')
  })

  it('two LOP days', () => {
    const t = weekTotals(noLeave, hours('9', '0', '9', '0', '9'))
    expect(t).toMatchObject({ required: 27, entered: 27, lopDays: 2 })
    expect(hoursProblem(t)).toBeNull()
  })

  it('a week can never be submitted with no hours at all, even with no leave left', () => {
    expect(hoursProblem(weekTotals(noLeave, hours('0', '0', '0', '0', '0')))).toBe('Enter hours for at least one working day.')
  })
})

describe('an employee who still has paid leave', () => {
  const withLeave = week('WWWWWOO', true)

  it('an empty day must be covered by leave or hours: it is not LOP', () => {
    const t = weekTotals(withLeave, hours('9', '9', '9', '9', '0'))
    expect(t).toMatchObject({ required: 45, lopDays: 0 })
    expect(t.empty).toEqual({ '2026-10-09': 'NEEDS_LEAVE' })
    expect(prepareWeek(withLeave, hours('9', '9', '9', '9', '0'), 'Work', 'submit').errors.form)
      .toBe('Fri 9 Oct has no hours. You still have paid leave, so apply for leave for that day or enter the hours worked.')
  })

  it('names every day that still needs leave', () => {
    expect(hoursProblem(weekTotals(withLeave, hours('9', '0', '9', '0', '9'))))
      .toBe('Tue 6 Oct, Thu 8 Oct have no hours. You still have paid leave, so apply for leave for those days or enter the hours worked.')
  })

  it('more than the target is refused: the week must match exactly', () => {
    const w = week('WWWWWOO', true)
    w.days[0].targetHours = 8   // an 8-hour Monday in the schedule
    w.target.expectedHours = 44
    expect(hoursProblem(weekTotals(w, hours('9', '9', '9', '9', '9'))))
      .toBe('This week needs exactly 44 hours, but 45 are entered. Remove 1 hours.')
  })

  it('an older server that does not say treats empty days as needing leave, never as LOP', () => {
    expect(weekTotals(week('WWWWWOO', undefined), hours('9', '9', '9', '9', '0')).empty).toEqual({ '2026-10-09': 'NEEDS_LEAVE' })
  })
})

describe('a blank day is unfilled; only a day with 0 entered can be LOP', () => {
  const noLeave = week('WWWWWOO', false)

  it('Fri entered as 0 is LOP (36 required); Tue-Thu left blank are 27 unfilled hours', () => {
    const t = weekTotals(noLeave, hours('9', '', '', '', '0'))
    expect(t).toMatchObject({ total: 36, counted: 9, remaining: 27, lopDays: 1 })
    expect(t.empty).toMatchObject({ '2026-10-06': 'UNFILLED', '2026-10-07': 'UNFILLED', '2026-10-08': 'UNFILLED', '2026-10-09': 'LOP' })
    expect(hoursProblem(t)).toBe('Tue 6 Oct, Wed 7 Oct, Thu 8 Oct are not filled in. Enter the hours worked, or 0 for a day you did not work.')
  })

  it('blank days never shrink the target, even with no paid leave left', () => {
    expect(weekTotals(noLeave, hours('9', '', '', '', '')).remaining).toBe(36)
  })

  it('a draft keeps a 0 as 0, and a blank box as no hours', () => {
    const { body } = prepareWeek(noLeave, hours('9', '0', ''), '', 'draft')
    expect(body.days.slice(0, 3)).toEqual([
      { date: '2026-10-05', hours: 9 }, { date: '2026-10-06', hours: 0 }, { date: '2026-10-07', hours: null },
    ])
  })
})

describe('days that are never LOP or counted twice', () => {
  it('a day with leave waiting for HR leaves the total without being LOP', () => {
    const t = weekTotals(week('WWWWPOO', true), hours('9', '9', '9', '9', ''))
    expect(t).toMatchObject({ required: 36, lopDays: 0 })
    expect(t.empty).toEqual({ '2026-10-09': 'PENDING_LEAVE' })
  })

  it('holidays, approved leave and weekly offs take no hours and are never empty days', () => {
    const t = weekTotals(week('WFWWHOO', false), hours('9', '', '9', '0'))
    expect(t.expected).toBe(27)
    expect(t.empty).toEqual({ '2026-10-08': 'LOP' })
    expect(t).toMatchObject({ required: 18, entered: 18, remaining: 0 })
  })
})
