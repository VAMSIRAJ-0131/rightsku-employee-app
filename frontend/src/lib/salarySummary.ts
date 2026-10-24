// HR monthly salary summary (GET /api/hr/salary-summary, HR Admins only).
// The server does every calculation; this file only loads it and turns it
// into a CSV that Excel opens directly.
import { apiRequest } from './api'

export interface SalaryRow {
  serialNo: number
  employeeId: number
  employeeCode: string
  employeeName: string
  employmentStatus: string
  joiningDate: string | null
  employedDays: number
  workingDays: number
  presentDays: number
  paidLeaveDays: number
  unpaidLeaveDays: number
  holidays: number
  weeklyOffs: number
  absences: number
  pendingDays: number
  /** Working days HR must look at (no timesheet submitted, rejected): not counted as LOP. */
  reviewDays: number
  notYetDue: number
  lopDays: number
  payableDays: number
  complete: boolean
  flags: string[]
}

export interface SalarySummary {
  year: number
  month: number
  from: string
  to: string
  daysInMonth: number
  provisional: boolean
  asOf: string
  generatedAt: string
  rows: SalaryRow[]
  totals: {
    employees: number
    presentDays: number
    paidLeaveDays: number
    unpaidLeaveDays: number
    absences: number
    pendingDays: number
    reviewDays: number
    lopDays: number
    payableDays: number
    needsReview: number
  }
}

export function getSalarySummary(token: string, year: number, month: number, signal?: AbortSignal) {
  return apiRequest<SalarySummary>(`/api/hr/salary-summary?year=${year}&month=${month}`, { token, signal })
}

/** Salary is processed early in the month for the month before, so that is the default. */
export function defaultPayrollMonth(today: Date = new Date()): { year: number; month: number } {
  const d = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

export function monthName(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

/** The same rules the server applies (SalarySummaryService), in plain words for the screen and the export. */
export const SALARY_RULES: string[] = [
  'Every day from the joining date is counted once: holiday, weekly off, or working day.',
  'Holidays and weekly offs (from each employee’s work schedule) are paid.',
  'On a working day: approved leave = paid leave; otherwise an approved timesheet with hours = present.',
  'Employees can submit a week only when its hours match the target exactly (45 h for five 9-hour days, less holidays and approved leave). A day may be left at 0 hours only when no paid leave is left (LOP) or its leave is waiting for HR.',
  'Absence (LOP) = a 0-hour working day in a week HR approved: the employee had no paid leave left.',
  'Pending = a timesheet or leave still waiting for HR, including 0-hour days of a week not yet approved. Never LOP.',
  'Needs review = no timesheet submitted for the week, a rejected timesheet, or a 0-hour day whose leave was rejected. Not LOP until HR decides.',
  'All leave types in the app (Casual, Sick, Earned, Comp-Off) are paid. There is no unpaid leave type yet, so Unpaid leave is 0.',
  'LOP days = unpaid leave + absences. Payable days = employed days in the month − LOP days.',
  'A row is complete only when the month is over and nothing is pending or needs review.',
]

const HEADERS = [
  'S.No', 'Employee ID', 'Employee Name', 'Status', 'Joining Date', 'Employed Days', 'Working Days', 'Present Days',
  'Paid Leave', 'Unpaid Leave (LOP)', 'Holidays', 'Weekly Offs', 'Absences (LOP)', 'Pending Approval', 'Needs Review', 'Not Yet Due',
  'LOP Days', 'Payable Days', 'Ready for Payroll', 'Notes',
]

/**
 * One CSV cell. Quotes when needed, and stops spreadsheet formulas: a value
 * starting with = + - @ (or a tab/return) gets a leading apostrophe, so a
 * name can never run as a formula in Excel.
 */
export function csvCell(value: string | number | boolean | null | undefined): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** The whole report as CSV (UTF-8 with BOM so Excel shows ₹, ’ and names correctly). */
export function salaryCsv(report: SalarySummary): string {
  const lines: string[] = []
  lines.push(csvCell(`RIGHTSKU salary summary – ${monthName(report.year, report.month)}`))
  lines.push(csvCell(`Period ${report.from} to ${report.to}${report.provisional ? ` (PROVISIONAL: month not over on ${report.asOf})` : ''}`))
  lines.push('')
  lines.push(HEADERS.map(csvCell).join(','))
  for (const r of report.rows) {
    lines.push([
      r.serialNo, r.employeeCode, r.employeeName, r.employmentStatus, r.joiningDate ?? '', r.employedDays, r.workingDays,
      r.presentDays, r.paidLeaveDays, r.unpaidLeaveDays, r.holidays, r.weeklyOffs, r.absences, r.pendingDays, r.reviewDays, r.notYetDue,
      r.lopDays, r.payableDays, r.complete ? 'Yes' : 'No – check notes', r.flags.join(' | '),
    ].map(csvCell).join(','))
  }
  const t = report.totals
  lines.push([
    '', 'TOTAL', `${t.employees} employees`, '', '', '', '', t.presentDays, t.paidLeaveDays, t.unpaidLeaveDays, '', '',
    t.absences, t.pendingDays, t.reviewDays, '', t.lopDays, t.payableDays, `${t.needsReview} to review`, '',
  ].map(csvCell).join(','))
  lines.push('')
  lines.push(csvCell('How the figures are calculated'))
  for (const rule of SALARY_RULES) lines.push(csvCell(rule))
  return `﻿${lines.join('\r\n')}\r\n`
}

export function salaryCsvFileName(report: SalarySummary): string {
  return `Salary summary ${report.year}-${String(report.month).padStart(2, '0')}.csv`
}
