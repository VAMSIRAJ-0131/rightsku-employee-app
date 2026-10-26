import { describe, expect, it } from 'vitest'
import { FESTIVE_DAYS_BEFORE, activeFestival, effectForHoliday } from './festiveEffects'
import { countdownLabel, daysUntil, filterHolidays } from './holidayMonth'
import { EMPLOYEE_DOC_TYPES, documentLabel } from './employeeDocuments'
import { DOCUMENT_TYPES } from './documents'
import type { HolidayRecord } from './workCalendar'

const hol = (id: number, date: string, name: string) => ({ id, date, name, weekday: 'X' }) as unknown as HolidayRecord

describe('festival animation on Home', () => {
  const diwali = [hol(1, '2026-11-08', 'Diwali')]

  it('runs from 2 days before the festival until the festival day, then stops', () => {
    expect(FESTIVE_DAYS_BEFORE).toBe(2)
    expect(activeFestival(diwali, '2026-11-05')).toBeNull()
    expect(activeFestival(diwali, '2026-11-06')?.effect).toBe('fireworks')
    expect(activeFestival(diwali, '2026-11-07')?.effect).toBe('fireworks')
    expect(activeFestival(diwali, '2026-11-08')?.effect).toBe('fireworks')
    expect(activeFestival(diwali, '2026-11-09')).toBeNull()
  })

  it('picks the animation for the festival', () => {
    expect(effectForHoliday('Diwali')).toBe('fireworks')
    expect(effectForHoliday('Christmas')).toBe('snow')
    expect(effectForHoliday('Holi')).toBe('colors')
    expect(effectForHoliday('Independence Day')).toBe('tricolor')
    expect(effectForHoliday('Eid ul Fitr')).toBe('stars')
    expect(effectForHoliday('Sankranti')).toBe('petals')
    expect(effectForHoliday('Company Foundation Day')).toBe('petals')
  })

  it('no animation on quiet days', () => {
    expect(effectForHoliday('Gandhi Jayanti')).toBeNull()
    expect(effectForHoliday('Good Friday')).toBeNull()
    expect(effectForHoliday('Muharram')).toBeNull()
    expect(activeFestival([hol(2, '2026-10-02', 'Gandhi Jayanti')], '2026-10-01')).toBeNull()
  })

  it('the nearest festival wins; a quiet day does not hide a festival right after it', () => {
    const list = [hol(3, '2026-12-25', 'Christmas'), hol(4, '2026-12-24', 'Good Friday')]
    expect(activeFestival(list, '2026-12-23')?.holiday.name).toBe('Christmas')
    const two = [hol(5, '2026-11-09', 'Diwali'), hol(6, '2026-11-10', 'Balipadyami Diwali')]
    expect(activeFestival(two, '2026-11-08')?.holiday.id).toBe(5)
  })
})

describe('holiday list', () => {
  const list = [hol(1, '2026-01-26', 'Republic Day'), hol(2, '2026-11-09', 'Diwali'), hol(3, '2026-12-25', 'Christmas'), hol(4, '2026-10-20', 'Dasara')]

  it('splits upcoming (soonest first) and past (latest first)', () => {
    expect(filterHolidays(list, 'upcoming', '2026-10-26').map((h) => h.name)).toEqual(['Diwali', 'Christmas'])
    expect(filterHolidays(list, 'past', '2026-10-26').map((h) => h.name)).toEqual(['Dasara', 'Republic Day'])
    expect(filterHolidays(list, 'all', '2026-10-26')).toHaveLength(4)
    expect(filterHolidays(list, 'upcoming', '2026-11-09')[0].name).toBe('Diwali') // today counts as upcoming
  })

  it('shows a short countdown', () => {
    expect(daysUntil('2026-11-09', '2026-10-26')).toBe(14)
    expect(countdownLabel('2026-10-26', '2026-10-26')).toBe('Today')
    expect(countdownLabel('2026-10-27', '2026-10-26')).toBe('Tomorrow')
    expect(countdownLabel('2026-11-02', '2026-10-26')).toBe('In 7 days')
    expect(countdownLabel('2026-11-23', '2026-10-26')).toBe('In 4 weeks')
    expect(countdownLabel('2026-12-25', '2026-10-26')).toBe('In 2 months')
    expect(countdownLabel('2026-10-20', '2026-10-26')).toBe('Done')
  })
})

describe('appraisal letter', () => {
  it('is called Appraisal letter for employees and HR', () => {
    expect(EMPLOYEE_DOC_TYPES.map((t) => t.label)).toContain('Appraisal letter')
    expect(documentLabel('Appraisal Letter', '2026')).toBe('Appraisal letter · 2026')
    expect(DOCUMENT_TYPES.find((t) => t.type === 'COMPENSATION_LETTER')?.label).toBe('Appraisal Letter')
  })
})
