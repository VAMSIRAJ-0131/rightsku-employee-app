import { describe, expect, it } from 'vitest'
import { nextOptionIndex } from '../components/Dropdown'
import type { EmployeeDocument } from '../data/types'
import { DOCUMENT_FILTERS, documentFilterOptions, filterDocuments } from './documents'

const doc = (id: string, type: EmployeeDocument['type']): EmployeeDocument => ({
  id, employeeId: '10002', type, title: `${type} ${id}`, issuedOn: '2026-10-01',
})

const docs = [
  doc('1', 'Payslip'), doc('2', 'Payslip'), doc('3', 'Offer Letter'), doc('4', 'Form 16'),
]

describe('document type filter', () => {
  it('keeps the same choices, in the same order, as the old chips', () => {
    expect(DOCUMENT_FILTERS).toEqual(['All', 'Offer Letter', 'Experience Letter', 'Payslip', 'Form 16'])
  })

  it('shows everything for All and only the chosen type otherwise', () => {
    expect(filterDocuments(docs, 'All')).toHaveLength(4)
    expect(filterDocuments(docs, 'Payslip').map((d) => d.id)).toEqual(['1', '2'])
    expect(filterDocuments(docs, 'Offer Letter').map((d) => d.id)).toEqual(['3'])
    expect(filterDocuments(docs, 'Experience Letter')).toEqual([])
    expect(filterDocuments(docs, 'Form 16').map((d) => d.id)).toEqual(['4'])
  })

  it('dropdown options show how many documents each choice has', () => {
    expect(documentFilterOptions(docs)).toEqual([
      { value: 'All', label: 'All documents', hint: '4' },
      { value: 'Offer Letter', label: 'Offer Letter', hint: '1' },
      { value: 'Experience Letter', label: 'Experience Letter', hint: '0' },
      { value: 'Payslip', label: 'Payslip', hint: '2' },
      { value: 'Form 16', label: 'Form 16', hint: '1' },
    ])
  })

  it('shows no counts while the documents are still loading', () => {
    expect(documentFilterOptions(null).every((o) => o.hint === undefined)).toBe(true)
  })
})

describe('dropdown keyboard moves', () => {
  // Months: November and December disabled (not started yet).
  const months = [false, false, false, false, false, false, false, false, false, false, true, true]

  it('moves down and up, wrapping round and skipping disabled options', () => {
    expect(nextOptionIndex(months, 0, 1)).toBe(1)
    expect(nextOptionIndex(months, 9, 1)).toBe(0)     // October -> wraps to January, skipping Nov/Dec
    expect(nextOptionIndex(months, 0, -1)).toBe(9)    // January -> up to October
  })

  it('Home and End go to the first and last option that can be chosen', () => {
    expect(nextOptionIndex(months, 5, 'first')).toBe(0)
    expect(nextOptionIndex(months, 5, 'last')).toBe(9)
  })

  it('starts at an end when nothing is focused, and returns -1 when nothing can be chosen', () => {
    expect(nextOptionIndex(months, -1, 1)).toBe(0)
    expect(nextOptionIndex(months, -1, -1)).toBe(9)
    expect(nextOptionIndex([true, true], 0, 1)).toBe(-1)
  })
})
