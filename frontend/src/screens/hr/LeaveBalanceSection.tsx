// HR: an employee's leave balance per leave type, shown on their details
// page, and one "Change balance" form with a Leave Type dropdown.
//
// Casual, Sick and Earned: HR enters the new balance; the server saves it and
// records the previous and new value in the audit log.
// Comp-Off: HR adds or deducts days with a reason; the server keeps every
// change in the Comp-Off history (shown in CompOffSection). Comp-Off's balance
// and history are shown there, so its row is not repeated here.
import { useEffect, useState, type FormEvent } from 'react'
import LeaveTypeSelect from '../../components/LeaveTypeSelect'
import { Button, Card, Notice, Section, Spinner } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import {
  adjustCompOff, balanceAfter, hasAdjustmentErrors, newRequestKey, validateAdjustment, type AdjustmentErrors,
  type Direction,
} from '../../lib/compOff'
import {
  checkBalance, days, getLeaveBalances, isSetDirectly, leaveTypeName, setLeaveBalance, type LeaveBalanceRecord,
  type LeaveTypeId,
} from '../../lib/leave'

interface FormState {
  leaveType: LeaveTypeId | ''
  /** Casual, Sick, Earned: the new balance. Comp-Off: the days to add or deduct. */
  days: string
  direction: Direction
  reason: string
}

type FormErrors = Partial<Record<'leaveType' | 'days' | 'reason' | 'form', string>>

const EMPTY: FormState = { leaveType: '', days: '', direction: 'add', reason: '' }

export default function LeaveBalanceSection({
  token, employeeId, onError, onToast, onCompOffChanged,
}: {
  token: string
  employeeId: number
  onError: (error: ApiError) => ApiError
  onToast: (text: string, tone?: 'info' | 'success' | 'error') => void
  /** Called after a Comp-Off change, so its history can reload. */
  onCompOffChanged?: () => void
}) {
  const [balances, setBalances] = useState<LeaveBalanceRecord[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)
  // One key per Comp-Off change: a retry of the same change reuses it, so it is applied once.
  const [requestKey, setRequestKey] = useState(newRequestKey)

  useEffect(() => {
    const controller = new AbortController()
    setLoadError(null)
    getLeaveBalances(token, employeeId, controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.ok) setBalances(result.data)
      else setLoadError(onError(result.error).message)
    })
    return () => controller.abort()
  }, [token, employeeId, retry, onError])

  const selected = form.leaveType ? balances?.find((b) => b.leaveType === form.leaveType) : undefined
  const isCompOff = form.leaveType === 'COMP_OFF'
  const current = selected ? days(selected.balanceDays) : 0
  const compOffPreview = isCompOff ? balanceAfter({ direction: form.direction, days: form.days, reason: form.reason }, current) : null

  function startChange() {
    setForm(EMPTY)
    setErrors({})
    setRequestKey(newRequestKey())
    setOpen(true)
  }

  function chooseType(type: LeaveTypeId | '') {
    const b = balances?.find((x) => x.leaveType === type)
    // For a set balance, start from the current value; for Comp-Off, start empty.
    setForm({ ...EMPTY, leaveType: type, days: type && isSetDirectly(type) && b ? String(days(b.balanceDays)) : '' })
    setErrors({})
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key === 'direction' ? 'days' : key]: undefined, form: undefined }))
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (saving || !balances) return
    if (!form.leaveType) {
      setErrors({ leaveType: 'Choose the leave type.' })
      return
    }
    const type = form.leaveType
    if (isSetDirectly(type)) {
      const problem = checkBalance(form.days)
      if (problem) {
        setErrors({ days: problem })
        return
      }
      setSaving(true)
      const result = await setLeaveBalance(token, employeeId, type, form.days)
      setSaving(false)
      if (result.ok) {
        setBalances(result.data)
        setOpen(false)
        onToast(`${leaveTypeName(type)} balance saved.`, 'success')
      } else {
        const error = onError(result.error)
        setErrors({ days: error.fields.balanceDays ?? error.fields.leaveType ?? error.message })
      }
      return
    }

    const adjustment = { direction: form.direction, days: form.days, reason: form.reason }
    const problems = validateAdjustment(adjustment, current)
    if (hasAdjustmentErrors(problems)) {
      setErrors(problems)
      return
    }
    setSaving(true)
    const result = await adjustCompOff(token, employeeId, adjustment, requestKey)
    if (!result.ok) {
      setSaving(false)
      const error = onError(result.error)
      const fieldErrors: FormErrors = { days: error.fields.changeDays, reason: error.fields.reason }
      setErrors(fieldErrors.days || fieldErrors.reason ? fieldErrors : { form: error.message })
      return
    }
    // The balance list also shows pending and available days, so read it again.
    const refreshed = await getLeaveBalances(token, employeeId)
    setSaving(false)
    if (refreshed.ok) setBalances(refreshed.data)
    setOpen(false)
    setRequestKey(newRequestKey())
    onCompOffChanged?.()
    const n = days(result.data.balanceDays)
    onToast(`Comp-Off balance is now ${n} ${n === 1 ? 'day' : 'days'}.`, 'success')
  }

  return (
    <Section title="Leave balance">
      {loadError ? (
        <div className="space-y-3" role="alert">
          <Notice tone="bad">{loadError}</Notice>
          <Button variant="secondary" size="sm" onClick={() => setRetry((r) => r + 1)}>
            Try again
          </Button>
        </div>
      ) : !balances ? (
        <Card className="flex items-center justify-center gap-2 px-4 py-8 text-[14px] text-ink-muted">
          <Spinner /> Loading leave balance
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {balances.filter((b) => isSetDirectly(b.leaveType)).map((b) => (
            <div key={b.leaveType} className="px-4 py-3">
              <p className="text-[14px] font-medium text-ink">{b.label} leave</p>
              <p className="tnum text-[12px] text-ink-muted">
                Balance {days(b.balanceDays)} · Pending {days(b.pendingDays)} · Available {days(b.availableDays)}
              </p>
            </div>
          ))}

          {!open ? (
            <div className="px-4 py-3">
              <Button size="sm" variant="secondary" className="w-full" onClick={startChange}>
                Change balance
              </Button>
            </div>
          ) : (
            <form noValidate onSubmit={save} className="space-y-3 px-4 py-3" aria-label="Change leave balance">
              <LeaveTypeSelect
                id="balance-leave-type"
                value={form.leaveType}
                onChange={chooseType}
                error={errors.leaveType}
              />

              {form.leaveType && !isCompOff && (
                <>
                  <label className="block" htmlFor="balance-days">
                    <span className="text-[13px] font-medium text-ink-soft">New balance (days)</span>
                    <input
                      id="balance-days"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={365}
                      step={0.5}
                      value={form.days}
                      onChange={(e) => update('days', e.target.value)}
                      aria-invalid={!!errors.days}
                      className="tnum mt-1.5 h-11 w-full rounded-lg border border-line-strong bg-white px-3 text-[15px] text-ink outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100"
                    />
                  </label>
                  {errors.days && <p className="text-[12px] text-bad" role="alert">{errors.days}</p>}
                  {selected && (
                    <p className="tnum text-[12px] text-ink-muted">
                      Now {days(selected.balanceDays)}
                      {days(selected.pendingDays) > 0 && ` · ${days(selected.pendingDays)} days are in requests waiting for review`}
                    </p>
                  )}
                </>
              )}

              {isCompOff && (
                <>
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-mist-100/70 p-1" role="group" aria-label="Add or deduct">
                    {(['add', 'deduct'] as Direction[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={form.direction === d}
                        onClick={() => update('direction', d)}
                        className={`h-10 rounded-md text-[14px] font-medium ${form.direction === d ? 'bg-white text-navy-900 shadow-card' : 'text-ink-muted'}`}
                      >
                        {d === 'add' ? 'Add days' : 'Deduct days'}
                      </button>
                    ))}
                  </div>
                  <label className="block" htmlFor="comp-off-days">
                    <span className="text-[13px] font-medium text-ink-soft">Days</span>
                    <input
                      id="comp-off-days"
                      type="number"
                      inputMode="decimal"
                      min={0.5}
                      max={365}
                      step={0.5}
                      value={form.days}
                      onChange={(e) => update('days', e.target.value)}
                      aria-invalid={!!errors.days}
                      className="tnum mt-1.5 h-11 w-full rounded-lg border border-line-strong bg-white px-3 text-[15px] text-ink outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100"
                    />
                  </label>
                  {errors.days ? (
                    <p className="text-[12px] text-bad" role="alert">{errors.days}</p>
                  ) : (
                    <p className="tnum min-h-4 text-[12px] text-ink-muted" aria-live="polite">
                      {compOffPreview !== null && compOffPreview >= 0
                        ? `Now ${current} · new balance: ${compOffPreview} ${compOffPreview === 1 ? 'day' : 'days'}`
                        : `Now ${current} ${current === 1 ? 'day' : 'days'}`}
                    </p>
                  )}
                  <label className="block" htmlFor="comp-off-reason">
                    <span className="text-[13px] font-medium text-ink-soft">Reason (required)</span>
                    <textarea
                      id="comp-off-reason"
                      rows={2}
                      maxLength={500}
                      value={form.reason}
                      placeholder="For example: Worked on Sunday 18 Oct"
                      onChange={(e) => update('reason', e.target.value)}
                      aria-invalid={!!errors.reason}
                      className="mt-1.5 w-full resize-none rounded-lg border border-line-strong bg-white px-3 py-2 text-[14px] text-ink outline-none placeholder:text-ink-muted/70 focus:border-mist-500 focus:ring-4 focus:ring-mist-100"
                    />
                  </label>
                  {errors.reason && <p className="text-[12px] text-bad" role="alert">{errors.reason}</p>}
                </>
              )}

              {errors.form && <Notice tone="bad">{errors.form}</Notice>}

              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" size="sm" disabled={saving} onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? <Spinner /> : null} {isCompOff ? (form.direction === 'add' ? 'Add' : 'Deduct') : 'Save'}
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}
    </Section>
  )
}
