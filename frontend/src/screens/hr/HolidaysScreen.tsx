// HR: the company holiday calendar for a year. Holidays are blocked in every
// employee's timesheet (the server refuses entries for them).
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Icon } from '../../components/Icons'
import { Button, Card, EmptyState, List, ListRow, Notice, Section, Spinner, TopBar } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import { formatDate } from '../../lib/format'
import {
  WEEKDAYS, addHoliday, changeHoliday, listHolidays, removeHoliday, validateHoliday,
  type HolidayFormValues, type HolidayRecord,
} from '../../lib/workCalendar'

type Editing = { kind: 'none' } | { kind: 'add' } | { kind: 'edit'; holiday: HolidayRecord }

export default function HolidaysScreen({
  token, onBack, onToast, onSessionExpired,
}: {
  token: string
  onBack: () => void
  onToast: (text: string, tone?: 'info' | 'success' | 'error') => void
  onSessionExpired: () => void
}) {
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [items, setItems] = useState<HolidayRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [editing, setEditing] = useState<Editing>({ kind: 'none' })
  const [confirmRemove, setConfirmRemove] = useState<HolidayRecord | null>(null)
  const [busy, setBusy] = useState(false)

  const handleError = useCallback(
    (e: ApiError) => {
      if (e.kind === 'unauthorized') onSessionExpired()
      return e
    },
    [onSessionExpired],
  )

  useEffect(() => {
    const controller = new AbortController()
    setItems(null)
    setError(null)
    listHolidays(token, year, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) setItems(result.data)
      else setError(handleError(result.error).message)
    })
    return () => controller.abort()
  }, [token, year, version, handleError])

  async function remove(holiday: HolidayRecord) {
    setBusy(true)
    const result = await removeHoliday(token, holiday.id)
    setBusy(false)
    setConfirmRemove(null)
    if (result.ok) {
      onToast(`${holiday.name} removed.`, 'success')
      setVersion((v) => v + 1)
    } else onToast(handleError(result.error).message, 'error')
  }

  if (editing.kind !== 'none') {
    return (
      <HolidayForm
        token={token}
        holiday={editing.kind === 'edit' ? editing.holiday : null}
        defaultYear={year}
        onCancel={() => setEditing({ kind: 'none' })}
        onError={handleError}
        onSaved={(h, added) => {
          onToast(added ? `${h.name} added.` : `${h.name} saved.`, 'success')
          setEditing({ kind: 'none' })
          setYear(Number(h.date.slice(0, 4)))
          setVersion((v) => v + 1)
        }}
      />
    )
  }

  const weekday = (h: HolidayRecord) => WEEKDAYS.find((d) => d.id === h.weekday)?.label ?? ''

  return (
    <>
      <TopBar
        title="Holiday calendar"
        subtitle="Blocked in every employee’s timesheet"
        onBack={onBack}
        right={
          <Button size="sm" onClick={() => setEditing({ kind: 'add' })}>
            <Icon name="plus" className="h-4 w-4" /> Add
          </Button>
        }
      />
      <Section>
        <Card className="flex items-center justify-between px-2 py-1">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            aria-label="Previous year"
            className="grid h-11 w-11 place-items-center rounded-full text-ink-soft hover:bg-mist-50"
          >
            <Icon name="arrowLeft" className="h-5 w-5" />
          </button>
          <p className="tnum text-[16px] font-semibold text-ink" aria-live="polite">
            {year}
          </p>
          <button
            type="button"
            onClick={() => setYear((y) => y + 1)}
            aria-label="Next year"
            className="grid h-11 w-11 place-items-center rounded-full text-ink-soft hover:bg-mist-50"
          >
            <Icon name="chevronRight" className="h-5 w-5" />
          </button>
        </Card>
      </Section>
      <Section title={items ? `Holidays (${items.length})` : 'Holidays'}>
        {error ? (
          <div className="space-y-3" role="alert">
            <Notice tone="bad">{error}</Notice>
            <Button variant="secondary" size="sm" onClick={() => setVersion((v) => v + 1)}>
              Try again
            </Button>
          </div>
        ) : items === null ? (
          <Card className="flex items-center justify-center gap-2 px-4 py-8 text-[14px] text-ink-muted">
            <Spinner /> Loading holidays
          </Card>
        ) : items.length === 0 ? (
          <EmptyState icon="calendar" title={`No holidays for ${year}`} message="Add the company holidays so employees can’t log time on them." />
        ) : (
          <List>
            {items.map((h) =>
              confirmRemove?.id === h.id ? (
                <div key={h.id} className="px-4 py-3">
                  <p className="text-[14px] font-medium text-ink">Remove {h.name}?</p>
                  <p className="mt-0.5 text-[13px] text-ink-muted">{formatDate(h.date)} becomes a normal day again.</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setConfirmRemove(null)} disabled={busy}>
                      Cancel
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(h)} disabled={busy}>
                      {busy ? <Spinner /> : null} Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <ListRow
                  key={h.id}
                  icon="calendar"
                  title={h.name}
                  subtitle={<span className="tnum">{formatDate(h.date)}, {weekday(h)}</span>}
                  onClick={() => setEditing({ kind: 'edit', holiday: h })}
                  right={
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(h)}
                      aria-label={`Remove ${h.name}`}
                      className="grid h-11 w-11 place-items-center rounded-full text-ink-muted hover:bg-bad-soft hover:text-bad"
                    >
                      <Icon name="x" className="h-[18px] w-[18px]" />
                    </button>
                  }
                />
              ),
            )}
          </List>
        )}
        <p className="mt-2 px-1 text-[12px] leading-relaxed text-ink-muted">
          A holiday on a weekly off is still shown as a holiday. Timesheets already submitted for a date are kept if it
          later becomes a holiday.
        </p>
      </Section>
    </>
  )
}

function HolidayForm({
  token, holiday, defaultYear, onCancel, onSaved, onError,
}: {
  token: string
  holiday: HolidayRecord | null
  defaultYear: number
  onCancel: () => void
  onSaved: (holiday: HolidayRecord, added: boolean) => void
  onError: (error: ApiError) => ApiError
}) {
  const [values, setValues] = useState<HolidayFormValues>({
    date: holiday?.date ?? (defaultYear === new Date().getFullYear() ? '' : `${defaultYear}-01-01`),
    name: holiday?.name ?? '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof HolidayFormValues, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setFormError(null)
    const found = validateHoliday(values)
    setErrors(found)
    if (Object.keys(found).length) return
    setSaving(true)
    const result = holiday ? await changeHoliday(token, holiday.id, values) : await addHoliday(token, values)
    setSaving(false)
    if (result.ok) {
      onSaved(result.data, !holiday)
      return
    }
    const error = onError(result.error)
    const fieldErrors: Partial<Record<keyof HolidayFormValues, string>> = {}
    if (error.fields.date) fieldErrors.date = error.fields.date
    if (error.fields.name) fieldErrors.name = error.fields.name
    setErrors(fieldErrors)
    setFormError(Object.keys(fieldErrors).length ? null : error.message)
  }

  const input = (invalid: boolean) =>
    `mt-1.5 h-12 w-full rounded-lg border bg-white px-4 text-[15px] text-ink outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100 ${
      invalid ? 'border-bad/50' : 'border-line-strong'
    }`

  return (
    <>
      <TopBar title={holiday ? 'Edit holiday' : 'Add holiday'} subtitle="Company-wide" onBack={onCancel} />
      <form noValidate onSubmit={submit}>
        {formError && (
          <Section>
            <div role="alert">
              <Notice tone="bad">{formError}</Notice>
            </div>
          </Section>
        )}
        <Section>
          <Card className="space-y-4 p-4">
            <label className="block" htmlFor="hol-date">
              <span className="text-[13px] font-medium text-ink-soft">Date</span>
              <input
                id="hol-date"
                type="date"
                value={values.date}
                onChange={(e) => setValues((v) => ({ ...v, date: e.target.value }))}
                className={input(!!errors.date)}
              />
              {errors.date && <span className="mt-1.5 block text-[12px] text-bad">{errors.date}</span>}
            </label>
            <label className="block" htmlFor="hol-name">
              <span className="text-[13px] font-medium text-ink-soft">Holiday name</span>
              <input
                id="hol-name"
                type="text"
                maxLength={100}
                value={values.name}
                placeholder="For example, Diwali"
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                className={input(!!errors.name)}
              />
              {errors.name && <span className="mt-1.5 block text-[12px] text-bad">{errors.name}</span>}
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
              ) : holiday ? (
                'Save'
              ) : (
                'Add holiday'
              )}
            </Button>
          </div>
        </Section>
      </form>
    </>
  )
}
