// The one "Leave Type" dropdown, used by the employee's leave form and HR's
// balance form. A native <select>, so phones open their own easy picker; it
// is styled like the app's other inputs.
import type { ReactNode } from 'react'
import { Icon } from './Icons'
import { LEAVE_TYPES, leaveTypeOption, type LeaveBalanceRecord, type LeaveTypeId } from '../lib/leave'

export default function LeaveTypeSelect({
  id, value, onChange, balances, error, label = 'Leave Type', aside,
}: {
  id: string
  value: LeaveTypeId | ''
  onChange: (type: LeaveTypeId | '') => void
  /** When given, each option also shows the days available. */
  balances?: LeaveBalanceRecord[] | null
  error?: string
  label?: string
  /** Shown on the same row, right of the dropdown (for example the available balance). */
  aside?: ReactNode
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-[13px] font-medium text-ink-soft">{label}</span>
      <span className="mt-1.5 flex items-stretch gap-2">
        <span className="relative block min-w-0 flex-1">
          <select
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value as LeaveTypeId | '')}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            className={`h-12 w-full appearance-none rounded-lg border bg-white pl-4 pr-10 text-[15px] outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100 ${
              value ? 'text-ink' : 'text-ink-muted'
            } ${error ? 'border-bad/50' : 'border-line-strong'}`}
          >
            <option value="" disabled>
              Choose type
            </option>
            {LEAVE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {leaveTypeOption(t.id, balances)}
              </option>
            ))}
          </select>
          <Icon
            name="chevronRight"
            className="pointer-events-none absolute right-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 rotate-90 text-ink-muted"
          />
        </span>
        {aside}
      </span>
      {error && (
        <span id={`${id}-error`} className="mt-1.5 block text-[12px] text-bad">
          {error}
        </span>
      )}
    </label>
  )
}
