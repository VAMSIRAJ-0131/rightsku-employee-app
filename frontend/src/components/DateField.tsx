// A labelled date field that opens the app's full-month calendar instead of
// the phone's own date picker. The value stays "YYYY-MM-DD" ('' for none), so
// forms, validation and the API are unchanged. Optional dates can be cleared.
import { useState } from 'react'
import { Icon } from './Icons'
import CalendarSheet from './CalendarSheet'
import { formatDate } from '../lib/format'

export default function DateField({
  id, label, value, onChange, error, hint, optional = false, canPick = () => true,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  /** Shows a Clear button when a date is chosen. */
  optional?: boolean
  canPick?: (iso: string) => boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <label className="text-[13px] font-medium text-ink-soft" htmlFor={id}>{label}</label>
      <div className="mt-1.5 flex items-stretch gap-2">
        <button
          id={id}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={`tnum flex h-12 min-w-0 flex-1 items-center justify-between rounded-xl border bg-white px-4 text-left text-[15px] outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100 ${
            error ? 'border-bad/50' : 'border-line-strong'
          } ${value ? 'text-ink' : 'text-ink-muted/70'}`}
        >
          <span className="truncate">{value ? formatDate(value) : 'Choose a date'}</span>
          <Icon name="calendar" className="h-[18px] w-[18px] shrink-0 text-ink-muted" />
        </button>
        {optional && value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={`Clear ${label.toLowerCase()}`}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-line-strong bg-white text-ink-muted hover:bg-mist-50"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        )}
      </div>
      {error ? (
        <span id={`${id}-error`} className="mt-1.5 block text-[12px] text-bad">{error}</span>
      ) : hint ? (
        <span id={`${id}-hint`} className="mt-1.5 block text-[12px] leading-relaxed text-ink-muted">{hint}</span>
      ) : null}
      {open && (
        <CalendarSheet
          title={label.replace(/\s*\(optional\)$/i, '')}
          value={value}
          canPick={canPick}
          onCancel={() => setOpen(false)}
          onDone={(iso) => {
            setOpen(false)
            onChange(iso)
          }}
        />
      )}
    </div>
  )
}
