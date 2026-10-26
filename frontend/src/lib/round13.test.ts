import { describe, expect, it } from 'vitest'
import type { EmployeeDocument } from '../data/types'
import {
  EMPLOYEE_DOC_TYPES, defaultYear, documentLabel, findDocument, isEmployeeDocType, yearChoices,
} from './employeeDocuments'
import { RECENT_LIMIT, newestLeaveFirst, recentItems } from './recentItems'
import { clampZoom, drawStep } from '../components/DocumentViewer'

const doc = (id: string, type: EmployeeDocument['type'], period: string | null = null): EmployeeDocument =>
  ({ id, employeeId: 'E1', type, title: `${type} ${period ?? ''}`.trim(), issuedOn: '2026-05-01', period })

const today = new Date('2026-10-26T10:00:00')

describe('employee documents: type and year', () => {
  it('offers offer letter, Form 16 and hike letter, but not the experience letter', () => {
    expect(EMPLOYEE_DOC_TYPES.map((t) => t.type)).toEqual(['Offer Letter', 'Form 16', 'Compensation Letter'])
    expect(isEmployeeDocType('Experience Letter')).toBe(false)
    expect(isEmployeeDocType('Payslip')).toBe(false)
    expect(isEmployeeDocType('Form 16')).toBe(true)
  })

  it('fetches the Form 16 of the chosen financial year', () => {
    const docs = [doc('a', 'Form 16', '2024-25'), doc('b', 'Form 16', '2025-26'), doc('c', 'Offer Letter')]
    expect(findDocument(docs, 'Form 16', '2024-25')?.id).toBe('a')
    expect(findDocument(docs, 'Form 16', '2025-26')?.id).toBe('b')
    expect(findDocument(docs, 'Form 16', '2023-24')).toBeNull()
    expect(findDocument(docs, 'Offer Letter', '')?.id).toBe('c')
  })

  it('fetches the hike letter of the chosen calendar year', () => {
    const docs = [doc('h25', 'Compensation Letter', '2025'), doc('h26', 'Compensation Letter', '2026')]
    expect(findDocument(docs, 'Compensation Letter', '2025')?.id).toBe('h25')
    expect(findDocument(docs, 'Compensation Letter', '2024')).toBeNull()
  })

  it('lists recent years plus any issued year, newest first; none for the offer letter', () => {
    const fy = yearChoices([doc('old', 'Form 16', '2015-16')], 'Form 16', today)
    expect(fy[0]).toBe('2026-27')
    expect(fy).toContain('2025-26')
    expect(fy[fy.length - 1]).toBe('2015-16')
    expect(yearChoices([], 'Compensation Letter', today)[0]).toBe('2026')
    expect(yearChoices([], 'Offer Letter', today)).toEqual([])
  })

  it('starts on the newest issued year, else last financial year / this year', () => {
    expect(defaultYear([doc('a', 'Form 16', '2023-24'), doc('b', 'Form 16', '2024-25')], 'Form 16', today)).toBe('2024-25')
    expect(defaultYear([], 'Form 16', today)).toBe('2025-26')
    expect(defaultYear([], 'Compensation Letter', today)).toBe('2026')
    expect(defaultYear([], 'Offer Letter', today)).toBe('')
  })

  it('names the fetched document', () => {
    expect(documentLabel('Form 16', '2025-26')).toBe('Form 16 · FY 2025-26')
    expect(documentLabel('Compensation Letter', '2026')).toBe('Compensation / Hike letter · 2026')
    expect(documentLabel('Offer Letter', '')).toBe('Offer letter')
  })
})

describe('Requests: latest 5 only', () => {
  it('keeps the newest 5, plus an older one a notification points at', () => {
    const items = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7']
    expect(RECENT_LIMIT).toBe(5)
    expect(recentItems(items, RECENT_LIMIT)).toEqual(['w1', 'w2', 'w3', 'w4', 'w5'])
    expect(recentItems(items, RECENT_LIMIT, (w) => w === 'w7')).toEqual(['w1', 'w2', 'w3', 'w4', 'w5', 'w7'])
    expect(recentItems(['w1', 'w2'], RECENT_LIMIT)).toEqual(['w1', 'w2'])
  })

  it('orders leave applications newest first', () => {
    const leaves = [{ id: '1', from: '2026-03-02' }, { id: '2', from: '2026-10-01' }, { id: '3', from: '2026-07-15' }]
    expect(newestLeaveFirst(leaves).map((l) => l.id)).toEqual(['2', '3', '1'])
    expect(leaves.map((l) => l.id)).toEqual(['1', '2', '3']) // the original list is not changed
  })
})

describe('document viewer zoom', () => {
  it('keeps pinch zoom between 100% and 300%', () => {
    expect(clampZoom(0.4)).toBe(1)
    expect(clampZoom(1.7)).toBe(1.7)
    expect(clampZoom(9)).toBe(3)
  })

  it('redraws sharper only when the zoom step changes', () => {
    expect(drawStep(1)).toBe(1)
    expect(drawStep(1.5)).toBe(2)
    expect(drawStep(2)).toBe(2)
    expect(drawStep(2.6)).toBe(3)
  })
})
