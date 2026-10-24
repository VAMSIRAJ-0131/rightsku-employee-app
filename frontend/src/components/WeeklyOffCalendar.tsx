// HR's weekly-off picker as a full month calendar. Tapping a weekday heading
// or any date marks that weekday off (or working again) for every week; the
// month arrows only change which month is shown. Days before the schedule's
// Monday are dimmed (the old schedule still applies to them). Nothing is
// saved here: the form saves when HR taps Save.
import { useState } from 'react'
import { Icon } from './Icons'
import { WEEKDAYS, monthCalendarRows, monthOf, shiftMonth, type Weekday } from '../lib/workCalendar'

function monthTitle(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

export default function WeeklyOffCalendar({
  weeklyOffs, effectiveFrom, onToggle,
}: {
  weeklyOffs: Weekday[]
  /** The Monday the schedule applies from: earlier days are dimmed. */
  effectiveFrom: string
  onToggle: (day: Weekday) => void
}) {
  const [month, setMonth] = useState(() => monthOf(effectiveFrom || new Date().toISOString().slice(0, 10)))
  const rows = monthCalendarRows(month)

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          aria-label="Previous month"
          className="grid h-10 w-10 place-items-center rounded-full text-navy-700 hover:bg-mist-50"
        >
          <Icon name="chevronRight" className="h-5 w-5 rotate-180" />
        </button>
        <span className="text-[15px] font-semibold text-ink" aria-live="polite">{monthTitle(month)}</span>
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          aria-label="Next month"
          className="grid h-10 w-10 place-items-center rounded-full text-navy-700 hover:bg-mist-50"
        >
          <Icon name="chevronRight" className="h-5 w-5" />
        </button>
      </div>

      <div role="grid" aria-label={`${monthTitle(month)}: tap a day to make that weekday a weekly off`} className="mt-2">
        {/* Weekday headings: tap to mark that weekday off for every week. */}
        <div role="row" className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((d) => {
            const off = weeklyOffs.includes(d.id)
            return (
              <button
                key={d.id}
                type="button"
                role="columnheader"
                aria-pressed={off}
                aria-label={`${d.label}, ${off ? 'weekly off' : 'working day'}`}
                onClick={() => onToggle(d.id)}
                className={`press h-9 rounded-lg text-[12px] font-semibold transition-transform duration-150 ${
                  off ? 'gloss-navy text-white' : 'text-ink-soft hover:bg-mist-50'
                }`}
              >
                {d.short}
              </button>
            )
          })}
        </div>
        {rows.map((row, r) => (
          <div key={r} role="row" className="mt-1 grid grid-cols-7 gap-1">
            {row.map((cell, c) => {
              if (!cell) return <span key={c} role="gridcell" />
              const off = weeklyOffs.includes(cell.weekday)
              const before = !!effectiveFrom && cell.iso < effectiveFrom
              const day = Number(cell.iso.slice(8))
              return (
                <button
                  key={cell.iso}
                  type="button"
                  role="gridcell"
                  aria-pressed={off}
                  aria-label={`${new Date(`${cell.iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}, ${
                    off ? 'weekly off' : 'working day'
                  }${before ? ', before this schedule starts' : ''}`}
                  onClick={() => onToggle(cell.weekday)}
                  className={`tnum flex h-10 flex-col items-center justify-center rounded-lg text-[13px] leading-none transition-colors ${
                    off ? 'bg-navy-700/10 font-semibold text-navy-800 ring-1 ring-inset ring-navy-700/25' : 'text-ink hover:bg-mist-50'
                  } ${before ? 'opacity-40' : ''} ${cell.iso === effectiveFrom ? 'outline outline-2 outline-offset-[-2px] outline-[#1E88D2]' : ''}`}
                >
                  {day}
                  {off && <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wide">Off</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-navy-700/20 ring-1 ring-inset ring-navy-700/25" /> Weekly off</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm outline outline-2 outline-[#1E88D2]" /> Applies from</span>
        <span>Tap a weekday or any date to choose.</span>
      </p>
    </div>
  )
}
