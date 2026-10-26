import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiResult } from './api'
import {
  CONFIRM_SUBMIT_MESSAGE, DRAFT_SAVED_MESSAGE, SUBMITTED_MESSAGE, createWeekActions, errorsFromServer, formatDayLong,
  getMyWeek, hasUnsavedChanges, prepareWeek, saveWeekDraft, startingHours, submitMyWeek, weekTotals,
  type WeekBody, type WeekData, type WeekDayData, type WeekStatus,
} from './timesheetWeek'

const TOKEN = 'test-only-token'

/**
 * A week as the server sends it. Days: "W" working (9 h), "O" weekly off,
 * "H" holiday on a working day, "X" holiday on a weekly off, "F" full day of
 * approved leave, "½" half day of approved leave. The target is worked out
 * the same way the server does, so the tests read like the real thing.
 */
function serverWeek(pattern: string, opts: { status?: WeekStatus; today?: string; hours?: Record<string, number> } = {}): WeekData {
  const monday = '2026-10-05'
  let scheduled = 0
  let holiday = 0
  let leave = 0
  const days: WeekDayData[] = [...pattern].map((c, i) => {
    const d = new Date(`${monday}T00:00:00`)
    d.setDate(d.getDate() + i)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const weeklyOff = c === 'O' || c === 'X'
    const counts = weeklyOff ? 0 : 9
    scheduled += counts
    const holidayHours = c === 'H' ? 9 : 0
    const leaveHours = c === 'F' ? 9 : c === '½' ? 4.5 : 0
    holiday += holidayHours
    leave += leaveHours
    const locked = opts.status === 'SUBMITTED' || opts.status === 'ALREADY_SUBMITTED'
    const editable = !locked && (c === 'W' || c === '½')
    return {
      date,
      kind: c === 'H' || c === 'X' ? 'HOLIDAY' : weeklyOff ? 'WEEKLY_OFF' : 'WORKING',
      weeklyOff,
      holidayName: c === 'H' || c === 'X' ? 'Holiday' : null,
      beforeJoining: false,
      leave: c === 'F' ? 'FULL_DAY' : c === '½' ? 'HALF_DAY' : null,
      scheduledHours: counts,
      targetHours: counts - holidayHours - leaveHours,
      hours: opts.hours?.[date] ?? null,
      entryStatus: locked && opts.hours?.[date] ? 'PENDING' : null,
      editable,
    }
  })
  const lastWorking = [...days].reverse().find((d) => d.kind === 'WORKING' && d.leave !== 'FULL_DAY')
  const expected = scheduled - holiday - leave
  return {
    weekStart: monday,
    weekEnd: '2026-10-11',
    today: opts.today ?? '2026-10-14',
    status: opts.status ?? 'NOT_STARTED',
    description: null,
    savedAt: null,
    submittedAt: opts.status === 'SUBMITTED' ? '2026-10-14T05:00:00Z' : null,
    days,
    target: {
      scheduledHours: scheduled, holidayHours: holiday, leaveHours: leave, expectedHours: expected,
      enteredHours: 0, remainingHours: expected,
    },
    submitOpensOn: lastWorking?.date ?? null,
    canSubmit: false,
    submitBlockedReason: null,
  }
}

const NORMAL = 'WWWWWOO'
const FULL_WEEK = { '2026-10-05': '9', '2026-10-06': '9', '2026-10-07': '9', '2026-10-08': '9', '2026-10-09': '9' }
const FULL_WEEK_NUMBERS = { '2026-10-05': 9, '2026-10-06': 9, '2026-10-07': 9, '2026-10-08': 9, '2026-10-09': 9 }

function ok(data: WeekData): ApiResult<WeekData> {
  return { ok: true, data, status: 200 }
}

/** A promise we resolve by hand, to look at the screen state "while the server is busy". */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

/* ---------- Weekly target ---------- */

describe('weekly target and totals', () => {
  it('a normal week of five 9-hour days is 45 hours', () => {
    const week = serverWeek(NORMAL)
    expect(weekTotals(week, {})).toMatchObject({ expected: 45, required: 45, entered: 0, remaining: 45 })
    expect(weekTotals(week, FULL_WEEK)).toMatchObject({ expected: 45, required: 45, entered: 45, remaining: 0, over: 0 })
    // Paid leave still available: an empty Friday needs leave, so the week still needs all 45 hours.
    expect(weekTotals(week, { ...FULL_WEEK, '2026-10-09': '' })).toMatchObject({ expected: 45, required: 45, entered: 36, remaining: 9 })
  })

  it('a full day of approved leave makes it 36 hours, and leave is not added to hours worked', () => {
    const week = serverWeek('WWFWWOO')
    expect(weekTotals(week, { '2026-10-05': '9', '2026-10-06': '9', '2026-10-08': '9', '2026-10-09': '9' }))
      .toMatchObject({ expected: 36, required: 36, entered: 36, remaining: 0 })
    expect(week.days[2].editable).toBe(false)
  })

  it('a half day of approved leave makes it 40.5 hours', () => {
    const week = serverWeek('WW½WWOO')
    expect(weekTotals(week, { ...FULL_WEEK, '2026-10-07': '4.5' })).toMatchObject({ expected: 40.5, required: 40.5, entered: 40.5, remaining: 0 })
    expect(weekTotals(week, { ...FULL_WEEK, '2026-10-07': '4.25' }).remaining).toBe(0.25)
  })

  it('a holiday on a working day makes it 36 hours', () => {
    expect(weekTotals(serverWeek('WWWWHOO'), {}).expected).toBe(36)
  })

  it('a holiday on a weekly off does not lower the target again', () => {
    expect(weekTotals(serverWeek('WWWWWXO'), {}).expected).toBe(45)
  })

  it('pending leave does not lower the target (the server only sends approved leave)', () => {
    // A week with a pending leave request arrives from the server as a normal week.
    const week = serverWeek(NORMAL)
    expect(week.days.every((d) => d.leave === null)).toBe(true)
    expect(weekTotals(week, {}).expected).toBe(45)
  })

  it('counts days submitted earlier, except rejected ones', () => {
    const week = serverWeek(NORMAL, { hours: { '2026-10-05': 9 } })
    week.days[0] = { ...week.days[0], entryStatus: 'PENDING', editable: false }
    expect(weekTotals(week, {}).entered).toBe(9)
    week.days[0] = { ...week.days[0], entryStatus: 'REJECTED' }
    expect(weekTotals(week, {}).entered).toBe(0)
  })
})

/* ---------- Boxes and checks ---------- */

describe('hours boxes and checks', () => {
  it('a new week starts empty; a draft starts with what was saved', () => {
    // Nothing is filled in for the employee: a new week starts empty (shown as 0).
    expect(startingHours(serverWeek('WW½WHOO'))).toEqual({
      '2026-10-05': '', '2026-10-06': '', '2026-10-07': '', '2026-10-08': '',
    })
    const draft = serverWeek(NORMAL, { status: 'DRAFT', hours: { '2026-10-05': 8.5, '2026-10-06': 9 } })
    expect(startingHours(draft)).toEqual({
      '2026-10-05': '8.5', '2026-10-06': '9', '2026-10-07': '', '2026-10-08': '', '2026-10-09': '',
    })
  })

  it('keeps the existing 1-9 hour daily rule', () => {
    for (const bad of ['0.5', '9.25', '10', '7.1', '-1']) {
      const { errors } = prepareWeek(serverWeek(NORMAL), { '2026-10-06': bad }, '', 'draft')
      expect(errors.hours['2026-10-06'], bad).toBe('Enter hours from 1 to 9, in steps of 0.25 (for example 7.5).')
    }
    for (const good of ['1', '1.25', '8.75', '9']) {
      expect(prepareWeek(serverWeek(NORMAL), { '2026-10-06': good }, '', 'draft').errors.hours, good).toEqual({})
    }
  })

  it('Save allows empty days and no description; empty boxes clear the day', () => {
    const { body, errors } = prepareWeek(serverWeek('WWWWHOO'), { '2026-10-05': '9', '2026-10-06': '' }, '  ', 'draft')
    expect(errors).toEqual({ hours: {} })
    expect(body).toEqual({
      weekStart: '2026-10-05',
      description: '',
      days: [
        { date: '2026-10-05', hours: 9 }, { date: '2026-10-06', hours: null },
        { date: '2026-10-07', hours: null }, { date: '2026-10-08', hours: null },
      ],
    })
  })

  it('too few hours block Submit and say how many are missing', () => {
    const { errors } = prepareWeek(serverWeek(NORMAL), { ...FULL_WEEK, '2026-10-09': '4.5' }, 'Work', 'submit')
    expect(errors.form).toBe('Enter 4.5 more hours: this week needs exactly 45 hours.')
  })

  it('Submit is checked against the lower target when there is a holiday or leave', () => {
    const holiday = prepareWeek(serverWeek('WWWWHOO'), FULL_WEEK, 'Work', 'submit')
    expect(holiday.errors).toEqual({ hours: {} })
    const halfDay = prepareWeek(serverWeek('WW½WWOO'), { ...FULL_WEEK, '2026-10-07': '4.5' }, 'Work', 'submit')
    expect(halfDay.errors).toEqual({ hours: {} })
  })

  it('Submit needs a description and waits for the last working day', () => {
    expect(prepareWeek(serverWeek(NORMAL), FULL_WEEK, ' ', 'submit').errors.description).toBe('Describe the work you did.')
    const early = prepareWeek(serverWeek(NORMAL, { today: '2026-10-07' }), FULL_WEEK, 'Work', 'submit')
    expect(early.errors.form).toBe('You can submit this week from Fri 9 Oct 2026, its last working day. Save it as a draft until then.')
    expect(prepareWeek(serverWeek(NORMAL, { today: '2026-10-09' }), FULL_WEEK, 'Work', 'submit').errors).toEqual({ hours: {} })
  })

  it('a submitted week can be neither saved nor submitted again', () => {
    const week = serverWeek(NORMAL, { status: 'SUBMITTED', hours: { '2026-10-05': 9 } })
    expect(prepareWeek(week, FULL_WEEK, 'Work', 'draft').errors.form).toBe('This week has already been submitted.')
    expect(prepareWeek(week, FULL_WEEK, 'Work', 'submit').errors.form).toBe('This week has already been submitted.')
  })

  it('a week whose working days were all submitted earlier can be neither saved nor submitted', () => {
    const week = serverWeek(NORMAL, { status: 'ALREADY_SUBMITTED', hours: FULL_WEEK_NUMBERS })
    const message = 'All working days of this week were already submitted, so there is nothing to save or submit.'
    expect(prepareWeek(week, {}, 'Work', 'draft').errors.form).toBe(message)
    expect(prepareWeek(week, {}, 'Work', 'submit').errors.form).toBe(message)
    expect(startingHours(week)).toEqual({})
    expect(weekTotals(week, {})).toMatchObject({ expected: 45, entered: 45, remaining: 0 })
  })

  it('Save and Submit send nothing for an already-submitted week', async () => {
    const week = serverWeek(NORMAL, { status: 'ALREADY_SUBMITTED' })
    const saveDraft = vi.fn(); const submit = vi.fn(); const confirm = vi.fn(async () => true)
    const actions = createWeekActions({ saveDraft, submit, confirm })
    expect((await actions.save(week, {}, '')).kind).toBe('invalid')
    expect((await actions.submit(week, {}, 'Work')).kind).toBe('invalid')
    expect(saveDraft).not.toHaveBeenCalled()
    expect(submit).not.toHaveBeenCalled()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('puts server refusals next to the right day or on the week', () => {
    expect(errorsFromServer({ kind: 'validation', message: 'x', fields: { 'days[2026-10-10]': 'Weekly off.' } }).hours)
      .toEqual({ '2026-10-10': 'Weekly off.' })
    expect(errorsFromServer({ kind: 'validation', message: 'x', fields: { target: 'Enter 9 more hours.' } }).form)
      .toBe('Enter 9 more hours.')
    expect(errorsFromServer({ kind: 'conflict', message: 'This week has already been submitted.', fields: {} }).form)
      .toBe('This week has already been submitted.')
  })

  it('writes dates like the server', () => {
    expect(formatDayLong('2026-10-16')).toBe('Fri 16 Oct 2026')
  })
})

/* ---------- Save ---------- */

describe('Save', () => {
  it('saves a draft, shows the message only after the server confirms, and the draft opens again', async () => {
    const reply = deferred<ApiResult<WeekData>>()
    const saveDraft = vi.fn((_body: WeekBody) => reply.promise)
    const submit = vi.fn()
    const confirm = vi.fn()
    const actions = createWeekActions({ saveDraft, submit, confirm })

    const pending = actions.save(serverWeek(NORMAL), { '2026-10-05': '9', '2026-10-06': '8.5' }, 'First days')
    let settled = false
    void pending.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false) // no message while the server is still saving
    expect(actions.isBusy()).toBe(true)

    const draft = serverWeek(NORMAL, { status: 'DRAFT', hours: { '2026-10-05': 9, '2026-10-06': 8.5 } })
    reply.resolve(ok(draft))
    const result = await pending

    expect(result).toEqual({ kind: 'saved', week: draft, message: DRAFT_SAVED_MESSAGE })
    expect(DRAFT_SAVED_MESSAGE).toBe('Draft saved successfully')
    expect(saveDraft.mock.calls[0][0].days.slice(0, 2)).toEqual([
      { date: '2026-10-05', hours: 9 }, { date: '2026-10-06', hours: 8.5 },
    ])
    expect(submit).not.toHaveBeenCalled() // Save never submits
    expect(confirm).not.toHaveBeenCalled()
    // Coming back later: the boxes start with the saved draft.
    expect(startingHours(result.kind === 'saved' ? result.week : draft)['2026-10-06']).toBe('8.5')
  })

  it('shows no success message when the server refuses', async () => {
    const actions = createWeekActions({
      saveDraft: async () => ({ ok: false, error: { kind: 'network', message: 'Can’t connect.', fields: {} } }),
      submit: vi.fn(),
      confirm: vi.fn(),
    })
    const result = await actions.save(serverWeek(NORMAL), {}, '')
    expect(result.kind).toBe('failed')
    expect(actions.isBusy()).toBe(false)
  })

  it('sends PUT /api/employee/timesheets/week/draft and GET for reopening', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(serverWeek(NORMAL, { status: 'DRAFT' })), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const body: WeekBody = { weekStart: '2026-10-05', description: '', days: [{ date: '2026-10-05', hours: 9 }] }

    await saveWeekDraft(TOKEN, body)
    await getMyWeek(TOKEN, '2026-10-05')
    await submitMyWeek(TOKEN, body)

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(calls[0][0]).toBe('/api/employee/timesheets/week/draft')
    expect(calls[0][1].method).toBe('PUT')
    expect(JSON.parse(calls[0][1].body as string)).toEqual(body)
    expect(calls[1][0]).toBe('/api/employee/timesheets/week?start=2026-10-05')
    expect(calls[2][0]).toBe('/api/employee/timesheets/week/submit')
    expect(calls[2][1].method).toBe('POST')
  })
})

/* ---------- Submit for approval ---------- */

describe('Submit for approval', () => {
  it('asks "Are you sure…?" first; Cancel sends nothing', async () => {
    const submit = vi.fn()
    const confirm = vi.fn(async () => false)
    const actions = createWeekActions({ saveDraft: vi.fn(), submit, confirm })

    const result = await actions.submit(serverWeek(NORMAL), FULL_WEEK, 'Payslip screen')

    expect(CONFIRM_SUBMIT_MESSAGE).toBe('Are you sure you want to submit this timesheet for approval?')
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ kind: 'cancelled' })
    expect(submit).not.toHaveBeenCalled()
    expect(actions.isBusy()).toBe(false)
  })

  it('does not even ask while hours are missing', async () => {
    const confirm = vi.fn(async () => true)
    const submit = vi.fn()
    const actions = createWeekActions({ saveDraft: vi.fn(), submit, confirm })

    const result = await actions.submit(serverWeek(NORMAL), { ...FULL_WEEK, '2026-10-09': '' }, 'Payslip screen')

    expect(result.kind).toBe('invalid')
    if (result.kind === 'invalid') {
      expect(result.errors.form).toBe('Fri 9 Oct is not filled in. Enter the hours worked, or 0 for a day you did not work.')
    }
    expect(confirm).not.toHaveBeenCalled()
    expect(submit).not.toHaveBeenCalled()
  })

  it('Confirm sends the week; success is shown only after the server confirms', async () => {
    const reply = deferred<ApiResult<WeekData>>()
    const submit = vi.fn((_body: WeekBody) => reply.promise)
    const actions = createWeekActions({ saveDraft: vi.fn(), submit, confirm: async () => true })

    const pending = actions.submit(serverWeek(NORMAL), FULL_WEEK, ' Payslip screen ')
    let settled = false
    void pending.then(() => { settled = true })
    await new Promise((r) => setTimeout(r, 0))
    expect(submit).toHaveBeenCalledTimes(1)
    expect(settled).toBe(false) // still waiting for the server: no success message yet

    const done = serverWeek(NORMAL, { status: 'SUBMITTED', hours: { '2026-10-05': 9 } })
    reply.resolve(ok(done))
    expect(await pending).toEqual({ kind: 'submitted', week: done, message: SUBMITTED_MESSAGE })
    expect(SUBMITTED_MESSAGE).toBe('Your timesheet has been submitted successfully.')
    expect(submit.mock.calls[0][0]).toEqual({
      weekStart: '2026-10-05',
      description: 'Payslip screen',
      days: Object.entries(FULL_WEEK).map(([date, hours]) => ({ date, hours: Number(hours) })),
    })
  })

  it('a refused submission shows the server message, not success', async () => {
    const actions = createWeekActions({
      saveDraft: vi.fn(),
      submit: async () => ({ ok: false, error: { kind: 'conflict', message: 'This week has already been submitted.', fields: {} } }),
      confirm: async () => true,
    })
    const result = await actions.submit(serverWeek(NORMAL), FULL_WEEK, 'Work')
    expect(result.kind).toBe('failed')
    if (result.kind === 'failed') expect(result.errors.form).toBe('This week has already been submitted.')
  })

  it('a double tap sends the week only once', async () => {
    const reply = deferred<ApiResult<WeekData>>()
    const submit = vi.fn((_body: WeekBody) => reply.promise)
    const confirm = vi.fn(async () => true)
    const saveDraft = vi.fn()
    const actions = createWeekActions({ saveDraft, submit, confirm })
    const week = serverWeek(NORMAL)

    const first = actions.submit(week, FULL_WEEK, 'Work')
    const second = await actions.submit(week, FULL_WEEK, 'Work') // tapped again while the first is running
    const save = await actions.save(week, FULL_WEEK, 'Work') // and Save while it is running

    expect(second).toEqual({ kind: 'busy' })
    expect(save).toEqual({ kind: 'busy' })
    reply.resolve(ok(serverWeek(NORMAL, { status: 'SUBMITTED' })))
    expect((await first).kind).toBe('submitted')
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(saveDraft).not.toHaveBeenCalled()
  })
})

describe('hasUnsavedChanges', () => {
  const saved = { hours: { '2026-10-05': '9', '2026-10-06': '' }, description: 'Release work' }

  it('is false while nothing differs from what was saved', () => {
    expect(hasUnsavedChanges(saved, { '2026-10-05': '9', '2026-10-06': '' }, 'Release work')).toBe(false)
    expect(hasUnsavedChanges(saved, { '2026-10-05': ' 9 ' }, 'Release work ')).toBe(false)
  })

  it('notices typed hours and a changed description', () => {
    expect(hasUnsavedChanges(saved, { '2026-10-05': '9', '2026-10-06': '8' }, 'Release work')).toBe(true)
    expect(hasUnsavedChanges(saved, { '2026-10-05': '', '2026-10-06': '' }, 'Release work')).toBe(true)
    expect(hasUnsavedChanges(saved, { '2026-10-05': '9', '2026-10-06': '' }, 'Testing')).toBe(true)
  })
})

describe('only today open', () => {
  it('counts the hours saved on earlier days, which can no longer be changed', () => {
    // Wednesday 7 Oct: Monday and Tuesday were saved on their own days, today is typed now.
    const base = serverWeek(NORMAL, { status: 'DRAFT', today: '2026-10-07', hours: { '2026-10-05': 9, '2026-10-06': 8 } })
    const week = { ...base, days: base.days.map((d) => ({ ...d, editable: d.date === '2026-10-07' })) }
    expect(startingHours(week)).toEqual({ '2026-10-07': '' })
    expect(weekTotals(week, { '2026-10-07': '7.5' }).entered).toBe(24.5)
    expect(weekTotals(week, {}).entered).toBe(17)
  })
})
