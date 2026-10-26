// The signed-in employee's in-app notifications (GET /api/employee/notifications).
//
// The backend writes them when HR acts: leave, timesheet or Comp-Off
// approved/rejected, payslip or document published, weekly-off schedule
// changed. The app lists them, marks them read, clears them (hides them from
// the list; the leave, timesheet or document itself is never touched) and,
// when one is tapped, opens the record it is about.
import type { AppNotification } from '../data/types'
import { apiRequest } from './api'

export interface NotificationRecord {
  id: number
  type: string
  title: string
  message: string
  read: boolean
  createdAt: string
  /** What it is about: LEAVE_REQUEST, TIMESHEET_WEEK, DOCUMENT, SCHEDULE or COMP_OFF_REQUEST (null for older ones). */
  linkType?: string | null
  /** The record: a leave or Comp-Off request id, a document id, or a Monday "YYYY-MM-DD". */
  linkKey?: string | null
}

/** Where tapping a notification goes. key: the record to highlight there, when known. */
export type NotificationTarget =
  | { screen: 'requests'; view: 'leaves' | 'timesheets'; key: string | null }
  | { screen: 'payslips'; key: string | null }
  | { screen: 'documents'; key: string | null }
  | { screen: 'compoff'; key: string | null }
  | { screen: 'schedule'; key: string | null }
  | { screen: 'timesheet'; key: string | null }
  | { screen: 'holidays' }
  | { screen: 'leave' }
  | { screen: 'profile' }
  | { screen: 'notifications' }

/**
 * The screen for a notification: from its link, or (older notifications
 * without one) from its type. Unknown types stay on the notification list.
 */
export function notificationTarget(n: Pick<NotificationRecord, 'type' | 'linkType' | 'linkKey'>): NotificationTarget {
  const key = n.linkKey ?? null
  const type = n.type ?? ''
  // Specific types first: "LEAVE_BALANCE_UPDATED" must not fall under the LEAVE_ requests rule.
  if (type === 'HOLIDAYS_UPDATED') return { screen: 'holidays' }
  if (type === 'LEAVE_BALANCE_UPDATED') return { screen: 'leave' }
  if (type.startsWith('PROFILE_CHANGE_')) return { screen: 'profile' }
  if (n.linkType === 'COMP_OFF_REQUEST' || type.startsWith('COMP_OFF_')) return { screen: 'compoff', key }
  if (n.linkType === 'SCHEDULE' || type === 'SCHEDULE_CHANGED') return { screen: 'schedule', key }
  if (n.linkType === 'LEAVE_REQUEST' || type.startsWith('LEAVE_')) return { screen: 'requests', view: 'leaves', key }
  if (type === 'TIMESHEET_REMINDER') return { screen: 'timesheet', key }
  if (n.linkType === 'TIMESHEET_WEEK' || type.startsWith('TIMESHEET_')) return { screen: 'requests', view: 'timesheets', key }
  if (type === 'PAYSLIP_PUBLISHED') return { screen: 'payslips', key }
  if (n.linkType === 'DOCUMENT' || type === 'DOCUMENT_PUBLISHED') return { screen: 'documents', key }
  return { screen: 'notifications' }
}

export interface NotificationPage {
  unreadCount: number
  items: NotificationRecord[]
}

export function listMyNotifications(token: string, signal?: AbortSignal) {
  return apiRequest<NotificationPage>('/api/employee/notifications', { token, signal })
}

export function markNotificationRead(token: string, id: number) {
  return apiRequest<NotificationRecord>(`/api/employee/notifications/${id}/read`, { token, method: 'POST' })
}

export function markAllNotificationsRead(token: string) {
  return apiRequest<NotificationPage>('/api/employee/notifications/read-all', { token, method: 'POST' })
}

/** Clears (hides) one notification; returns the updated list. */
export function clearNotification(token: string, id: number) {
  return apiRequest<NotificationPage>(`/api/employee/notifications/${id}/clear`, { token, method: 'POST' })
}

/** Clears all of the employee's notifications; returns the (now empty) list. */
export function clearAllNotifications(token: string) {
  return apiRequest<NotificationPage>('/api/employee/notifications/clear-all', { token, method: 'POST' })
}

/** "Just now", "5 min ago", "3 h ago", "Yesterday", then the date ("12 Oct"). */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (then.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return then.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', ...(then.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
}

export function toAppNotification(r: NotificationRecord, now: Date = new Date()): AppNotification {
  return { id: String(r.id), title: r.title, message: r.message, time: timeAgo(r.createdAt, now), read: r.read }
}
