import { describe, expect, it } from 'vitest'
import { cardInitials } from '../screens/employee/IdCard'

describe('virtual ID card', () => {
  it('takes the initials from the name, not the prefix', () => {
    expect(cardInitials('Mr. Vamsi Ajjampudi')).toBe('VA')
    expect(cardInitials('Mrs Priya Shah')).toBe('PS')
    expect(cardInitials('Asha')).toBe('A')
    expect(cardInitials('  ')).toBe('?')
  })
})
