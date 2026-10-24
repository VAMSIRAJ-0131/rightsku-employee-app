import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  listMyNotifications, markAllNotificationsRead, markNotificationRead, timeAgo, toAppNotification, type NotificationRecord,
} from './notifications'

afterEach(() => {
  vi.unstubAllGlobals()
})

const NOW = new Date('2026-10-23T12:00:00')

describe('timeAgo', () => {
  it('reads naturally for recent and older notifications', () => {
    expect(timeAgo('2026-10-23T11:59:40', NOW)).toBe('Just now')
    expect(timeAgo('2026-10-23T11:45:00', NOW)).toBe('15 min ago')
    expect(timeAgo('2026-10-23T09:00:00', NOW)).toBe('3 h ago')
    expect(timeAgo('2026-10-22T08:00:00', NOW)).toBe('Yesterday')
    expect(timeAgo('2026-10-12T08:00:00', NOW)).toMatch(/12 Oct/)
    expect(timeAgo('not a date', NOW)).toBe('')
  })
})

describe('toAppNotification', () => {
  it('keeps the server text and read state', () => {
    const r: NotificationRecord = {
      id: 7, type: 'LEAVE_APPROVED', title: 'Casual leave approved', message: 'Your Casual leave was approved.',
      read: false, createdAt: '2026-10-23T11:45:00',
    }
    expect(toAppNotification(r, NOW)).toEqual({
      id: '7', title: 'Casual leave approved', message: 'Your Casual leave was approved.', time: '15 min ago', read: false,
    })
  })
})

describe('notification API calls', () => {
  it('lists, marks one and marks all read with the token', async () => {
    const fetchMock = vi.fn(async () => new Response('{"unreadCount":0,"items":[]}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await listMyNotifications('t')
    await markNotificationRead('t', 7)
    await markAllNotificationsRead('t')

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(calls.map(([url, init]) => `${init.method} ${url}`)).toEqual([
      'GET /api/employee/notifications',
      'POST /api/employee/notifications/7/read',
      'POST /api/employee/notifications/read-all',
    ])
    expect((calls[0][1].headers as Record<string, string>).Authorization).toBe('Bearer t')
  })
})
