import { afterEach, describe, expect, it, vi } from 'vitest'
import { getApprovalSummary, listTimesheetWeeks, reviewTimesheetWeek, weekKey } from './approvals'

const TOKEN = 'test-only-token'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HR timesheet approvals', () => {
  it('identifies one employee-week', () => {
    expect(weekKey({ employeeId: 10, weekStart: '2026-10-05' })).toBe('10/2026-10-05')
  })

  it('loads counts and pending weeks from the server and sends the decision for one week', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await getApprovalSummary(TOKEN)
    await listTimesheetWeeks(TOKEN, 'PENDING')
    await reviewTimesheetWeek(TOKEN, { employeeId: 10, weekStart: '2026-10-05' }, 'REJECT', '  Wrong project code ')
    await reviewTimesheetWeek(TOKEN, { employeeId: 10, weekStart: '2026-10-12' }, 'APPROVE')

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(calls.map(([url, init]) => `${init.method ?? 'GET'} ${url}`)).toEqual([
      'GET /api/hr/approvals/summary',
      'GET /api/hr/timesheets?status=PENDING',
      'POST /api/hr/timesheets/review',
      'POST /api/hr/timesheets/review',
    ])
    expect(JSON.parse(calls[2][1].body as string)).toEqual({
      employeeId: 10, weekStart: '2026-10-05', decision: 'REJECT', note: 'Wrong project code',
    })
    expect(JSON.parse(calls[3][1].body as string)).toEqual({ employeeId: 10, weekStart: '2026-10-12', decision: 'APPROVE', note: null })
  })
})
