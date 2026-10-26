import { describe, expect, it } from 'vitest'
import { dayPart, festivalTheme } from './festivals'
import { greeting } from './format'

describe('festivalTheme', () => {
  it('recognises festivals from the names HR types, in any case or punctuation', () => {
    expect(festivalTheme('Christmas')).toBe('christmas')
    expect(festivalTheme('Xmas Day')).toBe('christmas')
    expect(festivalTheme('Diwali')).toBe('diwali')
    expect(festivalTheme('DEEPAVALI')).toBe('diwali')
    expect(festivalTheme('Holi')).toBe('holi')
    expect(festivalTheme('Eid-ul-Fitr')).toBe('eid')
    expect(festivalTheme('Bakrid / Eid al Adha')).toBe('eid')
    expect(festivalTheme('Makar Sankranti')).toBe('harvest')
    expect(festivalTheme('Pongal')).toBe('harvest')
    expect(festivalTheme('Ganesh Chaturthi')).toBe('ganesh')
    expect(festivalTheme('Vinayaka Chavithi')).toBe('ganesh')
    expect(festivalTheme('Dasara')).toBe('dasara')
    expect(festivalTheme('Vijaya Dashami')).toBe('dasara')
    expect(festivalTheme('Independence Day')).toBe('national')
    expect(festivalTheme('Republic Day')).toBe('national')
    expect(festivalTheme('Gandhi Jayanti')).toBe('gandhi')
    expect(festivalTheme('Onam')).toBe('onam')
    expect(festivalTheme('Raksha Bandhan')).toBe('rakhi')
    expect(festivalTheme('Sri Krishna Janmashtami')).toBe('janmashtami')
    expect(festivalTheme('Buddha Purnima')).toBe('lotus')
    expect(festivalTheme('Good Friday')).toBe('dove')
    expect(festivalTheme('Muharram')).toBe('calm')
  })

  it('treats regional new years as their own festival, not the 1 January one', () => {
    expect(festivalTheme('Ugadi')).toBe('newyear-regional')
    expect(festivalTheme('Telugu New Year (Ugadi)')).toBe('newyear-regional')
    expect(festivalTheme("New Year's Day")).toBe('newyear')
  })

  it('matches whole words only and falls back to the general look', () => {
    expect(festivalTheme('Company holiday')).toBe('generic')
    expect(festivalTheme('Founders Day')).toBe('generic')
    expect(festivalTheme('')).toBe('generic')
  })
})

describe('dayPart', () => {
  it('follows the greeting: morning, afternoon, evening', () => {
    expect(dayPart(6)).toBe('morning')
    expect(dayPart(11)).toBe('morning')
    expect(dayPart(12)).toBe('afternoon')
    expect(dayPart(16)).toBe('afternoon')
    expect(dayPart(17)).toBe('evening')
    expect(dayPart(23)).toBe('evening')
    expect(greeting().toLowerCase()).toContain(dayPart(new Date().getHours()))
  })
})
