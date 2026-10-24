// A full-month calendar in a bottom sheet, in the app's style: every date of
// the month under Mon-Sun headings, month (and year) arrows, the chosen date
// clearly marked, today outlined, Cancel and Done. Which dates can be chosen
// is up to the caller (canPick), so each picker keeps its own rules.
// Nothing is chosen until Done; Cancel, Escape and Android Back close it.
import { useEffect, useState } from 'react'
import { Icon } from './Icons'
import { useBackHandler } from './ui'
import { WEEKDAYS, monthCalendarRows, monthOf, shiftMonth } from '../lib/workCalendar'
import { toIsoDate } from '../lib/format'

function monthTitle(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

export default function CalendarSheet({
  title, hint, value, startMonth, canPick, onCancel, onDone,
}: {
  title: string
  /** One line under the title, e.g. "Schedules start on a Monday." */
  hint?: string
  /** The date chosen so far ("YYYY-MM-DD"), or '' for none. */
  value: string
  /** The month to open on when there is no value ("YYYY-MM"). */
  startMonth?: string
  canPick: (iso: string) => boolean
  onCancel: () => void
  onDone: (iso: string) => void
}) {
  const today = toIsoDate(new Date())
  const [month, setMonth] = useState(monthOf(value || (startMonth ? `${startMonth}-01` : today)))
  const [picked, setPicked] = useState(value)
  const rows = monthCalendarRows(month)

  useBackHandler(onCancel)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const arrow = 'flex h-10 w-10 items-center justify-center rounded-full text-navy-700 hover:bg-mist-50'
  return (
    <div className="backdrop-enter fixed inset-0 z-50 grid place-items-end bg-navy-950/45 p-4 backdrop-blur-[2px] sm:place-items-center">
      <div role="dialog" aria-modal="true" aria-labelledby="calendar-title" className="sheet sheet-enter w-full max-w-sm p-5">
        <p id="calendar-title" className="text-[16px] font-semibold text-ink">{title}</p>
        {hint && <p className="mt-0.5 text-[13px] text-ink-muted">{hint}</p>}

        <div className="mt-4 flex items-center justify-between">
          <span className="flex">
            <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -12))} aria-label="Previous year" className={arrow}>
              <Icon name="chevronRight" className="h-4 w-4 rotate-180" />
              <Icon name="chevronRight" className="-ml-2.5 h-4 w-4 rotate-180" />
            </button>
            <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month" className={arrow}>
              <Icon name="chevronRight" className="h-5 w-5 rotate-180" />
            </button>
          </span>
          <span className="text-[15px] font-semibold text-ink" aria-live="polite">{monthTitle(month)}</span>
          <span className="flex">
            <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Next month" className={arrow}>
              <Icon name="chevronRight" className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 12))} aria-label="Next year" className={arrow}>
              <Icon name="chevronRight" className="h-4 w-4" />
              <Icon name="chevronRight" className="-ml-2.5 h-4 w-4" />
            </button>
          </span>
        </div>

        <div role="grid" aria-label={monthTitle(month)} className="mt-2">
          <div role="row" className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((d) => (
              <span key={d.id} role="columnheader" aria-label={d.label}
                className="grid h-8 place-items-center text-[12px] font-semibold text-ink-muted">
                {d.short}
              </span>
            ))}
          </div>
          {rows.map((row, r) => (
            <div key={r} role="row" className="mt-1 grid grid-cols-7 gap-1">
              {row.map((cell, c) => {
                if (!cell) return <span key={c} role="gridcell" />
                const allowed = canPick(cell.iso)
                const on = cell.iso === picked
                const isToday = cell.iso === today
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    role="gridcell"
                    aria-selected={on}
                    disabled={!allowed}
                    onClick={() => setPicked(cell.iso)}
                    aria-label={new Date(`${cell.iso}T00:00:00`).toLocaleDateString('en-IN', {
                      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                    })}
                    className={`tnum grid h-10 place-items-center rounded-xl text-[14px] transition-transform duration-150 disabled:cursor-not-allowed disabled:opacity-30 ${
                      on
                        ? 'press gloss-navy font-semibold text-white'
                        : allowed
                          ? `press font-medium text-ink hover:bg-mist-50 ${isToday ? 'ring-1 ring-inset ring-[#1E88D2]' : ''}`
                          : 'text-ink-muted'
                    }`}
                  >
                    {Number(cell.iso.slice(8))}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-12 rounded-lg bg-white text-[15px] font-semibold text-navy-900 ring-1 ring-inset ring-line-strong hover:bg-mist-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => picked && onDone(picked)}
            disabled={!picked || !canPick(picked)}
            className="press h-12 rounded-xl gloss-navy text-[15px] font-semibold text-white transition-transform duration-150 disabled:opacity-60"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
