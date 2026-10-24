// HR's "Applies from" picker on the work-schedule form: the app's full-month
// calendar, where only Mondays from `min` on can be chosen (a schedule starts
// on a Monday). Cancel (or Back) keeps the earlier choice; nothing is saved
// until HR saves the schedule.
import { useState } from 'react'
import { Icon } from './Icons'
import CalendarSheet from './CalendarSheet'

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

/** A Monday on or after min. */
export function isPickableMonday(iso: string, min: string): boolean {
  return iso >= min && new Date(`${iso}T00:00:00`).getDay() === 1
}

export default function MondayPicker({
  id, value, min, error, onChange,
}: {
  id: string
  /** The chosen Monday, "YYYY-MM-DD". */
  value: string
  /** The earliest Monday that can be chosen. */
  min: string
  error?: string
  onChange: (monday: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        id={id}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-invalid={!!error}
        className={`tnum mt-1.5 flex h-12 w-full items-center justify-between rounded-xl border bg-white px-4 text-left text-[15px] text-ink outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100 ${
          error ? 'border-bad/50' : 'border-line-strong'
        }`}
      >
        <span>{value ? longDate(value) : 'Choose a Monday'}</span>
        <Icon name="calendar" className="h-[18px] w-[18px] text-ink-muted" />
      </button>
      {open && (
        <CalendarSheet
          title="Applies from"
          hint="Choose a Monday: the schedule starts on that day."
          value={value}
          startMonth={(value || min).slice(0, 7)}
          canPick={(iso) => isPickableMonday(iso, min)}
          onCancel={() => setOpen(false)}
          onDone={(monday) => {
            setOpen(false)
            onChange(monday)
          }}
        />
      )}
    </>
  )
}
