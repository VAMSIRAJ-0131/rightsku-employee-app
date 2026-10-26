// The Home screen's festival animation: from two days before a company
// holiday until the end of the holiday itself, Home shows an animation that
// fits the festival (crackers for Diwali, snow for Christmas, ...). Before
// and after that window there is none. Quiet days (Gandhi Jayanti, Good
// Friday, Muharram) get no animation.
import { festivalTheme, type FestivalTheme } from './festivals'
import { daysUntil } from './holidayMonth'
import type { HolidayRecord } from './workCalendar'

export type FestiveEffect = 'fireworks' | 'tricolor' | 'snow' | 'colors' | 'stars' | 'petals'

/** How many days before the holiday the animation starts. */
export const FESTIVE_DAYS_BEFORE = 2

const EFFECTS: Partial<Record<FestivalTheme, FestiveEffect>> = {
  diwali: 'fireworks',
  newyear: 'fireworks',
  dasara: 'fireworks',
  national: 'tricolor',
  christmas: 'snow',
  holi: 'colors',
  eid: 'stars',
  harvest: 'petals',
  ganesh: 'petals',
  onam: 'petals',
  rakhi: 'petals',
  'newyear-regional': 'petals',
  janmashtami: 'petals',
  lotus: 'petals',
  generic: 'petals',
  // gandhi, dove (Good Friday), calm (Muharram): no animation.
}

/** The animation for a holiday name, or null for a quiet day. */
export function effectForHoliday(name: string): FestiveEffect | null {
  return EFFECTS[festivalTheme(name)] ?? null
}

/**
 * The festival to celebrate on Home today: the nearest holiday from today up
 * to FESTIVE_DAYS_BEFORE days ahead that has an animation, or null.
 */
export function activeFestival(
  holidays: HolidayRecord[],
  today: string,
): { holiday: HolidayRecord; effect: FestiveEffect } | null {
  const near = holidays
    .filter((h) => {
      const n = daysUntil(h.date, today)
      return n >= 0 && n <= FESTIVE_DAYS_BEFORE
    })
    .sort((a, b) => a.date.localeCompare(b.date))
  for (const holiday of near) {
    const effect = effectForHoliday(holiday.name)
    if (effect) return { holiday, effect }
  }
  return null
}
