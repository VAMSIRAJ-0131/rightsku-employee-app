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
import { Button, Card, Notice, Section, Spinner, StatusBadge, TopBar, useBackHandler } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import { formatShortDate, monthLabel, toIsoDate } from '../../lib/format'
import { MAX_HOURS_PER_DAY, MIN_HOURS_PER_DAY, weekStartOf } from '../../lib/workCalendar'
import { oldestOpenWeek } from '../../lib/timesheetHistory'
import { slideClass, useSwipe } from '../../components/useSwipe'
import {
  CONFIRM_SUBMIT_MESSAGE, approvedLeaveLabel, createWeekActions, holidayLabel, creditedDay, formatDayLong, formatHours, getMyWeek, saveWeekDraft, startingHours,
  hasUnsavedChanges, submitMyWeek, weekTotals,
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
  initialWeekStart,
  historyWeeks,
  history,
  onBack,
  onSubmitted,
  onError,
  registerLeaveGuard,
}: {
  token: string
  /** The Monday of the week to open on (from the home card); this week when not given. */
  initialWeekStart?: string
  /** Number of weeks in the history list below. */
  historyWeeks: number
  /** The history list, rendered by the parent so it looks the same everywhere. */
  history: ReactNode
  onBack: () => void
  /** Called after the server confirmed a submission, so the history can reload. */
  onSubmitted: () => void
  onError: (error: ApiError) => ApiError
  /**
   * Lets the parent check before leaving this screen another way (bottom tabs):
   * the guard returns true when it stopped to ask about unsaved hours, and
   * calls proceed once the employee saved or discarded them.
   */
  registerLeaveGuard?: (guard: ((proceed: () => void) => boolean) | null) => void
}) {
  const todayLocal = toIsoDate(new Date())
  // This week, or a past week to look at (back to 60 days, like the server).
  const [weekStart, setWeekStart] = useState(() => {
    const wanted = initialWeekStart ?? weekStartOf(todayLocal)
    return wanted < oldestOpenWeek(todayLocal) ? oldestOpenWeek(todayLocal) : wanted
  })
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
  // The week as last loaded or saved, to notice hours typed but not saved.
  const [saved, setSaved] = useState<{ hours: Record<string, string>; description: string }>({ hours: {}, description: '' })
  // Leaving with unsaved hours: where to go once the employee saves or discards them.
  const [leaving, setLeaving] = useState<(() => void) | null>(null)

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

  // Past weeks already seen (or loaded ahead), so swiping back to one shows it
  // at once. Only past weeks: they can't change here (hours go in on the day).
  const pastWeeks = useRef(new Map<string, WeekData>())

  useEffect(() => {
    const controller = new AbortController()
    const cached = weekStart < weekStartOf(todayLocal) ? pastWeeks.current.get(weekStart) : undefined
    if (cached) {
      setLoading(false)
      setLoadError(null)
      show(cached)
    } else {
      setLoading(true)
      setLoadError(null)
      getMyWeek(token, weekStart, controller.signal).then((result) => {
        if (controller.signal.aborted) return
        setLoading(false)
        if (result.ok) {
          if (weekStart < weekStartOf(todayLocal)) pastWeeks.current.set(weekStart, result.data)
          show(result.data)
        } else setLoadError(onError(result.error).message)
      })
    }
    // Load the week before in the background, ready for a swipe back.
    const before = shiftDays(weekStart, -7)
    if (before >= oldestOpenWeek(todayLocal) && !pastWeeks.current.has(before)) {
      getMyWeek(token, before, controller.signal).then((result) => {
        if (result.ok) pastWeeks.current.set(before, result.data)
      })
    }
    return () => controller.abort()
    // todayLocal and show are the same for the screen's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, weekStart, retry, onError])

  /** Shows a week from the server: its saved hours, description and status. */
  function show(data: WeekData) {
    const start = startingHours(data)
    setWeek(data)
    setHours(start)
    setDescription(data.description ?? '')
    setSaved({ hours: start, description: data.description ?? '' })
    setErrors(NO_ERRORS)
  }

  // Which side the week shown now came from, so it slides in from there.
  const [slideFrom, setSlideFrom] = useState<'next' | 'prev' | null>(null)

  function goToWeek(next: string) {
    setSlideFrom(next > weekStart ? 'next' : 'prev')
    setWeekStart(next)
    // A week loaded already shows straight away; otherwise "Loading your week".
    const cached = next < weekStartOf(todayLocal) ? pastWeeks.current.get(next) : undefined
    if (cached) show(cached)
    else setWeek(null)
    setSuccess(null)
  }

  const thisWeek = weekStartOf(todayLocal)
  const oldestWeek = oldestOpenWeek(todayLocal)
  const current = week && week.weekStart === weekStart ? week : null
  const totals = current ? weekTotals(current, hours) : null
  // A week submitted as a whole, or one whose working days were all submitted one day at a time.
  const submitted = current?.status === 'SUBMITTED' || current?.status === 'ALREADY_SUBMITTED'
  const locked = !current || submitted || busy !== null || loading
  const dirty = !!current && !submitted && hasUnsavedChanges(saved, hours, description)

  /** Goes on at once, or first asks to save hours typed but not saved. Returns true when it asked. */
  function guard(proceed: () => void): boolean {
    if (!dirty) return false
    setLeaving(() => proceed)
    return true
  }
  const guardRef = useRef(guard)
  guardRef.current = guard
  useEffect(() => {
    if (!registerLeaveGuard) return
    registerLeaveGuard((proceed) => guardRef.current(proceed))
    return () => registerLeaveGuard(null)
  }, [registerLeaveGuard])

  const back = () => {
    if (!guard(onBack)) onBack()
  }
  const changeWeek = (next: string) => {
    if (!guard(() => goToWeek(next))) goToWeek(next)
  }
  const swipeRef = useSwipe<HTMLDivElement>(
    weekStart < thisWeek && busy === null ? () => changeWeek(shiftDays(weekStart, 7)) : undefined,
    weekStart > oldestWeek && busy === null ? () => changeWeek(shiftDays(weekStart, -7)) : undefined,
  )

  function setDayHours(iso: string, value: string) {
    if (current && iso !== current.today) return
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

  /** Saves the week as a draft; true when the server saved it. */
  async function save(): Promise<boolean> {
    if (!current || actions.isBusy()) return false
    setSuccess(null)
    setErrors(NO_ERRORS)
    setBusy('save')
    const result = await actions.save(current, hours, description)
    setBusy(null)
    handle(result)
    return result.kind === 'saved'
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
      <TopBar title="Timesheet" subtitle="Log your hours for the week" onBack={back} />

      {/* Swipe left for the next week, right for the previous one (same limits as the arrows). */}
      <div ref={swipeRef}>
      <div key={weekStart} className={slideClass(slideFrom)}>

      <Section>
        <Card className="flex items-center justify-between px-2 py-1">
          <button
            type="button"
            onClick={() => changeWeek(shiftDays(weekStart, -7))}
            disabled={weekStart <= oldestWeek || busy !== null}
            aria-label="Previous week"
            className="grid h-11 w-11 place-items-center rounded-full text-ink-soft hover:bg-mist-50 disabled:opacity-30"
          >
            <Icon name="arrowLeft" className="h-5 w-5" />
          </button>
          <div className="text-center" aria-live="polite">
            <p className="tnum text-[16px] font-bold text-ink">
              {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}
            </p>
            <p className="text-[12px] text-ink-muted">
              {weekStart === thisWeek ? 'This week' : monthLabel(new Date(`${weekStart}T00:00:00`))}
              {current && ` · ${STATUS_TEXT[current.status] ?? 'Not started'}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => changeWeek(shiftDays(weekStart, 7))}
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
                    notYet={day.date > current.today}
                    past={day.date < current.today}
                    value={hours[day.date] ?? ''}
                    error={errors.hours[day.date]}
                    disabled={!day.editable || locked || day.date !== current.today}
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
      </div>

      </div>

      <Section title={historyWeeks ? `History (${historyWeeks} ${historyWeeks === 1 ? 'week' : 'weeks'})` : 'History'}>{history}</Section>

      {confirming && <ConfirmDialog onCancel={() => closeConfirm(false)} onConfirm={() => closeConfirm(true)} />}
      {leaving && (
        <UnsavedDialog
          saving={busy === 'save'}
          onDismiss={() => setLeaving(null)}
          onDiscard={() => {
            const go = leaving
            setLeaving(null)
            go()
          }}
          onSave={async () => {
            const go = leaving
            if (await save()) {
              setLeaving(null)
              go()
            } else setLeaving(null) // the errors show on the timesheet
          }}
        />
      )}
    </>
  )
}

/* ---------- Expected, entered and remaining hours ---------- */

function TargetCard({ totals }: { totals: WeekTotals }) {
  const done = totals.unfilled === 0 && totals.totalHours > 0
  return (
    <Section>
      <Card className="p-4">
        <dl className="grid grid-cols-3 divide-x divide-line text-center">
          <Figure label="Total hours" value={totals.totalHours} />
          <Figure label="Filled hours" value={totals.filled} />
          <Figure label="Unfilled hours" value={totals.unfilled} tone={done ? 'ok' : totals.unfilled > 0 ? 'warn' : 'plain'} />
        </dl>
        <div className="mt-3.5">
          <WeekProgress percent={totals.progress} filled={totals.filled} total={totals.totalHours} />
        </div>
        {totals.over > 0 && (
          <p className="mt-2.5 text-[12px] font-medium text-warn">
            {formatHours(totals.over)} h more than this week needs. Check the hours entered.
          </p>
        )}
        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-muted">Days with no hours and no paid leave will count as LOP.</p>
      </Card>
    </Section>
  )
}

function Figure({ label, value, tone = 'plain' }: { label: string; value: number; tone?: 'plain' | 'ok' | 'warn' }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-ink'
  return (
    <div className="flex min-w-0 flex-col items-center px-1">
      <dt className="text-[12px] leading-tight text-ink-muted">{label}</dt>
      <dd className={`tnum mt-1 text-[20px] font-semibold leading-none ${color}`}>{formatHours(value)} h</dd>
    </div>
  )
}

/** The blue bar under the summary: Filled / Total (0 of 45 empty, 22.5 half, 45 full; never past full). */
function WeekProgress({ percent, filled, total }: { percent: number; filled: number; total: number }) {
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-mist-100"
      role="progressbar"
      aria-label="Filled hours"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={filled}
      aria-valuetext={`${formatHours(filled)} of ${formatHours(total)} hours filled`}
    >
      <div
        data-testid="week-progress-fill"
        className="h-full rounded-full bg-gradient-to-r from-[#1E88D2] to-navy-700 transition-[width] duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

/* ---------- One day ---------- */

function noteFor(day: WeekDayData): string {
  if (day.beforeJoining) return 'Before joining'
  if (day.kind === 'HOLIDAY') return holidayLabel(day)
  if (day.kind === 'WEEKLY_OFF') return 'Weekly off'
  if (day.leave === 'FULL_DAY') return approvedLeaveLabel(day)
  if (day.leave === 'HALF_DAY') {
    const leaveHours = Number(day.scheduledHours) - Number(day.targetHours)
    return `Half day ${approvedLeaveLabel(day).toLowerCase()} · ${formatHours(leaveHours)} h leave + ${formatHours(day.targetHours)} h to work`
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
  day, isToday, notYet, past, value, error, disabled, empty, onChange,
}: {
  day: WeekDayData
  isToday: boolean
  /** A day still to come: its hours open on the day. */
  notYet: boolean
  /** An earlier day: no longer open, it shows what was saved. */
  past: boolean
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
  const note = noteFor(day) || emptyNote?.text || (notYet && day.kind === 'WORKING' && !day.weeklyOff ? 'Opens on the day' : '')
  const status = day.entryStatus ? STATUS_LABEL[day.entryStatus] ?? 'Pending' : null
  // Weekly offs, holidays and approved full-day leave show their credited hours: nothing to type.
  const credit = creditedDay(day)
  const open = day.editable && isToday
  const greyed = !open && !status && !credit
  return (
    <div>
      <div className="flex items-stretch gap-2">
        <label
          htmlFor={id}
          className={`flex min-h-12 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
            greyed ? 'border-line bg-mist-50 text-ink-muted' : 'border-line-strong bg-white text-ink'
          } ${isToday ? 'border-royal-600/50 bg-royal-50/50 ring-2 ring-inset ring-royal-600/30' : ''}`}
        >
          <span className="min-w-0">
            <span className={`flex items-center gap-2 truncate text-[15px] ${greyed ? '' : 'font-medium'} ${isToday ? 'font-semibold text-royal-700' : ''}`}>
              {label}
              {isToday && <span className="shrink-0 rounded-full bg-royal-600 px-2 py-0.5 text-[11px] font-semibold text-white">Today</span>}
            </span>
            {note && (
              <span className={`block truncate text-[12px] leading-tight ${!noteFor(day) && emptyNote ? `font-medium ${emptyNote.tone}` : ''}`}>
                {note}
              </span>
            )}
            {/* Under the date, so the date is never cut short on narrow phones. */}
            {status && (
              <span className="mt-1 block">
                <StatusBadge status={status} />
              </span>
            )}
          </span>
        </label>
        {credit ? (
          <div
            className={`tnum grid h-12 w-[5.5rem] shrink-0 place-items-center rounded-xl border text-[15px] font-medium ${
              credit.reason === 'leave'
                ? 'border-approved/50 bg-approved-soft text-approved-ink'
                : 'border-line bg-mist-50 text-ink-muted'
            }`}
            aria-label={`${label}, ${formatHours(credit.hours)} hours (${
              credit.reason === 'weekly-off' ? 'weekly off' : credit.reason === 'holiday' ? holidayLabel(day) : approvedLeaveLabel(day)
            })`}
          >
            {formatHours(credit.hours)} h
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
            value={open ? value : past && day.hours !== null && day.hours !== undefined ? formatHours(day.hours) : ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={open ? '0' : '–'}
            aria-label={`Hours for ${label}${note ? ` (${note.toLowerCase()})` : ''}`}
            aria-invalid={!!error}
            className={`tnum h-12 w-[5.5rem] shrink-0 rounded-xl border px-3 text-center text-[15px] outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100 disabled:cursor-not-allowed disabled:bg-mist-50 disabled:text-ink-muted ${
              error ? 'border-bad/60 bg-white text-ink' : isToday && !disabled ? 'border-royal-600 bg-white font-semibold text-ink ring-2 ring-royal-100' : 'border-line-strong bg-white text-ink'
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

/* ---------- Unsaved hours ---------- */

/**
 * Leaving with hours typed but not saved: Save timesheet or Discard. Android
 * Back (or a tap outside) just closes it and stays on the timesheet.
 */
function UnsavedDialog({
  saving, onSave, onDiscard, onDismiss,
}: { saving: boolean; onSave: () => void; onDiscard: () => void; onDismiss: () => void }) {
  useBackHandler(saving ? () => {} : onDismiss)
  return (
    <div
      className="backdrop-enter fixed inset-0 z-50 grid place-items-end bg-navy-950/50 p-3 backdrop-blur-[3px] sm:place-items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onDismiss()
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        aria-describedby="unsaved-text"
        className="sheet sheet-enter w-full max-w-sm overflow-hidden rounded-[28px] px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 text-center"
      >
        <span className="mx-auto block h-1.5 w-10 rounded-full bg-line-strong" aria-hidden="true" />
        <span className="unsaved-badge mx-auto mt-5 grid h-[68px] w-[68px] place-items-center rounded-[22px]">
          <Icon name="clock" className="h-8 w-8 text-white" />
        </span>
        <p id="unsaved-title" className="mt-4 text-[21px] font-bold tracking-tight text-ink">Save your timesheet?</p>
        <p id="unsaved-text" className="mx-auto mt-2 max-w-[19rem] text-[14px] leading-relaxed text-ink-muted">
          You entered hours that aren’t saved yet. Save them before leaving, or discard the changes.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className="press flex h-14 items-center justify-center gap-2 rounded-2xl bg-rejected-soft/70 text-[15px] font-semibold text-bad ring-1 ring-inset ring-bad/30 transition-transform duration-150 disabled:opacity-60"
          >
            <Icon name="trash" className="h-[18px] w-[18px]" /> Discard
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="press save-cta flex h-14 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white transition-transform duration-150 disabled:opacity-80"
          >
            {saving ? <><Spinner /> Saving</> : <><Icon name="check" className="h-[18px] w-[18px]" /> Save timesheet</>}
          </button>
        </div>
      </div>
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
