// Employee timesheet: a month calendar where only working days can be picked
// (weekly offs from the HR schedule and company holidays are disabled), the
// entry form, and the employee's own history.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Icon } from '../../components/Icons'
import { Button, Card, Notice, Section, Spinner, TopBar } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import { formatDate, monthLabel, toIsoDate } from '../../lib/format'
import type { Timesheet } from '../../data/types'
import {
  buildMonthGrid, getMyCalendar, monthRange, shiftMonth, submitTimesheet, validateTimesheet,
  type CalendarData, type DayCell, type TimesheetFormErrors, type TimesheetFormValues, type TimesheetRecord,
} from '../../lib/workCalendar'

const EMPTY: TimesheetFormValues = { date: '', hours: '', description: '' }

export default function TimesheetScreen({
  token,
  timesheets,
  history,
  onBack,
  onSubmitted,
  onError,
}: {
  token: string
  /** The employee's own entries (for the summary and to mark submitted days). */
  timesheets: Timesheet[]
  /** The history list, rendered by the parent so it looks the same everywhere. */
  history: ReactNode
  onBack: () => void
  onSubmitted: (record: TimesheetRecord) => void
  onError: (error: ApiError) => ApiError
}) {
  const [month, setMonth] = useState(() => toIsoDate(new Date()).slice(0, 7))
  const [calendar, setCalendar] = useState<CalendarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [values, setValues] = useState<TimesheetFormValues>(EMPTY)
  const [errors, setErrors] = useState<TimesheetFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  // Open at the top, even when the home screen was scrolled down.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const { from, to } = monthRange(month)
    setLoading(true)
    setLoadError(null)
    getMyCalendar(token, from, to, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      setLoading(false)
      if (result.ok) setCalendar(result.data)
      else setLoadError(onError(result.error).message)
    })
    return () => controller.abort()
  }, [token, month, retry, onError])

  const today = calendar?.today ?? toIsoDate(new Date())
  const submitted = useMemo(() => new Set(timesheets.map((t) => t.date)), [timesheets])
  const grid = useMemo(
    () => buildMonthGrid(month, calendar && calendar.from.startsWith(month) ? calendar.days : [], today, submitted),
    [month, calendar, today, submitted],
  )
  const pickable = useMemo(() => new Set(grid.flat().filter((c) => !c.disabled).map((c) => c.iso)), [grid])
  const selected = grid.flat().find((c) => c.iso === values.date)
  const holidays = (calendar?.days ?? []).filter((d) => d.kind === 'HOLIDAY')

  const monthEntries = timesheets.filter((t) => t.date.startsWith(month))
  const approvedHrs = monthEntries.filter((t) => t.status === 'Approved').reduce((s, t) => s + t.hours, 0)
  const pendingHrs = monthEntries.filter((t) => t.status === 'Pending').reduce((s, t) => s + t.hours, 0)
  const thisMonth = toIsoDate(new Date()).slice(0, 7)

  const set = (field: keyof TimesheetFormValues) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }))
    setSaved(null)
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }

  function pick(cell: DayCell) {
    if (cell.disabled) return
    // Suggest the scheduled hours for that day; the employee can change them.
    const scheduled = calendar?.days.find((d) => d.date === cell.iso)?.hoursPerDay
    setValues((v) => ({ ...v, date: cell.iso, hours: v.hours || (scheduled !== undefined ? String(Number(scheduled)) : '') }))
    setSaved(null)
    setErrors((e) => ({ ...e, date: undefined }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setFormError(null)
    const found = validateTimesheet(values, pickable)
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    const result = await submitTimesheet(token, values)
    setSaving(false)
    if (result.ok) {
      setSaved(`Timesheet for ${formatDate(values.date)} sent for approval.`)
      setValues(EMPTY)
      onSubmitted(result.data)
      return
    }
    const error = onError(result.error)
    const fieldErrors: TimesheetFormErrors = {}
    for (const key of ['date', 'hours', 'description'] as const) {
      if (error.fields[key]) fieldErrors[key] = error.fields[key]
    }
    setErrors(fieldErrors)
    setFormError(Object.keys(fieldErrors).length ? null : error.message)
  }

  return (
    <>
      <TopBar title="Timesheet" subtitle="Log your hours for working days" onBack={onBack} />
      <Section>
        <Card className="grid grid-cols-2 divide-x divide-line">
          <Figure label={`Approved in ${monthLabel(new Date(`${month}-01T00:00:00`)).split(' ')[0]}`} value={`${approvedHrs} h`} />
          <Figure label="Awaiting approval" value={`${pendingHrs} h`} />
        </Card>
      </Section>

      <form noValidate onSubmit={submit}>
        <Section title="1. Pick a day">
          <Card className="p-3">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMonth((m) => shiftMonth(m, -1))}
                disabled={month <= shiftMonth(thisMonth, -2)}
                aria-label="Previous month"
                className="grid h-10 w-10 place-items-center rounded-full text-ink-soft hover:bg-mist-50 disabled:opacity-30"
              >
                <Icon name="arrowLeft" className="h-5 w-5" />
              </button>
              <p className="text-[15px] font-semibold text-ink" aria-live="polite">
                {monthLabel(new Date(`${month}-01T00:00:00`))}
              </p>
              <button
                type="button"
                onClick={() => setMonth((m) => shiftMonth(m, 1))}
                disabled={month >= thisMonth}
                aria-label="Next month"
                className="grid h-10 w-10 place-items-center rounded-full text-ink-soft hover:bg-mist-50 disabled:opacity-30"
              >
                <Icon name="chevronRight" className="h-5 w-5" />
              </button>
            </div>

            {loadError ? (
              <div className="space-y-3 p-1" role="alert">
                <Notice tone="bad">{loadError}</Notice>
                <Button variant="secondary" size="sm" onClick={() => setRetry((r) => r + 1)}>
                  Try again
                </Button>
              </div>
            ) : (
              <div className="relative" aria-busy={loading}>
                <div className="grid grid-cols-7 pb-1 text-center text-[11px] font-medium text-ink-muted">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <div role="grid" aria-label="Choose a date" className="space-y-1">
                  {grid.map((week) => (
                    <div role="row" key={week[0].iso} className="grid grid-cols-7 gap-1">
                      {week.map((c) => (
                        <DayButton key={c.iso} cell={c} selected={c.iso === values.date} onPick={pick} />
                      ))}
                    </div>
                  ))}
                </div>
                {loading && (
                  <div className="absolute inset-0 grid place-items-center bg-white/60">
                    <Spinner className="h-5 w-5 text-navy-700" />
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[11px] text-ink-muted">
              <Legend className="bg-white ring-1 ring-inset ring-line-strong" label="Working day" />
              <Legend className="bg-mist-100" label="Weekly off" />
              <Legend className="bg-warn-soft ring-1 ring-inset ring-warn/30" label="Holiday" />
              <Legend className="bg-ok-soft" label="Submitted" />
            </div>
          </Card>
          {holidays.length > 0 && (
            <ul className="mt-2 space-y-1 px-1 text-[12px] text-ink-muted">
              {holidays.map((h) => (
                <li key={h.date}>
                  <span className="tnum font-medium text-ink-soft">{formatDate(h.date)}</span>: {h.holidayName}
                  {h.weeklyOff ? ' (also a weekly off)' : ''}
                </li>
              ))}
            </ul>
          )}
          {errors.date && (
            <p className="mt-2 px-1 text-[12px] text-bad" role="alert">
              {errors.date}
            </p>
          )}
        </Section>

        <Section title="2. Hours and work done">
          <Card className="space-y-4 p-4">
            <p className="text-[14px] text-ink">
              {selected && !selected.disabled ? (
                <>
                  Date: <span className="font-semibold">{formatDate(selected.iso)}</span>
                </>
              ) : (
                <span className="text-ink-muted">Pick a working day above.</span>
              )}
            </p>
            <label className="block" htmlFor="ts-hours">
              <span className="text-[13px] font-medium text-ink-soft">Hours worked</span>
              <input
                id="ts-hours"
                type="number"
                inputMode="decimal"
                min={0.25}
                max={24}
                step={0.25}
                value={values.hours}
                onChange={(e) => set('hours')(e.target.value)}
                aria-invalid={!!errors.hours}
                className={`mt-1.5 h-12 w-full rounded-lg border bg-white px-4 text-[15px] text-ink outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100 ${
                  errors.hours ? 'border-bad/50' : 'border-line-strong'
                }`}
              />
              {errors.hours && <span className="mt-1.5 block text-[12px] text-bad">{errors.hours}</span>}
            </label>
            <label className="block" htmlFor="ts-description">
              <span className="text-[13px] font-medium text-ink-soft">Work done</span>
              <textarea
                id="ts-description"
                rows={3}
                maxLength={500}
                value={values.description}
                onChange={(e) => set('description')(e.target.value)}
                aria-invalid={!!errors.description}
                className={`mt-1.5 w-full rounded-lg border bg-white px-4 py-3 text-[15px] text-ink outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100 ${
                  errors.description ? 'border-bad/50' : 'border-line-strong'
                }`}
              />
              {errors.description && <span className="mt-1.5 block text-[12px] text-bad">{errors.description}</span>}
            </label>
          </Card>
          {formError && (
            <div className="mt-3" role="alert">
              <Notice tone="bad">{formError}</Notice>
            </div>
          )}
          {saved && (
            <p className="mt-3 flex items-center gap-2 px-1 text-[13px] text-ok" role="status">
              <Icon name="checkCircle" className="h-4 w-4" /> {saved}
            </p>
          )}
          <Button type="submit" size="lg" disabled={saving} className="mt-3 w-full">
            {saving ? (
              <>
                <Spinner /> Sending
              </>
            ) : (
              'Submit for approval'
            )}
          </Button>
        </Section>
      </form>

      <Section title={`History (${timesheets.length})`}>{history}</Section>
    </>
  )
}

function DayButton({ cell, selected, onPick }: { cell: DayCell; selected: boolean; onPick: (c: DayCell) => void }) {
  if (cell.state === 'outside') return <span aria-hidden="true" className="h-10" />
  const styles: Record<DayCell['state'], string> = {
    available: 'bg-white text-ink ring-1 ring-inset ring-line-strong hover:bg-mist-50',
    submitted: 'bg-ok-soft text-ok',
    'weekly-off': 'bg-mist-100 text-ink-muted',
    holiday: 'bg-warn-soft text-warn ring-1 ring-inset ring-warn/30',
    future: 'text-ink-muted/50',
    'too-old': 'text-ink-muted/50',
    outside: '',
  }
  return (
    <button
      type="button"
      role="gridcell"
      disabled={cell.disabled}
      aria-disabled={cell.disabled}
      aria-selected={selected}
      aria-label={cell.label}
      title={cell.label}
      onClick={() => onPick(cell)}
      className={`tnum relative h-10 rounded-md text-[14px] font-medium disabled:cursor-not-allowed ${
        selected ? 'bg-navy-900 text-white ring-0' : styles[cell.state]
      } ${cell.isToday && !selected ? 'font-bold underline decoration-2 underline-offset-4' : ''}`}
    >
      {cell.day}
      {cell.state === 'holiday' && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-warn" />}
    </button>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-4">
      <p className="tnum text-[22px] font-semibold tracking-tight text-ink">{value}</p>
      <p className="text-[12px] text-ink-muted">{label}</p>
    </div>
  )
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded-sm ${className}`} />
      {label}
    </span>
  )
}
