// Holiday calendar, two views:
//   This month   - opens first: "Holidays This Month", other months with the
//                  arrows or a swipe; follows the calendar when the month changes.
//   Holiday list - every holiday HR has published (this year and next),
//                  grouped by month, with the next one highlighted.
import { useEffect, useRef, useState } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { Icon } from '../../components/Icons'
import { slideClass, useSlideFrom } from '../../components/useSwipe'
import SwipePager from '../../components/SwipePager'
import { Button, Card, Notice, Section, Segmented, Spinner, TopBar } from '../../components/ui'
import { toIsoDate } from '../../lib/format'
import {
  addMonths, countdownLabel, daysUntil, filterHolidays, holidaysByMonth, holidaysInMonth, monthKey, monthRange, monthTitle,
  type HolidayFilter,
} from '../../lib/holidayMonth'
import type { HolidayRecord } from '../../lib/workCalendar'

type View = 'month' | 'list'

export default function HolidayCalendar({
  holidays, loading, error, onRetry, onBack,
}: {
  holidays: HolidayRecord[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onBack: () => void
}) {
  const [view, setView] = useState<View>('month')
  const [today, setToday] = useState(() => new Date())
  const thisMonth = monthKey(today)
  const [month, setMonth] = useState(thisMonth)
  const { first, last } = monthRange(today)

  // A new day or month while the screen is open (or when the app comes back):
  // "today" moves on, and so does the month view if it was showing this month.
  useEffect(() => {
    const check = () => {
      const now = new Date()
      setToday((prev) => (toIsoDate(now) === toIsoDate(prev) ? prev : now))
    }
    const timer = window.setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    const resume = CapacitorApp.addListener('resume', check).catch(() => null)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
      resume.then((h) => h?.remove()).catch(() => {})
    }
  }, [])
  const shownMonth = useRef(thisMonth)
  useEffect(() => {
    if (shownMonth.current === thisMonth) return
    const before = shownMonth.current
    shownMonth.current = thisMonth
    setMonth((m) => (m === before ? thisMonth : m))
  }, [thisMonth])

  const canBack = month > first
  const canNext = month < last
  // The month list slides in from the side of the arrow that was tapped.
  const monthSlide = useSlideFrom(month, (a, b) => a.localeCompare(b))
  const todayIso = toIsoDate(today)
  const arrow = 'grid h-11 w-11 place-items-center rounded-full text-ink-soft hover:bg-mist-50 disabled:opacity-30'

  const state = error ? (
    <div className="space-y-3" role="alert">
      <Notice tone="bad">{error}</Notice>
      <Button variant="secondary" onClick={onRetry}>Try again</Button>
    </div>
  ) : loading ? (
    <Card className="flex items-center justify-center gap-2 px-4 py-8 text-[14px] text-ink-muted">
      <Spinner /> Loading holidays
    </Card>
  ) : null

  return (
    <>
      <TopBar title="Holiday calendar" subtitle="Company holidays from HR" onBack={onBack} />
      <Section>
        <Segmented
          options={[
            { id: 'month', label: 'This month' },
            { id: 'list', label: 'Holiday list', count: loading || error ? undefined : holidays.length },
          ]}
          value={view}
          onChange={setView}
        />
      </Section>

      {/* Swipe left for the Holiday list, right for This month (other months: the arrows). */}
      <SwipePager
        label="Holiday calendar pages"
        value={view}
        onChange={setView}
        pages={[
          { id: 'month', content: (
            <>
              <Section>
                <Card className="flex items-center justify-between px-2 py-1">
                  <button type="button" onClick={() => setMonth(addMonths(month, -1))} disabled={!canBack} aria-label="Previous month" className={arrow}>
                    <Icon name="arrowLeft" className="h-5 w-5" />
                  </button>
                  <div className="text-center" aria-live="polite">
                    <p className="text-[15px] font-semibold text-ink">{monthTitle(month)}</p>
                    <p className="text-[12px] text-ink-muted">{month === thisMonth ? 'This month' : 'Arrows: other months'}</p>
                  </div>
                  <button type="button" onClick={() => setMonth(addMonths(month, 1))} disabled={!canNext} aria-label="Next month" className={arrow}>
                    <Icon name="chevronRight" className="h-5 w-5" />
                  </button>
                </Card>
                {month !== thisMonth && (
                  <button
                    type="button"
                    onClick={() => setMonth(thisMonth)}
                    className="mt-2 w-full rounded-lg py-2 text-[13px] font-semibold text-royal-600 hover:bg-royal-50"
                  >
                    Back to this month
                  </button>
                )}
              </Section>
              <div key={month} className={slideClass(monthSlide)}>
                <Section title={month === thisMonth ? 'Holidays This Month' : `Holidays in ${monthTitle(month)}`}>
                  {state ?? <MonthList holidays={holidaysInMonth(holidays, month)} month={month} today={todayIso} anyHolidays={holidays.length > 0} />}
                </Section>
              </div>
            </>
          ) },
          { id: 'list', content: (
            <Section title="All holidays">
              {state ?? <FullList holidays={holidays} today={todayIso} />}
            </Section>
          ) },
        ]}
      />
    </>
  )
}

function MonthList({ holidays, month, today, anyHolidays }: { holidays: HolidayRecord[]; month: string; today: string; anyHolidays: boolean }) {
  if (holidays.length === 0) {
    return (
      <Card className="flex flex-col items-center px-6 py-9 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gold-50 text-gold-600">
          <Icon name="calendar" className="h-6 w-6" />
        </span>
        <p className="mt-3 text-[15px] font-semibold text-ink">No holidays in {monthTitle(month)}</p>
        <p className="mt-1 max-w-64 text-[13px] text-ink-muted">
          {anyHolidays ? 'Use the arrows for other months, or swipe to the Holiday list.' : 'HR adds the company holidays here when they are decided.'}
        </p>
      </Card>
    )
  }
  return (
    <Card className="divide-y divide-line overflow-hidden">
      {holidays.map((h) => (
        <HolidayItem key={h.id} holiday={h} today={today} />
      ))}
    </Card>
  )
}

/**
 * Every holiday HR published. Built for long lists: the next holiday on top,
 * Upcoming / Past / All chips, then short rows grouped by month in one card.
 */
function FullList({ holidays, today }: { holidays: HolidayRecord[]; today: string }) {
  const [filter, setFilter] = useState<HolidayFilter>('upcoming')
  if (holidays.length === 0) {
    return (
      <Card className="flex flex-col items-center px-6 py-9 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gold-50 text-gold-600">
          <Icon name="calendar" className="h-6 w-6" />
        </span>
        <p className="mt-3 text-[15px] font-semibold text-ink">No holidays published</p>
        <p className="mt-1 max-w-64 text-[13px] text-ink-muted">HR adds the company holidays here when they are decided.</p>
      </Card>
    )
  }
  const upcoming = filterHolidays(holidays, 'upcoming', today)
  const next = upcoming[0]
  const counts = { upcoming: upcoming.length, past: holidays.length - upcoming.length, all: holidays.length }
  // The next holiday is already in the big card, so Upcoming lists the ones after it.
  const shown = filterHolidays(holidays, filter, today).filter((h) => !(filter === 'upcoming' && h.id === next?.id))
  const groups = filter === 'past'
    ? holidaysByMonth(shown).reverse().map((g) => ({ ...g, items: [...g.items].reverse() }))
    : holidaysByMonth(shown)
  const chips: [HolidayFilter, string][] = [['upcoming', 'Upcoming'], ['past', 'Past'], ['all', 'All']]
  return (
    <div className="space-y-4">
      {next && <NextHoliday holiday={next} today={today} />}

      <div className="flex gap-2" role="tablist" aria-label="Which holidays">
        {chips.map(([id, label]) => {
          const on = filter === id
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setFilter(id)}
              className={`press flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-transform duration-150 ${
                on ? 'save-cta text-white' : 'bg-white text-ink-soft ring-1 ring-inset ring-line-strong'
              }`}
            >
              {label}
              <span className={`tnum rounded-full px-1.5 text-[11px] ${on ? 'bg-white/25 text-white' : 'bg-mist-50 text-ink-muted'}`}>{counts[id]}</span>
            </button>
          )
        })}
      </div>

      {groups.length === 0 ? (
        <Card className="px-5 py-7 text-center text-[13px] text-ink-muted">
          {filter === 'past' ? 'No holidays have passed yet.' : 'No more holidays after this one.'}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {groups.map(({ month, items }) => (
            <div key={month}>
              <p className="flex items-center justify-between border-b border-line bg-mist-50/70 px-4 py-2 text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                <span>{monthTitle(month)}</span>
                <span className="tnum normal-case tracking-normal">{items.length} {items.length === 1 ? 'holiday' : 'holidays'}</span>
              </p>
              <ul className="divide-y divide-line">
                {items.map((h) => <CompactHoliday key={h.id} holiday={h} today={today} />)}
              </ul>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

/** The next holiday, large, with a countdown. */
function NextHoliday({ holiday, today }: { holiday: HolidayRecord; today: string }) {
  const date = new Date(`${holiday.date}T00:00:00`)
  return (
    <div className="hero-card relative overflow-hidden rounded-[22px] px-4 py-4 text-white">
      <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/[0.07]" />
      <p className="relative text-[12px] font-semibold uppercase tracking-wide text-mist-200">Next holiday</p>
      <div className="relative mt-2 flex items-center gap-3.5">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white text-center text-navy-900 shadow-raised">
          <span className="leading-none">
            <span className="tnum block text-[24px] font-bold">{date.getDate()}</span>
            <span className="mt-1 block text-[11px] font-semibold uppercase tracking-wide">{date.toLocaleDateString('en-IN', { month: 'short' })}</span>
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[19px] font-bold leading-tight [overflow-wrap:anywhere]">{holiday.name}</span>
          <span className="mt-0.5 block text-[13px] text-mist-200">{date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <span className="mt-2 inline-block rounded-full bg-white/15 px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset ring-white/25">
            {countdownLabel(holiday.date, today)}
          </span>
        </span>
      </div>
    </div>
  )
}

/** One short row: date chip, name, weekday, countdown. */
function CompactHoliday({ holiday, today }: { holiday: HolidayRecord; today: string }) {
  const date = new Date(`${holiday.date}T00:00:00`)
  const past = holiday.date < today
  const soon = !past && daysUntil(holiday.date, today) <= 7
  return (
    <li className={`flex items-center gap-3 px-4 py-2.5 ${past ? 'opacity-55' : ''}`}>
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-center ${soon ? 'bg-royal-50 text-royal-700' : 'bg-gold-50 text-gold-600'}`}>
        <span className="leading-none">
          <span className="tnum block text-[16px] font-bold">{date.getDate()}</span>
          <span className="mt-0.5 block text-[9.5px] font-semibold uppercase tracking-wide">{date.toLocaleDateString('en-IN', { weekday: 'short' })}</span>
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-ink">{holiday.name}</span>
        <span className="block text-[12px] text-ink-muted">{date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
      </span>
      <span className={`shrink-0 text-[12px] font-semibold ${past ? 'text-ink-muted' : soon ? 'text-royal-600' : 'text-ink-soft'}`}>
        {countdownLabel(holiday.date, today)}
      </span>
    </li>
  )
}

function HolidayItem({ holiday, today, next = false }: { holiday: HolidayRecord; today: string; next?: boolean }) {
  const date = new Date(`${holiday.date}T00:00:00`)
  const past = holiday.date < today
  const isToday = holiday.date === today
  const days = Math.round((date.getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000)
  const when = isToday ? 'Today' : past ? 'Done' : days === 1 ? 'Tomorrow' : `In ${days} days`
  return (
    <div className={`flex items-center gap-4 px-4 py-3.5 ${past ? 'opacity-60' : ''} ${next ? 'bg-royal-50/50' : ''}`}>
      <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-center ${isToday || next ? 'gloss-navy text-white' : 'bg-gold-50 text-gold-600'}`}>
        <span className="leading-none">
          <span className="tnum block text-[20px] font-bold">{date.getDate()}</span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide">
            {date.toLocaleDateString('en-IN', { weekday: 'short' })}
          </span>
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold leading-snug text-ink">{holiday.name}</span>
        <span className="block text-[13px] text-ink-muted">
          {date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </span>
      </span>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium ${
          isToday ? 'bg-royal-600 text-white' : past ? 'bg-mist-50 text-ink-muted' : next ? 'bg-royal-600 text-white' : 'bg-royal-50 text-royal-700'
        }`}
      >
        {when}
      </span>
    </div>
  )
}
