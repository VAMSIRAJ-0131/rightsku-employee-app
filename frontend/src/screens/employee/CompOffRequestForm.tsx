// Employee: ask for Comp-Off after working on a weekly off or company holiday.
// Only those days of the last 30 are offered (from the server's calendar,
// so the employee's own weekly offs), and a day already asked for is left
// out. HR approves (the day is added to the Comp-Off balance) or rejects.
import { useEffect, useState, type FormEvent } from 'react'
import { Icon } from '../../components/Icons'
import Spotlight from '../../components/Spotlight'
import { Button, Card, EmptyState, Notice, Section, Spinner, StatusBadge } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import { toIsoDate } from '../../lib/format'
import { statusLabel } from '../../lib/approvalView'
import {
  compOffDayChoices, compOffDayLabel, compOffDaysLabel, compOffWindow, listMyCompOffRequests, requestCompOff,
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
              <label className="block" htmlFor="compoff-day">
                <span className="text-[13px] font-medium text-ink-soft">Day you worked</span>
                <span className="relative mt-1.5 block">
                  <select
                    id="compoff-day"
                    value={values.workDate}
                    onChange={(e) => set('workDate', e.target.value)}
                    disabled={!choices}
                    aria-invalid={!!errors.workDate}
                    className={`h-12 w-full appearance-none rounded-lg border bg-white pl-4 pr-10 text-[15px] outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100 ${
                      values.workDate ? 'text-ink' : 'text-ink-muted'
                    } ${errors.workDate ? 'border-bad/50' : 'border-line-strong'}`}
                  >
                    <option value="" disabled>
                      {choices === null ? 'Loading your days…' : choices.length ? 'Choose a day' : 'No weekly off or holiday to choose'}
                    </option>
                    {(choices ?? []).map((d) => (
                      <option key={d.date} value={d.date}>
                        {compOffDayLabel(d)}
                      </option>
                    ))}
                  </select>
                  <Icon
                    name="chevronRight"
                    className="pointer-events-none absolute right-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 rotate-90 text-ink-muted"
                  />
                </span>
                {errors.workDate && <span className="mt-1.5 block text-[12px] text-bad">{errors.workDate}</span>}
              </label>
            )}
            <div>
              <span className="text-[13px] font-medium text-ink-soft" id="compoff-days-label">How long you worked</span>
              <div className="mt-1.5 grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="compoff-days-label">
                {(['1', '0.5'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={values.days === d}
                    onClick={() => set('days', d)}
                    className={`press h-11 rounded-xl text-[14px] font-semibold transition-transform duration-150 ${
                      values.days === d ? 'gloss-navy text-white' : 'gloss-light border border-line-strong text-ink'
                    }`}
                  >
                    {compOffDaysLabel(d)}
                  </button>
                ))}
              </div>
              {errors.days && <span className="mt-1.5 block text-[12px] text-bad">{errors.days}</span>}
            </div>
            <label className="block" htmlFor="compoff-reason">
              <span className="text-[13px] font-medium text-ink-soft">What did you work on?</span>
              <textarea
                id="compoff-reason"
                rows={3}
                maxLength={500}
                value={values.reason}
                onChange={(e) => set('reason', e.target.value)}
                aria-invalid={!!errors.reason}
                className={`mt-1.5 w-full rounded-xl border bg-white px-4 py-3 text-[15px] text-ink outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100 ${errors.reason ? 'border-bad/50' : 'border-line-strong'}`}
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
          <Button type="submit" size="lg" disabled={saving || !choices} className="mt-3 w-full">
            {saving ? <><Spinner /> Sending</> : 'Request Comp-Off'}
          </Button>
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
          <div className="space-y-2.5">
            {mine.map((r) => (
              <Spotlight key={r.id} on={String(r.id) === highlightId}>
              <Card className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold leading-tight text-ink">
                      {compOffDayLabel({ date: r.workDate, kind: r.dayKind === 'HOLIDAY' ? 'HOLIDAY' : 'WEEKLY_OFF', holidayName: r.holidayName })}
                    </p>
                    <p className="mt-0.5 text-[13px] text-ink-muted">{compOffDaysLabel(r.days)}</p>
                  </div>
                  <StatusBadge status={statusLabel(r.status)} />
                </div>
                <p className="mt-1.5 text-[13px] leading-snug text-ink-soft">{r.reason}</p>
                {r.reviewNote && <p className="mt-1.5 text-[12px] text-ink-muted">HR note: {r.reviewNote}</p>}
              </Card>
              </Spotlight>
            ))}
          </div>
        )}
      </Section>
    </>
  )
}
