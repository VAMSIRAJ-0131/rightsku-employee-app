import { describe, expect, it } from 'vitest'
import { hoursProblem, prepareWeek, weekTotals, type WeekData, type WeekDayData } from './timesheetWeek'

/**
 * Week of Mon 5 Oct 2026, as the server sends it. Letters: W working,
 * F full day of approved leave, H holiday, O weekly off.
 */
function week(pattern: string, paidLeaveAvailable = true): WeekData {
  let leave = 0
  let holiday = 0
  const days: WeekDayData[] = [...pattern].map((c, i) => {
    const weeklyOff = c === 'O'
    const scheduled = weeklyOff ? 0 : 9
    if (c === 'F') leave += 9
    if (c === 'H') holiday += 9
    return {
      date: `2026-10-${String(5 + i).padStart(2, '0')}`,
      kind: c === 'H' ? 'HOLIDAY' : weeklyOff ? 'WEEKLY_OFF' : 'WORKING',
      weeklyOff, holidayName: c === 'H' ? 'Holiday' : null, beforeJoining: false,
      leave: c === 'F' ? 'FULL_DAY' : null,
      scheduledHours: scheduled, targetHours: c === 'W' ? 9 : 0,
      hours: null, entryStatus: null, editable: c === 'W',
    }
  })
  const scheduled = days.reduce((s, d) => s + Number(d.scheduledHours), 0)
  const expected = scheduled - holiday - leave
  return {
    weekStart: '2026-10-05', weekEnd: '2026-10-11', today: '2026-10-14', status: 'DRAFT', description: null,
    savedAt: null, submittedAt: null, days,
    target: { scheduledHours: scheduled, holidayHours: holiday, leaveHours: leave, expectedHours: expected, enteredHours: 0, remainingHours: expected },
    submitOpensOn: '2026-10-09', canSubmit: false, submitBlockedReason: null, paidLeaveAvailable,
  }
}

describe('approved leave counts toward the 45 hours', () => {
  const w = week('WFFFWOO') // Mon worked, Tue-Thu approved leave (27 h), Fri to work

  it('45 required − 9 worked − 27 approved leave = 9 remaining', () => {
    const t = weekTotals(w, { '2026-10-05': '9', '2026-10-09': '' })
    expect(t).toMatchObject({ total: 45, leave: 27, entered: 9, counted: 36 })
    expect(t.remaining).toBe(9)
  })

  it('remaining goes down as hours are entered, and reaches 0 at exactly 45', () => {
    expect(weekTotals(w, { '2026-10-05': '9', '2026-10-09': '4' }).remaining).toBe(5)
    const full = weekTotals(w, { '2026-10-05': '9', '2026-10-09': '9' })
    expect(full).toMatchObject({ counted: 45, remaining: 0, over: 0 })
    expect(hoursProblem(full)).toBeNull()
    expect(prepareWeek(w, { '2026-10-05': '9', '2026-10-09': '9' }, 'Work', 'submit').errors.form).toBeUndefined()
  })

  it('submitting short or over says how many hours, counting the leave (the server wording)', () => {
    expect(prepareWeek(w, { '2026-10-05': '9', '2026-10-09': '8' }, 'Work', 'submit').errors.form)
      .toBe('Enter 1 more hours: this week needs exactly 45 hours (27 h approved leave + 18 h worked).')
    expect(hoursProblem(weekTotals(w, { '2026-10-05': '9', '2026-10-09': '9.5' })))
      .toBe('This week needs exactly 45 hours (27 h approved leave + 18 h worked), but 45.5 are counted. Remove 0.5 hours.')
  })

  it('leave days are never "apply for leave" or LOP days', () => {
    expect(weekTotals(week('WFFFWOO', false), { '2026-10-05': '9', '2026-10-09': '9' }).empty).toEqual({})
  })

  it('holidays and weekly offs reduce the week; leave does not', () => {
    const t = weekTotals(week('WFWHWOO'), { '2026-10-05': '9', '2026-10-07': '9', '2026-10-09': '9' })
    expect(t).toMatchObject({ total: 36, leave: 9, counted: 36, remaining: 0 })
  })

  it('leave plus a LOP day: 45 − 9 LOP = 36 = 27 worked + 9 leave', () => {
    const t = weekTotals(week('WFWWWOO', false), { '2026-10-05': '9', '2026-10-07': '9', '2026-10-08': '9', '2026-10-09': '0' })
    expect(t).toMatchObject({ total: 36, counted: 36, remaining: 0, lopDays: 1 })
  })
})
