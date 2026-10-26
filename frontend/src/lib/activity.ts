// HR Activity (the audit log in plain words) and HR exports (CSV for Excel).
import { apiDownload, apiRequest } from './api'

export interface ActivityItem {
  id: number
  at: string
  actor: string
  action: string
  label: string
  subject: string | null
  detail: string | null
}

export interface ActivityPage {
  items: ActivityItem[]
  page: number
  hasMore: boolean
  total: number
}

export type ActivityCategory = 'all' | 'approvals' | 'employees' | 'documents' | 'company' | 'requests'

export const ACTIVITY_CATEGORIES: { id: ActivityCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'employees', label: 'Employees' },
  { id: 'documents', label: 'Documents & exports' },
  { id: 'company', label: 'Company & holidays' },
  { id: 'requests', label: 'Employee actions' },
]

export function getActivity(token: string, page: number, category: ActivityCategory, signal?: AbortSignal) {
  const q = category === 'all' ? '' : `&category=${category}`
  return apiRequest<ActivityPage>(`/api/hr/audit?page=${page}${q}`, { token, signal })
}

/** The icon tile tone for an action: green approvals, red rejections, grey for the rest. */
export function activityTone(action: string): 'approved' | 'rejected' | 'neutral' {
  if (/_APPROVED$|_CREDITED$|_ACTIVATED$|_ADDED$|_CREATED$|_UPLOADED$/.test(action)) return 'approved'
  if (/_REJECTED$|_DEACTIVATED$|_REMOVED$|_CANCELLED$/.test(action)) return 'rejected'
  return 'neutral'
}

/** "Today", "Yesterday", or "Mon 19 Oct" (in the phone's time zone), for grouping. */
export function activityDay(iso: string, now = new Date()): string {
  const d = new Date(iso)
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (key(d) === key(now)) return 'Today'
  if (key(d) === key(yesterday)) return 'Yesterday'
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })
}

/* ---------- Exports ---------- */

export type ExportKind = 'employees' | 'leave' | 'timesheets' | 'comp-off'

export const EXPORTS: { kind: ExportKind; label: string; hint: string; monthly: boolean }[] = [
  { kind: 'employees', label: 'Employees', hint: 'Everyone, with contact and personal details', monthly: false },
  { kind: 'leave', label: 'Leave', hint: 'Every leave request touching the month', monthly: true },
  { kind: 'timesheets', label: 'Timesheets', hint: 'Every day’s hours in the month', monthly: true },
  { kind: 'comp-off', label: 'Comp-Off', hint: 'Requests for days worked in the month', monthly: true },
]

export function exportPath(kind: ExportKind, month: string, withBank = false): string {
  if (kind === 'employees') return `/api/hr/exports/employees${withBank ? '?bank=true' : ''}`
  return `/api/hr/exports/${kind}?month=${month}`
}

export function downloadExport(token: string, kind: ExportKind, month: string, withBank = false) {
  return apiDownload(exportPath(kind, month, withBank), {
    token, fallbackName: kind === 'employees' ? 'rightcentral-employees.csv' : `rightcentral-${kind}-${month}.csv`,
  })
}
