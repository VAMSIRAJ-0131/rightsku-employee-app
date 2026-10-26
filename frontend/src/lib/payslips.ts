// Payslips by month and year, for the Payslips screen's two dropdowns.
// HR uploads one payslip per employee per month; its period is "YYYY-MM".
import type { EmployeeDocument } from '../data/types'

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * The month a payslip is for, as "YYYY-MM": its period, or else read from a
 * title like "Payslip - September 2026". Null when neither says.
 */
export function payslipPeriod(doc: Pick<EmployeeDocument, 'title' | 'period'>): string | null {
  if (doc.period && /^\d{4}-\d{2}$/.test(doc.period)) return doc.period
  const m = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i.exec(doc.title)
  if (!m) return null
  const month = MONTH_NAMES.findIndex((n) => n.toLowerCase() === m[1].toLowerCase()) + 1
  return `${m[2]}-${String(month).padStart(2, '0')}`
}

/** "September 2026" for "2026-09". */
export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return `${MONTH_NAMES[m - 1]} ${y}`
}

/** The payslip for this year and month (1-12), or null when HR hasn't issued one. */
export function findPayslip<T extends Pick<EmployeeDocument, 'title' | 'period'>>(payslips: T[], year: number, month: number): T | null {
  const wanted = `${year}-${String(month).padStart(2, '0')}`
  return payslips.find((p) => payslipPeriod(p) === wanted) ?? null
}

/** Years to choose from: every year with a payslip, plus this year; newest first. */
export function payslipYears(payslips: Pick<EmployeeDocument, 'title' | 'period'>[], today = new Date()): number[] {
  const years = new Set<number>([today.getFullYear()])
  for (const p of payslips) {
    const period = payslipPeriod(p)
    if (period) years.add(Number(period.slice(0, 4)))
  }
  return [...years].sort((a, b) => b - a)
}

/** Where the dropdowns start: the newest payslip's month, or last month when there is none. */
export function defaultPayslipChoice(payslips: Pick<EmployeeDocument, 'title' | 'period'>[], today = new Date()): { year: number; month: number } {
  const newest = payslips.map(payslipPeriod).filter((p): p is string => !!p).sort().at(-1)
  if (newest) return { year: Number(newest.slice(0, 4)), month: Number(newest.slice(5, 7)) }
  const last = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  return { year: last.getFullYear(), month: last.getMonth() + 1 }
}
