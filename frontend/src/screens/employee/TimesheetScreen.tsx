// Employee timesheet: one week at a time, a row per day with the day and date
// on the left and the hours on the right. Only working days take hours;
// weekly offs (from the HR schedule), company holidays and full days of
// approved leave are greyed out.
//
// "Save" keeps the week as a draft (nothing goes to HR). "Submit for
// approval" asks for confirmation and then sends the whole week at once.
// The server works out the week's target and enforces every rule.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../../components/Icons'
import { Button, Card, Notice, ProgressBar, Section, Spinner, StatusBadge, TopBar, useBackHandler } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import { formatShortDate, monthLabel, toIsoDate } from '../../lib/format'
import { MAX_DAYS_BACK, MAX_HOURS_PER_DAY, MIN_HOURS_PER_DAY, weekStartOf } from '../../lib/workCalendar'
import {
  CONFIRM_SUBMIT_MESSAGE, createWeekActions, formatDayLong, formatHours, getMyWeek, saveWeekDraft, startingHours,
  submitMyWeek, weekTotals,
  type EmptyMeaning, type WeekActionResult, type WeekData, type WeekDayData, type WeekFormErrors, type WeekTotals,
} from '../../lib/timesheetWeek'

const NO_ERRORS: WeekFormErrors = { hours: {} }
const STATUS_TEXT: Record<string, string> = {
  NOT_STARTED: 'Not started', DRAFT: 'Draft', SUBMITTED: 'Submitted', ALREADY_SUBMITTED: 'Already submitted',
}
const STATUS_LABEL: Record<string, 'Pending' | 'Approved' | 'Rejected'> = {
  PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected',
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return toIsoDate(d)
}

export default function TimesheetScreen({
  token,
  historyWeeks,
  history,
  onBack,
  onSubmitted,
  onError,
}: {
  token: string
  /** Number of weeks in the history list below. */
  historyWeeks: number
  /** The history list, rendered by the parent so it looks the same everywhere. */
  history: ReactNode
  onBack: () => void
  /** Called after the server confirmed a submission, so the history can reload. */
  onSubmitted: () => void
  onError: (error: ApiError) => ApiError
}) {
  const todayLocal = toIsoDate(new Date())
  const [weekStart, setWeekStart] = useState(() => weekStartOf(todayLocal))
  const [week, setWeek] = useState<WeekData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [hours, setHours] = useState<Record<string, string>>({})
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<WeekFormErrors>(NO_ERRORS)
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const answer = useRef<((confirmed: boolean) => void) | null>(null)

  // One set of actions for the screen: it lets only one request run at a time.
  const actions = useMemo(
    () => createWeekActions({
      saveDraft: (body) => saveWeekDraft(token, body),
      submit: (body) => submitMyWeek(token, body),
      confirm: () => new Promise<boolean>((resolve) => {
        answer.current = resolve
        setConfirming(true)
      }),
    }),
    [token],
  )

  // Open at the top, even when the home screen was scrolled down.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [])

  const weekEnd = shiftDays(weekStart, 6)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setLoadError(null)
    getMyWeek(token, weekStart, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      setLoading(false)
      if (result.ok) show(result.data)
      else setLoadError(onError(result.error).message)
    })
    return () => controller.abort()
  }, [token, weekStart, retry, onError])

  /** Shows a week from the server: its saved hours, description and status. */
  function show(data: WeekData) {
    setWeek(data)
    setHours(startingHours(data))
    setDescription(data.description ?? '')
    setErrors(NO_ERRORS)
  }

  function goToWeek(next: string) {
    setWeekStart(next)
    setWeek(null)
    setSuccess(null)
  }

  const thisWeek = weekStartOf(todayLocal)
  const oldestWeek = weekStartOf(shiftDays(todayLocal, -MAX_DAYS_BACK))
  const current = week && week.weekStart === weekStart ? week : null
  const totals = current ? weekTotals(current, hours) : null
  // A week submitted as a whole, or one whose working days were all submitted one day at a time.
  const submitted = current?.status === 'SUBMITTED' || current?.status === 'ALREADY_SUBMITTED'
  const locked = !current || submitted || busy !== null || loading

  function setDayHours(iso: string, value: string) {
    setHours((h) => ({ ...h, [iso]: value }))
    setSuccess(null)
    if (errors.hours[iso] || errors.form) {
      setErrors((e) => {
        const rest = { ...e.hours }
        delete rest[iso]
        return { ...e, hours: rest, form: undefined }
      })
    }
  }

  function handle(result: WeekActionResult) {
    if (result.kind === 'saved' || result.kind === 'submitted') {
      show(result.week)
      setSuccess(result.message)
      if (result.kind === 'submitted') onSubmitted()
    } else if (result.kind === 'invalid') {
      setErrors(result.errors)
    } else if (result.kind === 'failed') {
      onError(result.error)
      setErrors(result.errors)
    }
  }

  async function save() {
    if (!current || actions.isBusy()) return
    setSuccess(null)
    setErrors(NO_ERRORS)
    setBusy('save')
    const result = await actions.save(current, hours, description)
    setBusy(null)
    handle(result)
  }

  async function submit() {
    if (!current || actions.isBusy()) return
    setSuccess(null)
    setErrors(NO_ERRORS)
    setBusy('submit')
    const result = await actions.submit(current, hours, description)
    setBusy(null)
    handle(result)
  }

  function closeConfirm(confirmed: boolean) {
    setConfirming(false)
    answer.current?.(confirmed)
    answer.current = null
  }

  return (
    <>
      <TopBar title="Timesheet" subtitle="Log your hours for the week" onBack={onBack} />

      <Section>
        <Card className="flex items-center justify-between px-2 py-1">
          <button
            type="button"
            onClick={() => goToWeek(shiftDays(weekStart, -7))}
            disabled={weekStart <= oldestWeek || busy !== null}
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
              {current && ` · ${STATUS_TEXT[current.status] ?? 'Not started'}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => goToWeek(shiftDays(weekStart, 7))}
            disabled={weekStart >= thisWeek || busy !== null}
            aria-label="Next week"
            className="grid h-11 w-11 place-items-center rounded-full text-ink-soft hover:bg-mist-50 disabled:opacity-30"
          >
            <Icon name="chevronRight" className="h-5 w-5" />
          </button>
        </Card>
      </Section>

      {loadError ? (
        <Section>
          <div className="space-y-3" role="alert">
            <Notice tone="bad">{loadError}</Notice>
            <Button variant="secondary" size="sm" onClick={() => setRetry((r) => r + 1)}>
              Try again
            </Button>
          </div>
        </Section>
      ) : !current ? (
        <Section>
          <Card className="grid place-items-center gap-2 px-4 py-10 text-[13px] text-ink-muted">
            <Spinner className="h-5 w-5 text-navy-700" />
            Loading your week
          </Card>
        </Section>
      ) : (
        <>
          {totals && <TargetCard totals={totals} />}

          <Section>
            <Card className="p-3">
              <div className="flex items-end justify-between gap-3 px-1 pb-2 text-[12px] text-ink-muted">
                <span>Day and date</span>
                <span className="w-[5.5rem] text-left">Hours</span>
              </div>
              <div className="relative space-y-2" aria-busy={loading}>
                {current.days.map((day) => (
                  <DayRow
                    key={day.date}
                    day={day}
                    isToday={day.date === current.today}
                    value={hours[day.date] ?? ''}
                    error={errors.hours[day.date]}
                    disabled={!day.editable || locked}
                    empty={day.editable ? totals?.empty[day.date] : day.emptyMeaning ?? undefined}
                    onChange={(v) => setDayHours(day.date, v)}
                  />
                ))}
              </div>
              <p className="mt-3 border-t border-line px-1 pt-3 text-[12px] text-ink-muted">
                {MIN_HOURS_PER_DAY}–{MAX_HOURS_PER_DAY} h a day in steps of 0.25. Enter 0 for a day you did not work.
              </p>
            </Card>
          </Section>

          <Section title="Work done">
            <Card className="p-4">
              <label className="block" htmlFor="ts-description">
                <span className="text-[13px] font-medium text-ink-soft">Short description for this week</span>
                <textarea
                  id="ts-description"
                  rows={3}
                  maxLength={500}
                  value={description}
                  disabled={locked}
                  onChange={(e) => {
                    setDescription(e.target.value)
                    setSuccess(null)
                    if (errors.description) setErrors((er) => ({ ...er, description: undefined }))
                  }}
                  aria-invalid={!!errors.description}
                  className={`mt-1.5 w-full rounded-xl border bg-white px-4 py-3 text-[15px] text-ink outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100 disabled:bg-mist-50 disabled:text-ink-muted ${
                    errors.description ? 'border-bad/50' : 'border-line-strong'
                  }`}
                />
                {errors.description && <span className="mt-1.5 block text-[12px] text-bad">{errors.description}</span>}
              </label>
            </Card>

            {errors.form && (
              <div className="mt-3" role="alert">
                <Notice tone="bad">{errors.form}</Notice>
              </div>
            )}
            {success && (
              <p className="mt-3 flex items-center gap-2 px-1 text-[13px] font-medium text-ok" role="status">
                <Icon name="checkCircle" className="h-4 w-4" /> {success}
              </p>
            )}

            {submitted ? (
              <p className="mt-3 flex items-center gap-2 px-1 text-[13px] text-ink-muted" role="status">
                <Icon name="lock" className="h-4 w-4 shrink-0" />
                {current.status === 'ALREADY_SUBMITTED'
                  ? 'Already submitted: every working day of this week was sent for approval earlier. There is nothing to save or submit.'
                  : `Sent for approval${current.submittedAt ? ` on ${formatShortDate(current.submittedAt.slice(0, 10))}` : ''}. This week can no longer be changed.`}
              </p>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-[2fr_3fr] gap-2">
                  <Button variant="secondary" size="lg" onClick={save} disabled={locked}>
                    {busy === 'save' ? <><Spinner /> Saving</> : 'Save'}
                  </Button>
                  <Button size="lg" onClick={submit} disabled={locked}>
                    {busy === 'submit' && !confirming ? <><Spinner /> Sending</> : 'Submit for approval'}
                  </Button>
                </div>
                <p className="mt-2 px-1 text-[12px] leading-relaxed text-ink-muted">
                  Save keeps a draft you can change later. Submit sends the whole week to HR
                  {current.submitOpensOn && current.today < current.submitOpensOn
                    ? `, from ${formatDayLong(current.submitOpensOn)}.`
                    : '.'}
                </p>
              </>
            )}
          </Section>
        </>
      )}

      <Section title={historyWeeks ? `History (${historyWeeks} ${historyWeeks === 1 ? 'week' : 'weeks'})` : 'History'}>{history}</Section>

      {confirming && <ConfirmDialog onCancel={() => closeConfirm(false)} onConfirm={() => closeConfirm(true)} />}
    </>
  )
}

/* ---------- Expected, entered and remaining hours ---------- */

function TargetCard({ totals }: { totals: WeekTotals }) {
  const done = totals.remaining === 0 && totals.over === 0 && totals.total > 0
  return (
    <Section>
      <Card className="p-4">
        <dl className="grid grid-cols-3 gap-2 text-center">
          <Figure label="Required" value={totals.total} />
          <Figure label="Hours accounted for" value={totals.counted} />
          <Figure
            label={totals.over > 0 ? 'Too many hours' : 'Unfilled hours'}
            value={totals.over > 0 ? totals.over : totals.remaining}
            tone={done ? 'ok' : totals.remaining > 0 || totals.over > 0 ? 'warn' : 'plain'}
          />
        </dl>
        <div className="mt-3">
          <ProgressBar value={totals.counted} max={Math.max(totals.total, totals.counted)} />
        </div>
        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-muted">Days with no hours and no paid leave will count as LOP.</p>
      </Card>
    </Section>
  )
}

function Figure({ label, value, tone = 'plain' }: { label: string; value: number; tone?: 'plain' | 'ok' | 'warn' }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-ink'
  return (
    <div>
      <dt className="text-[12px] text-ink-muted">{label}</dt>
      <dd className={`tnum mt-0.5 text-[20px] font-semibold ${color}`}>{formatHours(value)} h</dd>
    </div>
  )
}

/* ---------- One day ---------- */

function noteFor(day: WeekDayData): string {
  if (day.beforeJoining) return 'Before joining'
  if (day.kind === 'HOLIDAY') return day.holidayName ?? 'Holiday'
  if (day.kind === 'WEEKLY_OFF') return 'Weekly off'
  if (day.leave === 'FULL_DAY') return 'Approved leave · counts toward the week'
  if (day.leave === 'HALF_DAY') {
    const leaveHours = Number(day.scheduledHours) - Number(day.targetHours)
    return `Half-day leave (approved) · ${formatHours(leaveHours)} h leave + ${formatHours(day.targetHours)} h to work`
  }
  return ''
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return `${d.toLocaleDateString('en-US', { weekday: 'long' })} · ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

/** The note shown on a working day left at 0 hours, with its colour. */
const EMPTY_NOTE: Record<EmptyMeaning, { text: string; tone: string } | null> = {
  LOP: { text: 'LOP · no paid leave left', tone: 'text-rejected-ink' },
  PENDING_LEAVE: { text: 'Leave waiting for HR', tone: 'text-pending-ink' },
  NEEDS_LEAVE: { text: 'Apply for leave or enter hours', tone: 'text-pending-ink' },
  UNFILLED: null, // the blank box says it all
}

function DayRow({
  day, isToday, value, error, disabled, empty, onChange,
}: {
  day: WeekDayData
  isToday: boolean
  value: string
  error?: string
  disabled: boolean
  /** What this working day means while it has no hours (see weekTotals). */
  empty?: EmptyMeaning
  onChange: (value: string) => void
}) {
  const id = `hours-${day.date}`
  const label = dayLabel(day.date)
  const emptyNote = empty ? EMPTY_NOTE[empty] : null
  const note = noteFor(day) || emptyNote?.text || ''
  const status = day.entryStatus ? STATUS_LABEL[day.entryStatus] ?? 'Pending' : null
  // A full day of approved leave shows its hours (9 on a normal day): they count toward the week.
  const leaveDay = day.leave === 'FULL_DAY' && !status
  const greyed = !day.editable && !status && !leaveDay
  return (
    <div>
      <div className="flex items-stretch gap-2">
        <label
          htmlFor={id}
          className={`flex min-h-12 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
            greyed ? 'border-line bg-mist-50 text-ink-muted' : 'border-line-strong bg-white text-ink'
          } ${isToday ? 'ring-1 ring-inset ring-navy-700/40' : ''}`}
        >
          <span className="min-w-0">
            <span className={`block truncate text-[15px] ${greyed ? '' : 'font-medium'}`}>{label}</span>
            {note && (
              <span className={`block truncate text-[12px] leading-tight ${!noteFor(day) && emptyNote ? `font-medium ${emptyNote.tone}` : ''}`}>
                {note}
              </span>
            )}
          </span>
          {status && <StatusBadge status={status} />}
        </label>
        {leaveDay ? (
          <div
            className="tnum grid h-12 w-[5.5rem] shrink-0 place-items-center rounded-xl border border-approved/50 bg-approved-soft text-[15px] font-medium text-approved-ink"
            aria-label={`${label}, ${formatHours(day.scheduledHours)} hours of approved leave`}
          >
            {formatHours(day.scheduledHours)}
          </div>
        ) : status ? (
          <div
            className="tnum grid h-12 w-[5.5rem] shrink-0 place-items-center rounded-xl border border-line bg-mist-50 text-[15px] text-ink-soft"
            aria-label={`${label}, ${formatHours(day.hours)} hours submitted`}
          >
            {formatHours(day.hours)}
          </div>
        ) : (
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={0}
            max={MAX_HOURS_PER_DAY}
            step={0.25}
            value={day.editable ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="–"
            aria-label={`Hours for ${label}${note ? ` (${note.toLowerCase()})` : ''}`}
            aria-invalid={!!error}
            className={`tnum h-12 w-[5.5rem] shrink-0 rounded-xl border px-3 text-[15px] outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100 disabled:cursor-not-allowed disabled:bg-mist-50 disabled:text-ink-muted ${
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

/* ---------- "Are you sure?" ---------- */

function ConfirmDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const [answered, setAnswered] = useState(false)

  useBackHandler(onCancel)
  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="backdrop-enter fixed inset-0 z-50 grid place-items-end bg-navy-950/45 p-4 backdrop-blur-[2px] sm:place-items-center">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-submit-title"
        className="sheet sheet-enter w-full max-w-sm p-5"
      >
        <p id="confirm-submit-title" className="text-[16px] font-semibold leading-snug text-ink">
          {CONFIRM_SUBMIT_MESSAGE}
        </p>
        <p className="mt-1.5 text-[13px] text-ink-muted">After submitting, this week can’t be changed.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={answered}
            className="h-12 rounded-lg bg-white text-[15px] font-semibold text-navy-900 ring-1 ring-inset ring-line-strong hover:bg-mist-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (answered) return // a double tap confirms only once
              setAnswered(true)
              onConfirm()
            }}
            disabled={answered}
            className="h-12 rounded-lg bg-navy-900 text-[15px] font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
