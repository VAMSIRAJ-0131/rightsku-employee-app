import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  csvCell, defaultPayrollMonth, getSalarySummary, salaryCsv, salaryCsvFileName, type SalarySummary,
} from './salarySummary'

afterEach(() => {
  vi.unstubAllGlobals()
})

const report: SalarySummary = {
  year: 2026, month: 9, from: '2026-09-01', to: '2026-09-30', daysInMonth: 30, provisional: false, asOf: '2026-10-05',
  generatedAt: '2026-10-05T05:00:00Z',
  rows: [
    {
      serialNo: 1, employeeId: 10, employeeCode: 'EMP010', employeeName: 'Ravi Kumar', employmentStatus: 'ACTIVE',
      joiningDate: '2025-01-06', employedDays: 30, workingDays: 21, presentDays: 13, paidLeaveDays: 4, unpaidLeaveDays: 0,
      holidays: 1, weeklyOffs: 8, absences: 2, pendingDays: 2, reviewDays: 0, notYetDue: 0, lopDays: 2, payableDays: 28, complete: false,
      flags: ['2 working day(s) waiting for HR to approve a timesheet or leave.', 'Check, "quoted"'],
    },
    {
      serialNo: 2, employeeId: 20, employeeCode: 'EMP020', employeeName: '=HYPERLINK("x")', employmentStatus: 'ACTIVE',
      joiningDate: null, employedDays: 30, workingDays: 21, presentDays: 21, paidLeaveDays: 0, unpaidLeaveDays: 0,
      holidays: 1, weeklyOffs: 8, absences: 0, pendingDays: 0, reviewDays: 0, notYetDue: 0, lopDays: 0, payableDays: 30, complete: true, flags: [],
    },
  ],
  totals: { employees: 2, presentDays: 34, paidLeaveDays: 4, unpaidLeaveDays: 0, absences: 2, pendingDays: 2, reviewDays: 0, lopDays: 2, payableDays: 58, needsReview: 1 },
}

describe('csvCell', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a, b')).toBe('"a, b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell(12)).toBe('12')
    expect(csvCell(null)).toBe('')
  })

  it('never lets a value run as a spreadsheet formula', () => {
    for (const bad of ['=1+1', '+1', '-1', '@SUM(A1)']) {
      expect(csvCell(bad).replace(/^"/, '').startsWith("'")).toBe(true)
    }
  })
})

describe('salaryCsv', () => {
  const csv = salaryCsv(report)
  const lines = csv.split('\r\n')

  it('starts with a BOM so Excel reads UTF-8, and has the payroll columns in order', () => {
    expect(csv.startsWith('﻿')).toBe(true)
    expect(lines[3]).toBe(
      'S.No,Employee ID,Employee Name,Status,Joining Date,Employed Days,Working Days,Present Days,Paid Leave,'
      + 'Unpaid Leave (LOP),Holidays,Weekly Offs,Absences (LOP),Pending Approval,Needs Review,Not Yet Due,LOP Days,Payable Days,Ready for Payroll,Notes',
    )
  })

  it('writes one line per employee with the figures from the server', () => {
    expect(lines[4]).toMatch(/^1,EMP010,Ravi Kumar,ACTIVE,2025-01-06,30,21,13,4,0,1,8,2,2,0,0,2,28,No – check notes,/)
    expect(lines[4]).toContain('"2 working day(s) waiting for HR to approve a timesheet or leave. | Check, ""quoted"""')
    expect(lines[5]).toContain(`"'=HYPERLINK(""x"")"`)
    expect(lines[6]).toContain('TOTAL')
    expect(lines[6]).toContain(',58,')
  })

  it('includes the calculation rules and marks a provisional month', () => {
    expect(csv).toContain('How the figures are calculated')
    expect(csv).toContain('LOP days = unpaid leave + absences')
    expect(csv).toContain('Pending = a timesheet or leave still waiting for HR')
    expect(salaryCsv({ ...report, provisional: true })).toContain('PROVISIONAL')
  })

  it('names the file by month', () => {
    expect(salaryCsvFileName(report)).toBe('Salary summary 2026-09.csv')
  })
})

describe('defaultPayrollMonth', () => {
  it('is the month before, including across a new year', () => {
    expect(defaultPayrollMonth(new Date(2026, 9, 4))).toEqual({ year: 2026, month: 9 })
    expect(defaultPayrollMonth(new Date(2027, 0, 5))).toEqual({ year: 2026, month: 12 })
  })
})

describe('getSalarySummary', () => {
  it('calls the HR endpoint with the month and the token', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(report), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await getSalarySummary('t', 2026, 9)

    expect(result.ok && result.data.totals.payableDays).toBe(58)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/hr/salary-summary?year=2026&month=9')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t')
  })
})
