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
  applyForLeave, dayCountLabel, totalAvailable, countWorkingDays, days, hasLeaveErrors, validateLeave,
  type LeaveBalanceRecord, type LeaveFormErrors, type LeaveFormValues,
} from '../../lib/leave'
import { getMyCalendar } from '../../lib/workCalendar'
import CompOffRequestForm from './CompOffRequestForm'
import SwipePager from '../../components/SwipePager'
import DateField from '../../components/DateField'

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
      {/* Swipe left for Request Comp-Off, right for Apply for leave. */}
      <SwipePager
        label="Leave pages"
        value={tab}
        onChange={setTab}
        pages={[
          { id: 'leave', content: (
      <>
      <Section title="Apply for leave">
        <form noValidate onSubmit={submit}>
          <Card className="space-y-4 p-4">
            <TotalBalance balances={balances} error={balanceError} onRetry={onRetry} />
            {balances && balances.length > 0 && !balanceError ? (
              <div>
                <p className="mb-2 text-[14px] font-semibold text-ink" id="leave-type-label">Leave type</p>
                <BalanceTiles
                  balances={balances}
                  selected={values.leaveType}
                  error={!!errors.leaveType}
                  onPick={(t) => set('leaveType', t)}
                />
                {values.leaveType && chosenAvailable === 0 ? (
                  <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-bad" role="alert">
                    <Icon name="alert" className="h-4 w-4 shrink-0" />
                    No {chosenBalance?.label ?? 'leave'} left. Choose another leave type.
                  </p>
                ) : errors.leaveType ? (
                  <p className="mt-2 text-[12px] text-bad">{errors.leaveType}</p>
                ) : null}
                {chosenBalance && days(chosenBalance.pendingDays) > 0 && (
                  <p className="tnum mt-1.5 text-[12px] text-ink-muted">
                    {dayCountLabel(chosenBalance.pendingDays)} waiting for HR (not counted above)
                  </p>
                )}
              </div>
            ) : (
              <LeaveTypeSelect
                id="leave-type"
                value={values.leaveType}
                onChange={(t) => set('leaveType', t)}
                error={errors.leaveType}
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <DateField id="leave-start" label="First day" value={values.startDate} error={errors.startDate}
                onChange={(v) => set('startDate', v)} />
              <DateField id="leave-end" label="Last day" value={values.endDate} error={errors.endDate}
                canPick={(iso) => !values.startDate || iso >= values.startDate}
                onChange={(v) => set('endDate', v)} />
            </div>
            <div className="min-h-5" aria-live="polite">
              {counting ? (
                <p className="flex items-center gap-2 text-[13px] text-ink-muted"><Spinner /> Counting working days…</p>
              ) : workingDays !== null ? (
                <p className="tnum flex items-center gap-2 rounded-xl bg-royal-50 px-3 py-2 text-[13px] text-royal-700">
                  <Icon name="calendar" className="h-4 w-4 shrink-0" />
                  <span>
                    <span className="font-semibold">{workingDays} working {workingDays === 1 ? 'day' : 'days'}</span>
                    {' '}· weekly offs and company holidays not counted
                  </span>
                </p>
              ) : null}
            </div>
            <label className="block" htmlFor="leave-reason">
              <span className="text-[14px] font-semibold text-ink">Reason</span>
              <textarea
                id="leave-reason"
                rows={3}
                maxLength={500}
                value={values.reason}
                onChange={(e) => set('reason', e.target.value)}
                aria-invalid={!!errors.reason}
                placeholder="For example: family function, medical appointment"
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
            disabled={saving || !balances || counting}
            className="press save-cta mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-semibold text-white transition-transform duration-150 disabled:opacity-60"
          >
            {saving ? <><Spinner /> Sending</> : <><Icon name="check" className="h-5 w-5" /> Apply for leave</>}
          </button>
        </form>
      </Section>

      <Section title="History">{history}</Section>
      </>
          ) },
          {
            id: 'compoff',
            content: <CompOffRequestForm token={token} onSubmitted={onSubmitted} onError={onError} highlightId={highlightCompOffId} />,
          },
        ]}
      />
    </>
  )
}

/**
 * One tile per leave type with the days available now; tapping a tile chooses
 * that leave type. A type with no days left is outlined in red and shakes.
 */
function BalanceTiles({
  balances, selected, error, onPick,
}: {
  balances: LeaveBalanceRecord[]
  selected: LeaveFormValues['leaveType']
  error: boolean
  onPick: (type: LeaveBalanceRecord['leaveType']) => void
}) {
  // Bumped on every tap of an empty type, so the shake plays again each time.
  const [shake, setShake] = useState<{ type: string; n: number } | null>(null)
  return (
    <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-labelledby="leave-type-label">
      {balances.map((b) => {
        const on = b.leaveType === selected
        const left = days(b.availableDays)
        const empty = left === 0
        const shaking = shake?.type === b.leaveType
        return (
          <button
            key={shaking ? `${b.leaveType}-${shake.n}` : b.leaveType}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              onPick(b.leaveType)
              if (empty) setShake((s) => ({ type: b.leaveType, n: (s?.n ?? 0) + 1 }))
            }}
            className={`press relative rounded-2xl px-3.5 py-3 text-left transition-[transform,box-shadow,background-color] duration-150 ${
              on && empty
                ? 'bg-bad-soft ring-2 ring-inset ring-bad'
                : on
                  ? 'bg-royal-50 ring-2 ring-inset ring-royal-600'
                  : error
                    ? 'bg-white ring-1 ring-inset ring-bad/40'
                    : 'bg-white ring-1 ring-inset ring-line-strong'
            } ${shaking ? 'tile-shake' : ''}`}
          >
            {on && (
              <span className={`absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full text-white ${empty ? 'bg-bad' : 'bg-royal-600'}`}>
                <Icon name={empty ? 'x' : 'check'} className="h-3 w-3" />
              </span>
            )}
            <span className={`block text-[13px] font-semibold ${on ? (empty ? 'text-bad' : 'text-royal-700') : 'text-ink-muted'}`}>{b.label}</span>
            <span className={`tnum mt-0.5 block text-[20px] font-bold ${empty ? 'text-bad' : 'text-ink'}`}>
              {left} <span className="text-[12px] font-medium text-ink-muted">{left === 1 ? 'day' : 'days'} left</span>
            </span>
          </button>
        )
      })}
    </div>
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

