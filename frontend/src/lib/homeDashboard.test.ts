import { describe, expect, it } from 'vitest'
import { payslipMonth } from '../screens/employee/HomeDashboard'

describe('Home Payslips card', () => {
  it('shows only the month of the latest payslip, whatever the year', () => {
    expect(payslipMonth('Payslip - August 2026')).toBe('August')
    expect(payslipMonth('Payslip - January 2027')).toBe('January')
  })

  it('keeps a title that does not follow the usual pattern', () => {
    expect(payslipMonth('Bonus statement')).toBe('Bonus statement')
  })
})
