// Employee timesheet: one week at a time, a row per day with the day and date
// on the left and the hours on the right. Only working days take hours;
// weekly offs (from the HR schedule) and company holidays are greyed out.
// The server applies the same rules and refuses anything else.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Icon } from '../../components/Icons'
import { Button, Card, Notice, Section, Spinner, StatusBadge, TopBar } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import { formatShortDate, monthLabel, toIsoDate } from '../../lib/format'
import type { Timesheet } from '../../data/types'
import {
  MAX_DAYS_BACK, MAX_HOURS_PER_DAY, MIN_HOURS_PER_DAY, buildWeek, defaultHours, getMyCalendar, hasWeekErrors, submitTimesheet,
  validateWeek, weekStartOf,
  type CalendarData, type TimesheetRecord, type WeekFormErrors, type WeekRow,
} from '../../lib/workCalendar'

const NO_ERRORS: WeekFormErrors = { hours: {} }

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return toIsoDate(d)
}

export default function TimesheetScreen({
  token,
  timesheets,
  history,
  onBack,
  onSubmitted,
  onError,
}: {
  token: string
  /** The employee's own entries (for the summary and to show submitted days). */
  timesheets: Timesheet[]
  /** The history list, rendered by the parent so it looks the same everywhere. */
  history: ReactNode
  onBack: () => void
  onSubmitted: (record: TimesheetRecord) => void
  onError: (error: ApiError) => ApiError
}) {
  const todayLocal = toIsoDate(new Date())
  const [weekStart, setWeekStart] = useState(() => weekStartOf(todayLocal))
  const [calendar, setCalendar] = useState<CalendarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [hours, setHours] = useState<Record<string, string>>({})
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<WeekFormErrors>(NO_ERRORS)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  // Open at the top, even when the home screen was scrolled down.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [])

  const weekEnd = shiftDays(weekStart, 6)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)
    getMyCalendar(token, weekStart, weekEnd, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      setLoading(false)
      if (result.ok) setCalendar(result.data)
      else setLoadError(onError(result.error).message)
    })
    return () => controller.abort()
  }, [token, weekStart, weekEnd, retry, onError])

  const today = calendar?.today ?? todayLocal
  const calendarDays = useMemo(
    () => (calendar && calendar.from === weekStart ? calendar.days : []),
    [calendar, weekStart],
  )
  const rows = useMemo(
    () => buildWeek(weekStart, calendarDays, today, timesheets),
    [weekStart, calendarDays, today, timesheets],
  )

  // Fill each open day with its scheduled hours (up to 9); the employee can change or clear them.
  useEffect(() => {
    if (!calendar || calendar.from !== weekStart) return
    setHours((current) => {
      const missing = rows.filter((row) => row.state === 'available' && current[row.iso] === undefined)
      if (missing.length === 0) return current
      const next = { ...current }
      for (const row of missing) next[row.iso] = defaultHours(row)
      return next
    })
  }, [calendar, weekStart, rows])

  const thisWeek = weekStartOf(todayLocal)
  const oldestWeek = weekStartOf(shiftDays(todayLocal, -MAX_DAYS_BACK))
  const openRows = rows.filter((r) => r.state === 'available')
  const weekTotal = rows.reduce((sum, r) => sum + (r.entry ? r.entry.hours : 0), 0)
    + openRows.reduce((sum, r) => sum + (Number(hours[r.iso]) || 0), 0)
  const workingDays = rows.filter((r) => r.state !== 'weekly-off' && r.state !== 'holiday').length

  function setDayHours(iso: string, value: string) {
    setHours((h) => ({ ...h, [iso]: value }))
    setSaved(null)
    if (errors.hours[iso] || errors.form) {
      setErrors((e) => {
        const rest = { ...e.hours }
        delete rest[iso]
        return { ...e, hours: rest, form: undefined }
      })
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setFormError(null)
    setSaved(null)
    const { entries, errors: found } = validateWeek(rows, hours, description)
    setErrors(found)
    if (hasWeekErrors(found)) return

    // One entry per day, through the existing API. Each day is checked again by the server.
    setSaving(true)
    const refused: Record<string, string> = {}
    let sent = 0
    let otherProblem: string | null = null
    for (const entry of entries) {
      const result = await submitTimesheet(token, { date: entry.date, hours: entry.hours, description })
      if (result.ok) {
        sent++
        onSubmitted(result.data)
        continue
      }
      const error = onError(result.error)
      if (error.kind === 'unauthorized') break
      const message = error.fields.date ?? error.fields.hours ?? error.fields.description
      if (message) refused[entry.date] = message
      else otherProblem = error.message
    }
    setSaving(false)

    setErrors({ hours: refused })
    if (sent > 0) {
      setSaved(`${sent} ${sent === 1 ? 'day' : 'days'} sent for approval.`)
      setHours((h) => {
        const next = { ...h }
        for (const entry of entries) if (!refused[entry.date]) delete next[entry.date]
        return next
      })
      if (Object.keys(refused).length === 0 && !otherProblem) setDescription('')
    }
    if (otherProblem) setFormError(otherProblem)
    else if (Object.keys(refused).length > 0) setFormError('Some days were not sent. See the messages next to them.')
  }

  return (
    <>
      <TopBar title="Timesheet" subtitle="Log your hours for the week" onBack={onBack} />

      <form noValidate onSubmit={submit}>
        <Section>
          <Card className="flex items-center justify-between px-2 py-1">
            <button
              type="button"
              onClick={() => setWeekStart((w) => shiftDays(w, -7))}
              disabled={weekStart <= oldestWeek || saving}
              aria-label="Previous week"
              className="grid h-11 w-11 place-items-center rounded-full text-ink-soft hover:bg-mist-50 disabled:opacity-30"
            >
              <Icon name="arrowLeft" className="h-5 w-5" />
            </button>
            <div className="text-center" aria-live="polite">
              <p className="tnum text-[15px] font-semibold text-ink">
                {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}
              </p>
              <p className="text-[12px] text-ink-muted">
                {weekStart === thisWeek ? 'This week' : monthLabel(new Date(`${weekStart}T00:00:00`))}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWeekStart((w) => shiftDays(w, 7))}
              disabled={weekStart >= thisWeek || saving}
              aria-label="Next week"
              className="grid h-11 w-11 place-items-center rounded-full text-ink-soft hover:bg-mist-50 disabled:opacity-30"
            >
              <Icon name="chevronRight" className="h-5 w-5" />
            </button>
          </Card>
        </Section>

        <Section>
          {loadError ? (
            <div className="space-y-3" role="alert">
              <Notice tone="bad">{loadError}</Notice>
              <Button variant="secondary" size="sm" onClick={() => setRetry((r) => r + 1)}>
                Try again
              </Button>
            </div>
          ) : (
            <Card className="p-3">
              <div className="flex items-end justify-between gap-3 px-1 pb-2 text-[12px] text-ink-muted">
                <span>Day and date</span>
                <span className="w-[5.5rem] text-left">Hours</span>
              </div>
              <div className="relative space-y-2" aria-busy={loading}>
                {rows.map((row) => (
                  <DayRow
                    key={row.iso}
                    row={row}
                    value={hours[row.iso] ?? ''}
                    error={errors.hours[row.iso]}
                    disabled={row.disabled || saving || loading}
                    onChange={(v) => setDayHours(row.iso, v)}
                  />
                ))}
                {loading && (
                  <div className="absolute inset-0 grid place-items-center rounded-lg bg-white/60">
                    <Spinner className="h-5 w-5 text-navy-700" />
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-line px-1 pt-3 text-[13px]">
                <span className="text-ink-muted">
                  {workingDays} working {workingDays === 1 ? 'day' : 'days'} · {MIN_HOURS_PER_DAY}–{MAX_HOURS_PER_DAY} h a day
                </span>
                <span className="tnum font-semibold text-ink">Total {weekTotal} h</span>
              </div>
            </Card>
          )}
        </Section>

        <Section title="Work done">
          <Card className="p-4">
            <label className="block" htmlFor="ts-description">
              <span className="text-[13px] font-medium text-ink-soft">Short description for these days</span>
              <textarea
                id="ts-description"
                rows={3}
                maxLength={500}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value)
                  if (errors.description) setErrors((er) => ({ ...er, description: undefined }))
                }}
                aria-invalid={!!errors.description}
                className={`mt-1.5 w-full rounded-lg border bg-white px-4 py-3 text-[15px] text-ink outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100 ${
                  errors.description ? 'border-bad/50' : 'border-line-strong'
                }`}
              />
              {errors.description && <span className="mt-1.5 block text-[12px] text-bad">{errors.description}</span>}
            </label>
          </Card>
          {(errors.form || formError) && (
            <div className="mt-3" role="alert">
              <Notice tone="bad">{errors.form ?? formError}</Notice>
            </div>
          )}
          {saved && (
            <p className="mt-3 flex items-center gap-2 px-1 text-[13px] text-ok" role="status">
              <Icon name="checkCircle" className="h-4 w-4" /> {saved}
            </p>
          )}
          <Button type="submit" size="lg" disabled={saving || loading || openRows.length === 0} className="mt-3 w-full">
            {saving ? (
              <>
                <Spinner /> Sending
              </>
            ) : openRows.length === 0 ? (
              'Nothing to submit this week'
            ) : (
              'Submit for approval'
            )}
          </Button>
          <p className="mt-2 px-1 text-[12px] leading-relaxed text-ink-muted">
            Leave a box empty to skip that day. Weekly offs and company holidays can’t take hours.
          </p>
        </Section>
      </form>

      <Section title={`History (${timesheets.length})`}>{history}</Section>
    </>
  )
}

const NOTE: Record<WeekRow['state'], string> = {
  available: '',
  submitted: '',
  'weekly-off': 'Weekly off',
  holiday: 'Holiday',
  future: 'Upcoming',
  'too-old': 'Too far back',
}

function DayRow({
  row, value, error, disabled, onChange,
}: {
  row: WeekRow
  value: string
  error?: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  const id = `hours-${row.iso}`
  const greyed = row.state === 'weekly-off' || row.state === 'holiday' || row.state === 'future' || row.state === 'too-old'
  const note = row.state === 'holiday' && row.holidayName ? row.holidayName : NOTE[row.state]
  return (
    <div>
      <div className="flex items-stretch gap-2">
        <label
          htmlFor={id}
          className={`flex min-h-12 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
            greyed ? 'border-line bg-mist-50 text-ink-muted' : 'border-line-strong bg-white text-ink'
          } ${row.isToday ? 'ring-1 ring-inset ring-navy-700/40' : ''}`}
        >
          <span className="min-w-0">
            <span className={`block truncate text-[15px] ${greyed ? '' : 'font-medium'}`}>{row.label}</span>
            {!row.entry && note && <span className="block truncate text-[12px] leading-tight">{note}</span>}
          </span>
          {row.entry && <StatusBadge status={row.entry.status} />}
        </label>
        {row.entry ? (
          <div
            className="tnum grid h-12 w-[5.5rem] shrink-0 place-items-center rounded-lg border border-line bg-mist-50 text-[15px] text-ink-soft"
            aria-label={`${row.label}, ${row.entry.hours} hours submitted`}
          >
            {row.entry.hours}
          </div>
        ) : (
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={MIN_HOURS_PER_DAY}
            max={MAX_HOURS_PER_DAY}
            step={0.25}
            value={disabled && row.disabled ? '' : value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={row.disabled ? '–' : '0'}
            aria-label={`Hours for ${row.label}${row.disabled ? ` (${note.toLowerCase()})` : ''}`}
            aria-invalid={!!error}
            className={`tnum h-12 w-[5.5rem] shrink-0 rounded-lg border px-3 text-[15px] outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100 disabled:cursor-not-allowed disabled:bg-mist-50 disabled:text-ink-muted ${
              error ? 'border-bad/60 bg-white text-ink' : 'border-line-strong bg-white text-ink'
            }`}
          />
        )}
      </div>
      {error && (
        <p className="mt-1 px-1 text-[12px] text-bad" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
