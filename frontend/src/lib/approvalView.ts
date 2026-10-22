// Small helpers for the HR Approvals screen: status filter, search, labels
// and the confirmation wording. Plain functions so they are easy to test.
import type { Status } from '../data/types'
import { formatShortDate } from './format'

export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type Decision = 'approve' | 'reject'

export const REVIEW_STATUSES: ReviewStatus[] = ['PENDING', 'APPROVED', 'REJECTED']

const LABEL: Record<string, Status> = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected' }

/** "PENDING" -> "Pending" (unknown values show as Pending, the safe default). */
export function statusLabel(status: string): Status {
  return LABEL[status] ?? 'Pending'
}

/** Case-insensitive match on the employee's name or Employee ID; an empty search matches everyone. */
export function matchesSearch(search: string, name: string | null, code: string | null): boolean {
  const q = search.trim().toLowerCase()
  if (!q) return true
  return (name ?? '').toLowerCase().includes(q) || (code ?? '').toLowerCase().includes(q)
}

/** "12 Oct – 18 Oct", or one date when start and end are the same day. */
export function rangeLabel(start: string, end: string): string {
  return start === end ? formatShortDate(start) : `${formatShortDate(start)} – ${formatShortDate(end)}`
}

/** "Approve Ravi Kumar's timesheet for 12 Oct – 18 Oct?" */
export function decisionQuestion(decision: Decision, name: string | null, what: string, range: string): string {
  const who = name ? `${name}’s` : 'this'
  return `${decision === 'approve' ? 'Approve' : 'Reject'} ${who} ${what} for ${range}?`
}

/** A rejection needs a short reason the employee can read (at most 500 characters). */
export function rejectReasonProblem(reason: string): string | undefined {
  const text = reason.trim()
  if (text.length < 3) return 'Give a short reason, so the employee knows what to fix.'
  if (text.length > 500) return 'Use at most 500 characters.'
  return undefined
}
