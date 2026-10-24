// The signed-in employee's in-app notifications (GET /api/employee/notifications).
//
// The backend writes them when HR acts: leave or timesheet approved/rejected,
// payslip or document published. The app only lists them and marks them read.
import type { AppNotification } from '../data/types'
import { apiRequest } from './api'

export interface NotificationRecord {
  id: number
  type: string
  title: string
  message: string
  read: boolean
  createdAt: string
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
