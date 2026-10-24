import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  compOffDayChoices, compOffDayLabel, compOffDaysLabel, compOffWindow, decideCompOff, listCompOffRequests,
  listMyCompOffRequests, requestCompOff, validateCompOff, type CompOffRequestRecord,
} from './compOffRequests'
import { EMPTY_SUMMARY, pendingTotal } from './approvals'
import type { CalendarDay } from './workCalendar'

const TODAY = '2026-10-14' // Wednesday
const TOKEN = 'test-only-token'

/** Server calendar days from..to; offs are JS weekdays (0 = Sunday). */
function serverDays(from: string, to: string, offs: number[] = [6, 0], holidays: Record<string, string> = {}): CalendarDay[] {
  const days: CalendarDay[] = []
  for (let d = new Date(`${from}T00:00:00`); ; d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (iso > to) break
    const weeklyOff = offs.includes(d.getDay())
    const holidayName = holidays[iso] ?? null
    days.push({ date: iso, kind: holidayName ? 'HOLIDAY' : weeklyOff ? 'WEEKLY_OFF' : 'WORKING', weeklyOff, holidayName, hoursPerDay: 9 })
  }
  return days
}

function request(workDate: string, status: string): CompOffRequestRecord {
  return {
    id: 1, employeeId: 10, employeeCode: 'EMP010', employeeName: 'Ravi Kumar', workDate, dayKind: 'WEEKLY_OFF',
    holidayName: null, days: 1, reason: 'Release', status, submittedAt: null, reviewedAt: null, reviewNote: null,
  }
}

function ok(body: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Comp-Off request days', () => {
  const { from, to } = compOffWindow(TODAY)
  const window = serverDays(from, to, [6, 0], { '2026-10-02': 'Gandhi Jayanti' })

  it('covers the last 30 days up to yesterday', () => {
    expect(compOffWindow(TODAY)).toEqual({ from: '2026-09-14', to: '2026-10-13' })
  })

  it('offers only weekly offs and holidays, newest first', () => {
    const choices = compOffDayChoices(window, TODAY, [])
    expect(choices.every((d) => d.kind !== 'WORKING')).toBe(true)
    expect(choices.map((d) => d.date).slice(0, 3)).toEqual(['2026-10-11', '2026-10-10', '2026-10-04'])
    expect(choices.map((d) => d.date)).toContain('2026-10-02')
    expect(choices.map((d) => d.date)).not.toContain('2026-10-12')
  })

  it("follows the employee's own weekly offs (Tuesday and Wednesday)", () => {
    const tueWed = serverDays(from, to, [2, 3])
    const choices = compOffDayChoices(tueWed, TODAY, []).map((d) => d.date)
    expect(choices).toContain('2026-10-13') // Tuesday
    expect(choices).not.toContain('2026-10-11') // Sunday is a working day for them
  })

  it('leaves out days already asked for, unless that request was rejected', () => {
    const choices = compOffDayChoices(window, TODAY, [request('2026-10-11', 'PENDING'), request('2026-10-10', 'APPROVED'),
      request('2026-10-04', 'REJECTED')]).map((d) => d.date)
    expect(choices).not.toContain('2026-10-11')
    expect(choices).not.toContain('2026-10-10')
    expect(choices).toContain('2026-10-04')
  })

  it('labels days and lengths plainly', () => {
    expect(compOffDayLabel({ date: '2026-10-11', kind: 'WEEKLY_OFF', holidayName: null })).toMatch(/Sun.*11.*Oct · Weekly off/)
    expect(compOffDayLabel({ date: '2026-10-02', kind: 'HOLIDAY', holidayName: 'Gandhi Jayanti' })).toMatch(/· Gandhi Jayanti$/)
    expect(compOffDaysLabel(1)).toBe('Full day')
    expect(compOffDaysLabel('0.5')).toBe('Half day')
  })
})

describe('Comp-Off request form', () => {
  const choices = compOffDayChoices(serverDays('2026-09-14', '2026-10-13'), TODAY, [])

  it('accepts a past weekly off with full or half day and a description', () => {
    expect(validateCompOff({ workDate: '2026-10-11', days: '1', reason: 'Release support' }, TODAY, choices)).toEqual({})
    expect(validateCompOff({ workDate: '2026-10-11', days: '0.5', reason: 'Release support' }, TODAY, choices)).toEqual({})
  })

  it('refuses today, the future, more than 30 days ago and working days', () => {
    const v = (workDate: string) => validateCompOff({ workDate, days: '1', reason: 'Release support' }, TODAY, choices).workDate
    expect(v('')).toBe('Choose the day you worked.')
    expect(v(TODAY)).toBe('Choose a day that has already passed.')
    expect(v('2026-10-18')).toBe('Choose a day that has already passed.')
    expect(v('2026-09-13')).toContain('at most 30 days')
    expect(v('2026-10-12')).toBe('Choose one of your weekly offs or company holidays.')
  })

  it('needs a description of the work', () => {
    expect(validateCompOff({ workDate: '2026-10-11', days: '1', reason: ' x ' }, TODAY, choices).reason).toBeDefined()
    expect(validateCompOff({ workDate: '2026-10-11', days: '1', reason: 'y'.repeat(501) }, TODAY, choices).reason).toBeDefined()
  })
})

describe('Comp-Off request API', () => {
  it('sends the employee request with the day, length and trimmed description', async () => {
    const fetchMock = ok(request('2026-10-11', 'PENDING'), 201)
    vi.stubGlobal('fetch', fetchMock)

    const result = await requestCompOff(TOKEN, { workDate: '2026-10-11', days: '0.5', reason: '  Release support  ' })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/employee/comp-off-requests')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ workDate: '2026-10-11', days: 0.5, reason: 'Release support' })
    expect(new Headers(init.headers).get('Authorization')).toBe(`Bearer ${TOKEN}`)
    expect(result.ok).toBe(true)
  })

  it('lists the employee’s own requests and HR’s queue by status', async () => {
    const fetchMock = ok([request('2026-10-11', 'PENDING')])
    vi.stubGlobal('fetch', fetchMock)

    await listMyCompOffRequests(TOKEN)
    await listCompOffRequests(TOKEN, 'APPROVED')

    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/api/employee/comp-off-requests')
    expect((fetchMock.mock.calls[1] as unknown as [string])[0]).toBe('/api/hr/comp-off-requests?status=APPROVED')
  })

  it('sends HR decisions with the note', async () => {
    const fetchMock = ok(request('2026-10-11', 'REJECTED'))
    vi.stubGlobal('fetch', fetchMock)

    await decideCompOff(TOKEN, 7, 'reject', '  Not agreed in advance ')
    await decideCompOff(TOKEN, 8, 'approve')

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/hr/comp-off-requests/7/reject')
    expect(JSON.parse(String(init.body))).toEqual({ note: 'Not agreed in advance' })
    const [url2, init2] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(url2).toBe('/api/hr/comp-off-requests/8/approve')
    expect(JSON.parse(String(init2.body))).toEqual({ note: null })
  })
})

describe('approval counts', () => {
  it('include Comp-Off requests, and work with servers that leave them out', () => {
    expect(pendingTotal({ ...EMPTY_SUMMARY, timesheets: { pending: 2, approved: 0, rejected: 0 },
      leave: { pending: 1, approved: 0, rejected: 0 }, compOff: { pending: 3, approved: 0, rejected: 0 } })).toBe(6)
    expect(pendingTotal({ timesheets: { pending: 2, approved: 0, rejected: 0 }, leave: { pending: 1, approved: 0, rejected: 0 } }))
      .toBe(3)
  })
})
