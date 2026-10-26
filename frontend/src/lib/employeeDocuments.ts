// The employee Documents screen: choose a document type (and a year for the
// yearly ones), then fetch that one document. Payslips have their own screen,
// and the experience letter is left out (it is issued only when someone
// leaves, and people who have left can't sign in).
import type { DocType, EmployeeDocument } from '../data/types'
import { calendarYears, financialYears } from './documents'

export type EmployeeDocType = Extract<DocType, 'Offer Letter' | 'Form 16' | 'Compensation Letter'>

export const EMPLOYEE_DOC_TYPES: { type: EmployeeDocType; label: string; year: 'none' | 'financial' | 'calendar' }[] = [
  { type: 'Offer Letter', label: 'Offer letter', year: 'none' },
  { type: 'Form 16', label: 'Form 16', year: 'financial' },
  { type: 'Compensation Letter', label: 'Compensation / Hike letter', year: 'calendar' },
]

export function docTypeInfo(type: EmployeeDocType) {
  return EMPLOYEE_DOC_TYPES.find((t) => t.type === type) ?? EMPLOYEE_DOC_TYPES[0]
}

/** Whether a document type can be chosen on the employee Documents screen. */
export function isEmployeeDocType(type: string): type is EmployeeDocType {
  return EMPLOYEE_DOC_TYPES.some((t) => t.type === type)
}

/**
 * The years to choose from for a yearly document, newest first: the usual
 * recent years plus any year HR has issued one for. "2025-26" for Form 16,
 * "2026" for a hike letter; empty for the offer letter.
 */
export function yearChoices(docs: EmployeeDocument[], type: EmployeeDocType, today = new Date()): string[] {
  const kind = docTypeInfo(type).year
  if (kind === 'none') return []
  const recent = kind === 'financial' ? financialYears(today) : calendarYears(today)
  const issued = docs.filter((d) => d.type === type && d.period).map((d) => d.period as string)
  return [...new Set([...recent, ...issued])].sort((a, b) => b.localeCompare(a))
}

/** Where the year starts: the newest year with a document, else the latest finished one. */
export function defaultYear(docs: EmployeeDocument[], type: EmployeeDocType, today = new Date()): string {
  const kind = docTypeInfo(type).year
  if (kind === 'none') return ''
  const issued = docs.filter((d) => d.type === type && d.period).map((d) => d.period as string).sort()
  if (issued.length) return issued[issued.length - 1]
  // Form 16 comes after the financial year ends: last year's. A hike letter: this year.
  return kind === 'financial' ? financialYears(today)[1] : calendarYears(today)[0]
}

/** The employee's document of this type (and year), or null when HR hasn't issued it. */
export function findDocument(docs: EmployeeDocument[], type: EmployeeDocType, year: string): EmployeeDocument | null {
  const kind = docTypeInfo(type).year
  return docs.find((d) => d.type === type && (kind === 'none' || d.period === year)) ?? null
}

/** "Form 16 · FY 2025-26", "Compensation / Hike letter · 2026", "Offer letter". */
export function documentLabel(type: EmployeeDocType, year: string): string {
  const info = docTypeInfo(type)
  if (info.year === 'none') return info.label
  return `${info.label} · ${info.year === 'financial' ? `FY ${year}` : year}`
}
