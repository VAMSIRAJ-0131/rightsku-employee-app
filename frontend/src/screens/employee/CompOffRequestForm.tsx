// Employee: ask for Comp-Off after working on a weekly off or company holiday.
// Only those days of the last 30 are offered (from the server's calendar,
// so the employee's own weekly offs), and a day already asked for is left
// out. HR approves (the day is added to the Comp-Off balance) or rejects.
import { useEffect, useState, type FormEvent } from 'react'
import { Icon } from '../../components/Icons'
import Spotlight from '../../components/Spotlight'
import ConfirmSheet from '../../components/ConfirmSheet'
import { Button, Card, EmptyState, List, Notice, Section, Spinner, StatusBadge } from '../../components/ui'
import { statusTile } from './WeeklyTimesheetHistory'
import type { ApiError } from '../../lib/api'
import { toIsoDate } from '../../lib/format'
import { statusLabel } from '../../lib/approvalView'
import {
  cancelCompOff, compOffDayChoices, compOffDayLabel, compOffDaysLabel, compOffWindow, listMyCompOffRequests, requestCompOff,
  validateCompOff, type CompOffFormErrors, type CompOffFormValues, type CompOffRequestRecord,
} from '../../lib/compOffRequests'
import { getMyCalendar, type CalendarDay } from '../../lib/workCalendar'

const EMPTY: CompOffFormValues = { workDate: '', days: '1', reason: '' }

export default function CompOffRequestForm({
  token, onSubmitted, onError, highlightId = null,
}: {
  token: string
  onSubmitted: () => void
  onError: (error: ApiError) => ApiError
  /** A request a tapped notification points at: outlined in the list. */
  highlightId?: string | null
}) {
  const today = toIsoDate(new Date())
  const [values, setValues] = useState<CompOffFormValues>(EMPTY)
  const [errors, setErrors] = useState<CompOffFormErrors>({})
  const [calendar, setCalendar] = useState<CalendarDay[] | null>(null)
  const [mine, setMine] = useState<CompOffRequestRecord[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [saving, setSaving] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const [toCancel, setToCancel] = useState<CompOffRequestRecord | null>(null)

  async function cancelRequest(r: CompOffRequestRecord) {
    setToCancel(null)
    const result = await cancelCompOff(token, r.id)
    if (result.ok) {
      setSent(`Comp-Off request for ${compOffDayLabel({ date: r.workDate, kind: r.dayKind === 'HOLIDAY' ? 'HOLIDAY' : 'WEEKLY_OFF', holidayName: r.holidayName }).split(' · ')[0]} cancelled.`)
      setVersion((v) => v + 1)
      onSubmitted()
    } else setErrors({ form: onError(result.error).message })
  }

  useEffect(() => {
    const controller = new AbortController()
    const { from, to } = compOffWindow(today)
    setLoadError(null)
    Promise.all([getMyCalendar(token, from, to, controller.signal), listMyCompOffRequests(token, controller.signal)])
      .then(([cal, requests]) => {
        if (controller.signal.aborted) return
        if (!cal.ok) return setLoadError(onError(cal.error).message)
        if (!requests.ok) return setLoadError(onError(requests.error).message)
        setCalendar(cal.data.days)
        setMine(requests.data)
      })
    return () => controller.abort()
  }, [token, today, version, onError])

  const choices = calendar && mine ? compOffDayChoices(calendar, today, mine) : null

  function set<K extends keyof CompOffFormValues>(key: K, value: CompOffFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined, form: undefined }))
    setSent(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    const found = validateCompOff(values, today, choices)
    setErrors(found)
    if (Object.values(found).some(Boolean)) return
    setSaving(true)
    const result = await requestCompOff(token, values)
    setSaving(false)
    if (result.ok) {
      setValues(EMPTY)
      setErrors({})
      setSent(`Comp-Off request for ${compOffDayLabel({ date: result.data.workDate, kind: result.data.dayKind === 'HOLIDAY' ? 'HOLIDAY' : 'WEEKLY_OFF', holidayName: result.data.holidayName }).split(' · ')[0]} (${compOffDaysLabel(result.data.days).toLowerCase()}) sent to HR.`)
      setVersion((v) => v + 1)
      onSubmitted()
    } else {
      const error = onError(result.error)
      const f = error.fields
      setErrors({
        workDate: f.workDate,
        days: f.days,
        reason: f.reason,
        form: Object.keys(f).length === 0 ? error.message : undefined,
      })
      // Someone (or another tap) already asked for this day: show the latest list.
      if (error.kind === 'conflict') setVersion((v) => v + 1)
    }
  }

  return (
    <>
      <Section title="Request Comp-Off">
        <form noValidate onSubmit={submit}>
          <Card className="space-y-4 p-4">
            <p className="text-[13px] leading-relaxed text-ink-muted">
              Worked on a weekly off or company holiday in the last 30 days? Ask for Comp-Off here. When HR approves,
              it is added to your Comp-Off balance.
            </p>
            {loadError ? (
              <div className="space-y-2" role="alert">
                <Notice tone="bad">{loadError}</Notice>
                <Button variant="secondary" size="sm" onClick={() => setVersion((v) => v + 1)}>
                  Try again
                </Button>
              </div>
            ) : (
              <div>
                <p className="text-[14px] font-semibold text-ink" id="compoff-day-label">Day you worked</p>
                <p className="mt-0.5 text-[12px] text-ink-muted">Your weekly offs and company holidays from the last 30 days.</p>
                {choices === null ? (
                  <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-muted"><Spinner /> Loading your days…</p>
                ) : choices.length === 0 ? (
                  <p className="mt-3 rounded-2xl bg-mist-50 px-4 py-3 text-[13px] text-ink-muted ring-1 ring-inset ring-mist-100">
                    No weekly off or holiday in the last 30 days that you haven’t already asked for.
                  </p>
                ) : (
                  <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="compoff-day-label">
                    {choices.map((d) => (
                      <DayTile key={d.date} day={d} on={values.workDate === d.date} onPick={() => set('workDate', d.date)} />
                    ))}
                  </div>
                )}
                {errors.workDate && <span className="mt-1.5 block text-[12px] text-bad">{errors.workDate}</span>}
              </div>
            )}
            <div>
              <span className="text-[14px] font-semibold text-ink" id="compoff-days-label">How long you worked</span>
              <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="compoff-days-label">
                {(['1', '0.5'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={values.days === d}
                    onClick={() => set('days', d)}
                    className={`press h-12 rounded-2xl text-[15px] font-semibold transition-transform duration-150 ${
                      values.days === d ? 'save-cta text-white' : 'bg-white text-ink ring-1 ring-inset ring-line-strong'
                    }`}
                  >
                    {compOffDaysLabel(d)}
                  </button>
                ))}
              </div>
              {errors.days && <span className="mt-1.5 block text-[12px] text-bad">{errors.days}</span>}
            </div>
            <label className="block" htmlFor="compoff-reason">
              <span className="text-[14px] font-semibold text-ink">What did you work on?</span>
              <textarea
                id="compoff-reason"
                rows={3}
                maxLength={500}
                value={values.reason}
                onChange={(e) => set('reason', e.target.value)}
                aria-invalid={!!errors.reason}
                placeholder="For example: release support on Sunday"
                className={`mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-[16px] text-ink outline-none placeholder:text-ink-muted/60 focus:border-royal-600 focus:ring-4 focus:ring-royal-100 ${errors.reason ? 'border-bad/50' : 'border-line-strong'}`}
              />
              {errors.reason && <span className="mt-1.5 block text-[12px] text-bad">{errors.reason}</span>}
            </label>
          </Card>
          {errors.form && (
            <div className="mt-3" role="alert">
              <Notice tone="bad">{errors.form}</Notice>
            </div>
          )}
          {sent && (
            <p className="mt-3 flex items-center gap-2 px-1 text-[13px] font-medium text-ok" role="status">
              <Icon name="checkCircle" className="h-4 w-4" /> {sent}
            </p>
          )}
          <button
            type="submit"
            disabled={saving || !choices}
            className="press save-cta mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-semibold text-white transition-transform duration-150 disabled:opacity-60"
          >
            {saving ? <><Spinner /> Sending</> : <><Icon name="check" className="h-5 w-5" /> Request Comp-Off</>}
          </button>
        </form>
      </Section>

      <Section title="My Comp-Off requests">
        {mine === null ? (
          loadError ? null : (
            <Card className="flex items-center justify-center gap-2 px-4 py-6 text-[14px] text-ink-muted">
              <Spinner /> Loading
            </Card>
          )
        ) : mine.length === 0 ? (
          <EmptyState icon="list" title="No Comp-Off requests yet" message="Requests you send appear here with HR’s decision." />
        ) : (
          <List>
            {mine.map((r) => {
              const status = statusLabel(r.status)
              return (
                <Spotlight key={r.id} on={String(r.id) === highlightId}>
                  <div className="flex gap-3.5 px-4 py-3.5">
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${statusTile(status)}`}>
                      <Icon name="calendar" className="h-[22px] w-[22px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] font-semibold leading-snug text-ink">
                        {compOffDayLabel({ date: r.workDate, kind: r.dayKind === 'HOLIDAY' ? 'HOLIDAY' : 'WEEKLY_OFF', holidayName: r.holidayName })}
                      </p>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <StatusBadge status={status} />
                        <span className="text-[13px] text-ink-muted">{compOffDaysLabel(r.days)}</span>
                      </span>
                      <p className="mt-1 text-[13px] leading-snug text-ink-soft">{r.reason}</p>
                      {r.status === 'PENDING' && (
                        <button
                          type="button"
                          onClick={() => setToCancel(r)}
                          className="press mt-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-[13px] font-semibold text-bad ring-1 ring-inset ring-bad/30 transition-transform duration-150"
                        >
                          <Icon name="x" className="h-4 w-4" /> Cancel request
                        </button>
                      )}
                      {r.reviewNote && (
                        <div className="mt-2 rounded-md border-l-2 border-line-strong bg-mist-50 px-3 py-2 text-[12px] leading-relaxed text-ink-soft">
                          <span className="font-semibold">HR note:</span> {r.reviewNote}
                        </div>
                      )}
                    </div>
                  </div>
                </Spotlight>
              )
            })}
          </List>
        )}
      </Section>
      {toCancel && (
        <ConfirmSheet
          title="Cancel this Comp-Off request?"
          message="HR will be told. You can ask for this day again later."
          confirmLabel="Cancel request"
          danger
          onCancel={() => setToCancel(null)}
          onConfirm={() => void cancelRequest(toCancel)}
        />
      )}
    </>
  )
}

/** One weekly off or holiday to choose: weekday, date, month and why it was off. */
function DayTile({ day, on, onPick }: { day: CalendarDay; on: boolean; onPick: () => void }) {
  const d = new Date(`${day.date}T00:00:00`)
  const holiday = day.kind === 'HOLIDAY'
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={compOffDayLabel(day)}
      onClick={onPick}
      className={`press flex flex-col items-center rounded-2xl px-1.5 pb-2 pt-2.5 text-center transition-[transform,background-color] duration-150 ${
        on ? 'save-cta text-white' : 'bg-white text-ink ring-1 ring-inset ring-line-strong'
      }`}
    >
      <span className={`text-[11px] font-semibold uppercase tracking-wide ${on ? 'text-white/80' : 'text-ink-muted'}`}>
        {d.toLocaleDateString('en-IN', { weekday: 'short' })}
      </span>
      <span className="tnum text-[22px] font-bold leading-tight">{d.getDate()}</span>
      <span className={`text-[12px] font-medium ${on ? 'text-white/85' : 'text-ink-soft'}`}>
        {d.toLocaleDateString('en-IN', { month: 'short' })}
      </span>
      <span
        className={`mt-1.5 w-full truncate rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ${
          on ? 'bg-white/20 text-white' : holiday ? 'bg-gold-50 text-gold-600' : 'bg-mist-50 text-ink-muted'
        }`}
      >
        {holiday ? day.holidayName ?? 'Holiday' : 'Weekly off'}
      </span>
    </button>
  )
}
