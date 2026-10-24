// Employee leave: balances set by HR, the application form and history,
// and (second tab) Comp-Off requests for work on a weekly off or holiday.
// The number of days counts working days only (the server's calendar:
// weekly offs and company holidays are left out). The server checks
// everything again and decides.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Icon } from '../../components/Icons'
import { Button, Card, Notice, Section, Segmented, Spinner, TopBar } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import LeaveTypeSelect from '../../components/LeaveTypeSelect'
import {
  applyForLeave, availableBalanceText, dayCountLabel, totalAvailable, countWorkingDays, days, hasLeaveErrors, validateLeave,
  type LeaveBalanceRecord, type LeaveFormErrors, type LeaveFormValues,
} from '../../lib/leave'
import { getMyCalendar } from '../../lib/workCalendar'
import CompOffRequestForm from './CompOffRequestForm'

const EMPTY: LeaveFormValues = { leaveType: '', startDate: '', endDate: '', reason: '' }
const DATE = /^\d{4}-\d{2}-\d{2}$/

export default function LeaveScreen({
  token, balances, balanceError, history, onBack, onSubmitted, onError, onRetry, initialTab = 'leave', highlightCompOffId = null,
}: {
  token: string
  /** null while loading. */
  balances: LeaveBalanceRecord[] | null
  balanceError: string | null
  /** The leave history list, rendered by the parent. */
  history: ReactNode
  onBack: () => void
  onSubmitted: () => void
  onError: (error: ApiError) => ApiError
  onRetry: () => void
  /** Which tab opens first (a Comp-Off notification opens Request Comp-Off). */
  initialTab?: 'leave' | 'compoff'
  /** A Comp-Off request a tapped notification points at (outlined in the list). */
  highlightCompOffId?: string | null
}) {
  const [tab, setTab] = useState<'leave' | 'compoff'>(initialTab)
  const [values, setValues] = useState<LeaveFormValues>(EMPTY)
  const [errors, setErrors] = useState<LeaveFormErrors>({})
  const [workingDays, setWorkingDays] = useState<number | null>(null)
  const [counting, setCounting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const chosenBalance = values.leaveType ? balances?.find((b) => b.leaveType === values.leaveType) : undefined
  // Shown under the dropdown and updated as soon as the type changes; from the server's balances.
  const selectedText = availableBalanceText(values.leaveType, balances)
  const chosenAvailable = chosenBalance ? days(chosenBalance.availableDays) : 0

  // Working days for the chosen dates, from the server's calendar (weekly offs and holidays excluded).
  const { startDate, endDate } = values
  useEffect(() => {
    setWorkingDays(null)
    if (!DATE.test(startDate) || !DATE.test(endDate) || endDate < startDate) return
    const span = (new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) / 86_400_000
    if (span >= 93) return
    const controller = new AbortController()
    setCounting(true)
    getMyCalendar(token, startDate, endDate, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      setCounting(false)
      if (result.ok) setWorkingDays(countWorkingDays(result.data.days, startDate, endDate))
    })
    return () => controller.abort()
  }, [token, startDate, endDate])

  function set<K extends keyof LeaveFormValues>(key: K, value: LeaveFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined, form: undefined }))
    setSent(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving || !balances) return
    const found = validateLeave(values, balances, workingDays)
    setErrors(found)
    if (hasLeaveErrors(found)) return
    setSaving(true)
    const result = await applyForLeave(token, values)
    setSaving(false)
    if (result.ok) {
      setValues(EMPTY)
      setErrors({})
      setSent(`${result.data.label} leave request for ${days(result.data.days)} ${days(result.data.days) === 1 ? 'day' : 'days'} sent to HR.`)
      onSubmitted()
    } else {
      const error = onError(result.error)
      const f = error.fields
      setErrors({
        leaveType: f.leaveType && !f.leaveType.startsWith('Not enough') ? f.leaveType : undefined,
        startDate: f.startDate,
        endDate: f.endDate,
        reason: f.reason,
        form: (f.leaveType?.startsWith('Not enough') ? f.leaveType : undefined)
          ?? (Object.keys(f).length === 0 ? error.message : undefined),
      })
    }
  }

  return (
    <>
      <TopBar title="Leave" subtitle="Balance and applications" onBack={onBack} />
      <Section>
        <Segmented
          options={[
            { id: 'leave', label: 'Apply for leave' },
            { id: 'compoff', label: 'Request Comp-Off' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </Section>
      {tab === 'compoff' ? (
        <CompOffRequestForm token={token} onSubmitted={onSubmitted} onError={onError} highlightId={highlightCompOffId} />
      ) : (
      <>
      <Section title="Apply for leave">
        <form noValidate onSubmit={submit}>
          <Card className="space-y-4 p-4">
            <TotalBalance balances={balances} error={balanceError} onRetry={onRetry} />
            <div>
              <LeaveTypeSelect
                id="leave-type"
                value={values.leaveType}
                onChange={(t) => set('leaveType', t)}
                error={errors.leaveType}
                aside={
                  <span
                    id="leave-type-balance"
                    aria-live="polite"
                    className={`tnum flex shrink-0 flex-col justify-center rounded-lg px-3 text-right leading-tight ring-1 ring-inset min-[380px]:flex-row min-[380px]:items-center min-[380px]:gap-1 ${
                      selectedText === null
                        ? 'bg-mist-50 text-ink-muted ring-mist-100'
                        : chosenAvailable === 0
                          ? 'bg-bad-soft text-bad ring-bad/20'
                          : 'bg-mist-50 text-navy-900 ring-mist-100'
                    }`}
                  >
                    <span className="text-[11px] font-medium min-[380px]:text-[13px]">Available:</span>
                    <span className="whitespace-nowrap text-[14px] font-semibold">
                      {selectedText === null ? '–' : dayCountLabel(chosenAvailable)}
                    </span>
                  </span>
                }
              />
              {chosenBalance && days(chosenBalance.pendingDays) > 0 && (
                <p className="tnum mt-1.5 text-[12px] text-ink-muted">
                  {dayCountLabel(chosenBalance.pendingDays)} waiting for HR (not counted in Available)
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DateField id="leave-start" label="First day" value={values.startDate} min={undefined} error={errors.startDate}
                onChange={(v) => set('startDate', v)} />
              <DateField id="leave-end" label="Last day" value={values.endDate} min={values.startDate || undefined} error={errors.endDate}
                onChange={(v) => set('endDate', v)} />
            </div>
            <p className="tnum min-h-5 text-[13px] text-ink-muted" aria-live="polite">
              {counting
                ? 'Counting working days…'
                : workingDays !== null
                  ? `${workingDays} working ${workingDays === 1 ? 'day' : 'days'} (weekly offs and company holidays are not counted)`
                  : ''}
            </p>
            <label className="block" htmlFor="leave-reason">
              <span className="text-[13px] font-medium text-ink-soft">Reason</span>
              <textarea
                id="leave-reason"
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
          <Button type="submit" size="lg" disabled={saving || !balances || counting} className="mt-3 w-full">
            {saving ? <><Spinner /> Sending</> : 'Apply for leave'}
          </Button>
        </form>
      </Section>

      <Section title="History">{history}</Section>
      </>
      )}
    </>
  )
}

/** One compact box: the total days available across all leave types. */
function TotalBalance({
  balances, error, onRetry,
}: {
  balances: LeaveBalanceRecord[] | null
  error: string | null
  onRetry: () => void
}) {
  if (error) {
    return (
      <div className="space-y-2" role="alert">
        <Notice tone="bad">{error}</Notice>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  }
  const notSet = balances !== null && balances.every((b) => days(b.balanceDays) === 0)
  return (
    <div className="rounded-lg bg-mist-50 px-4 py-3 ring-1 ring-inset ring-mist-100" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-navy-800">Total leave balance</span>
        {balances === null ? (
          <span className="flex items-center gap-2 text-[13px] text-ink-muted">
            <Spinner /> Loading
          </span>
        ) : (
          <span className="tnum text-[13px] text-ink-muted">
            <span className="text-[20px] font-semibold text-navy-900">{totalAvailable(balances)}</span>{' '}
            {totalAvailable(balances) === 1 ? 'day' : 'days'} available
          </span>
        )}
      </div>
      {notSet && <p className="mt-1 text-[12px] text-ink-muted">HR hasn’t set your leave balance yet. Ask HR before applying.</p>}
    </div>
  )
}

function DateField({
  id, label, value, min, error, onChange,
}: {
  id: string
  label: string
  value: string
  min?: string
  error?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-[13px] font-medium text-ink-soft">{label}</span>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        className={`tnum mt-1.5 h-11 w-full rounded-xl border bg-white px-3 text-[15px] text-ink outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100 ${error ? 'border-bad/50' : 'border-line-strong'}`}
      />
      {error && <span className="mt-1.5 block text-[12px] text-bad">{error}</span>}
    </label>
  )
}
