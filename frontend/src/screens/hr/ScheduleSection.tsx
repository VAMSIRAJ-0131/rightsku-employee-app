// HR: an employee's working schedule (weekly offs and hours per day), shown
// on their details page, plus the form to change it from a given date.
import { useEffect, useState, type FormEvent } from 'react'
import { Icon } from '../../components/Icons'
import { Button, Card, DetailRow, Notice, Section, Spinner, Tag, TopBar } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import { formatDate, toIsoDate } from '../../lib/format'
import {
  WEEKDAYS, describeWeeklyOffs, getSchedule, saveSchedule, validateSchedule,
  type ScheduleData, type ScheduleFormErrors, type ScheduleFormValues, type ScheduleView,
} from '../../lib/workCalendar'

export function ScheduleSection({
  token, employeeId, version, onEdit, onError,
}: {
  token: string
  employeeId: number
  version: number
  onEdit: (current: ScheduleView) => void
  onError: (error: ApiError) => ApiError
}) {
  const [data, setData] = useState<ScheduleData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setError(null)
    getSchedule(token, employeeId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) setData(result.data)
      else setError(onError(result.error).message)
    })
    return () => controller.abort()
  }, [token, employeeId, version, retry, onError])

  return (
    <Section
      title="Work schedule"
      action={
        data ? (
          <Button size="sm" variant="secondary" onClick={() => onEdit(data.current)}>
            Change
          </Button>
        ) : undefined
      }
    >
      {error ? (
        <div className="space-y-3" role="alert">
          <Notice tone="bad">{error}</Notice>
          <Button variant="secondary" size="sm" onClick={() => setRetry((r) => r + 1)}>
            Try again
          </Button>
        </div>
      ) : !data ? (
        <Card className="flex items-center justify-center gap-2 px-4 py-8 text-[14px] text-ink-muted">
          <Spinner /> Loading schedule
        </Card>
      ) : (
        <>
          <Card className="divide-y divide-line">
            <DetailRow icon="calendar" label="Weekly off" value={describeWeeklyOffs(data.current.weeklyOffs)} />
            <DetailRow icon="clock" label="Hours per day" value={`${Number(data.current.hoursPerDay)} h`} />
            <DetailRow
              icon="info"
              label="In force since"
              value={data.current.companyDefault ? 'Company default' : formatDate(data.current.effectiveFrom ?? '')}
            />
          </Card>
          {data.upcoming.map((u) => (
            <div key={u.effectiveFrom} className="mt-2">
              <Notice>
                From {formatDate(u.effectiveFrom ?? '')}: {describeWeeklyOffs(u.weeklyOffs).toLowerCase()} off,{' '}
                {Number(u.hoursPerDay)} h per day.
              </Notice>
            </div>
          ))}
          <p className="mt-2 px-1 text-[12px] text-ink-muted">
            Weekly offs and company holidays are blocked in this employee’s timesheet.
          </p>
        </>
      )}
    </Section>
  )
}

export function ScheduleForm({
  token, employeeId, employeeName, current, onCancel, onSaved, onError,
}: {
  token: string
  employeeId: number
  employeeName: string
  current: ScheduleView
  onCancel: () => void
  onSaved: (data: ScheduleData) => void
  onError: (error: ApiError) => ApiError
}) {
  const [values, setValues] = useState<ScheduleFormValues>({
    weeklyOffs: current.weeklyOffs,
    hoursPerDay: String(Number(current.hoursPerDay)),
    effectiveFrom: toIsoDate(new Date()),
  })
  const [errors, setErrors] = useState<ScheduleFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Forms open at the top, even when the details page was scrolled down.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [])

  function toggle(day: ScheduleFormValues['weeklyOffs'][number]) {
    setValues((v) => ({
      ...v,
      weeklyOffs: v.weeklyOffs.includes(day) ? v.weeklyOffs.filter((d) => d !== day) : [...v.weeklyOffs, day],
    }))
    setErrors((e) => ({ ...e, weeklyOffs: undefined }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setFormError(null)
    const found = validateSchedule(values, toIsoDate(new Date()))
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    const result = await saveSchedule(token, employeeId, values)
    setSaving(false)
    if (result.ok) {
      onSaved(result.data)
      return
    }
    const error = onError(result.error)
    const fieldErrors: ScheduleFormErrors = {}
    for (const key of ['weeklyOffs', 'hoursPerDay', 'effectiveFrom'] as const) {
      if (error.fields[key]) fieldErrors[key] = error.fields[key]
    }
    setErrors(fieldErrors)
    setFormError(Object.keys(fieldErrors).length ? null : error.message)
  }

  const workingDays = 7 - values.weeklyOffs.length

  return (
    <>
      <TopBar title="Change work schedule" subtitle={employeeName} onBack={onCancel} />
      <form noValidate onSubmit={submit}>
        {formError && (
          <Section>
            <div role="alert">
              <Notice tone="bad">{formError}</Notice>
            </div>
          </Section>
        )}
        <Section title="Weekly off days">
          <Card className="p-4">
            <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Weekly off days">
              {WEEKDAYS.map((d) => {
                const off = values.weeklyOffs.includes(d.id)
                return (
                  <button
                    key={d.id}
                    type="button"
                    aria-pressed={off}
                    aria-label={`${d.label}, ${off ? 'weekly off' : 'working day'}`}
                    onClick={() => toggle(d.id)}
                    className={`press h-12 rounded-xl text-[13px] font-semibold transition-transform duration-150 ${
                      off ? 'gloss-navy text-white' : 'gloss-light border border-line-strong text-ink'
                    }`}
                  >
                    {d.short}
                  </button>
                )
              })}
            </div>
            <p className="mt-3 text-[13px] text-ink-muted">
              Selected days are off. {workingDays} working {workingDays === 1 ? 'day' : 'days'} a week.
            </p>
            {errors.weeklyOffs && <p className="mt-1.5 text-[12px] text-bad" role="alert">{errors.weeklyOffs}</p>}
          </Card>
        </Section>
        <Section title="Hours and start date">
          <Card className="space-y-4 p-4">
            <label className="block" htmlFor="sch-hours">
              <span className="text-[13px] font-medium text-ink-soft">Working hours per day</span>
              <input
                id="sch-hours"
                type="number"
                inputMode="decimal"
                min={0.25}
                max={24}
                step={0.25}
                value={values.hoursPerDay}
                onChange={(e) => setValues((v) => ({ ...v, hoursPerDay: e.target.value }))}
                className={inputClass(!!errors.hoursPerDay)}
              />
              {errors.hoursPerDay && <span className="mt-1.5 block text-[12px] text-bad">{errors.hoursPerDay}</span>}
            </label>
            <label className="block" htmlFor="sch-from">
              <span className="text-[13px] font-medium text-ink-soft">Applies from</span>
              <input
                id="sch-from"
                type="date"
                min={toIsoDate(new Date())}
                value={values.effectiveFrom}
                onChange={(e) => setValues((v) => ({ ...v, effectiveFrom: e.target.value }))}
                className={inputClass(!!errors.effectiveFrom)}
              />
              {errors.effectiveFrom ? (
                <span className="mt-1.5 block text-[12px] text-bad">{errors.effectiveFrom}</span>
              ) : (
                <span className="mt-1.5 block text-[12px] leading-relaxed text-ink-muted">
                  Today or later. Earlier dates keep the schedule they had, and submitted timesheets are not changed.
                </span>
              )}
            </label>
          </Card>
        </Section>
        <Section>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Spinner /> Saving
                </>
              ) : (
                <>
                  <Icon name="check" className="h-4 w-4" /> Save schedule
                </>
              )}
            </Button>
          </div>
          {current.companyDefault && (
            <p className="mt-3 px-1 text-[12px] text-ink-muted">
              <Tag>Company default</Tag> applies until you save a schedule for this employee.
            </p>
          )}
        </Section>
      </form>
    </>
  )
}

function inputClass(invalid: boolean) {
  return `mt-1.5 h-12 w-full rounded-xl border bg-white px-4 text-[15px] text-ink outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100 ${
    invalid ? 'border-bad/50' : 'border-line-strong'
  }`
}
