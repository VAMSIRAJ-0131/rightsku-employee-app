import { beforeEach, describe, expect, it, vi } from 'vitest'

const native = vi.hoisted(() => ({
  isNative: true,
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  createChannel: vi.fn(),
  schedule: vi.fn(),
  addListener: vi.fn(),
  openFile: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.isNative } }))
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: native.checkPermissions,
    requestPermissions: native.requestPermissions,
    createChannel: native.createChannel,
    schedule: native.schedule,
    addListener: native.addListener,
  },
}))
vi.mock('@capawesome-team/capacitor-file-opener', () => ({ FileOpener: { openFile: native.openFile } }))

import { documentKind, notifyDownloaded, notifyNewInbox, onNotificationTap, setInboxOpener } from './systemNotifications'

const saved = {
  fileName: 'Payslip - September 2026.pdf',
  location: 'Documents/RightCentral/Payslip - September 2026.pdf',
  uri: 'file:///storage/emulated/0/Documents/RightCentral/Payslip - September 2026.pdf',
  mimeType: 'application/pdf',
}

const store = new Map<string, string>()

beforeEach(() => {
  native.isNative = true
  for (const m of Object.values(native)) if (typeof m === 'function') (m as ReturnType<typeof vi.fn>).mockReset()
  native.checkPermissions.mockResolvedValue({ display: 'granted' })
  native.createChannel.mockResolvedValue(undefined)
  native.schedule.mockResolvedValue({ notifications: [] })
  native.openFile.mockResolvedValue(undefined)
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  })
})

describe('download notification', () => {
  it('shows "Payslip downloaded successfully" with the file name and where it is', async () => {
    expect(await notifyDownloaded(saved, 'Payslip - September 2026')).toBe(true)

    const [{ notifications: [n] }] = native.schedule.mock.calls[0]
    expect(n.title).toBe('Payslip downloaded successfully')
    expect(n.body).toContain('Payslip - September 2026.pdf')
    expect(n.body).toContain('Documents › RightCentral')
    expect(n.channelId).toBe('downloads')
    expect(n.extra).toEqual({ kind: 'file', uri: saved.uri, mimeType: 'application/pdf' })
    // Posted at once: never an exact alarm, so Android never opens "Alarms & reminders".
    expect(n.isExactNotification).toBe(false)
    expect(n.schedule).toBeUndefined()
  })

  it('asks for permission once on Android 13+, and shows nothing if the person says no', async () => {
    native.checkPermissions.mockResolvedValue({ display: 'prompt' })
    native.requestPermissions.mockResolvedValue({ display: 'denied' })

    expect(await notifyDownloaded(saved, 'Payslip')).toBe(false)
    expect(native.requestPermissions).toHaveBeenCalledOnce()
    expect(native.schedule).not.toHaveBeenCalled()
  })

  it('does nothing in a browser', async () => {
    native.isNative = false
    expect(await notifyDownloaded(saved, 'Payslip')).toBe(false)
    expect(native.checkPermissions).not.toHaveBeenCalled()
  })

  it('names each document kind', () => {
    expect(documentKind('Payslip - September 2026')).toBe('Payslip')
    expect(documentKind('Offer letter - Ravi')).toBe('Offer letter')
    expect(documentKind('Experience Letter')).toBe('Experience letter')
    expect(documentKind('Form 16 - 2025-26')).toBe('Form 16')
    expect(documentKind('Something else')).toBe('Document')
  })
})

describe('tapping a notification', () => {
  it('opens the saved file, or the inbox for updates', async () => {
    let tap: (e: unknown) => void = () => {}
    native.addListener.mockImplementation((_name: string, fn: (e: unknown) => void) => {
      tap = fn
      return Promise.resolve({ remove: vi.fn() })
    })
    const openInbox = vi.fn()
    setInboxOpener(openInbox)
    const stop = onNotificationTap()

    tap({ notification: { extra: { kind: 'file', uri: saved.uri, mimeType: 'application/pdf' } } })
    expect(native.openFile).toHaveBeenCalledWith({ path: saved.uri, mimeType: 'application/pdf' })
    tap({ notification: { extra: { kind: 'inbox' } } })
    expect(openInbox).toHaveBeenCalledOnce()

    stop()
    setInboxOpener(null)
  })
})

describe('server notifications on the phone (while the app is open)', () => {
  const item = (id: number, read = false) => ({ id, title: `Title ${id}`, message: `Message ${id}`, read })

  it('the first check only remembers the newest id, so old ones never flood the phone', async () => {
    expect(await notifyNewInbox('10002', [item(3), item(2)])).toBe(0)
    expect(native.schedule).not.toHaveBeenCalled()
    expect(store.get('rightcentral.notified-up-to.10002')).toBe('3')
  })

  it('later checks show only new, unread ones, once', async () => {
    store.set('rightcentral.notified-up-to.10002', '3')

    expect(await notifyNewInbox('10002', [item(5), item(4, true), item(3)])).toBe(1)
    const [{ notifications }] = native.schedule.mock.calls[0]
    expect(notifications.map((n: { title: string }) => n.title)).toEqual(['Title 5'])
    expect(notifications[0].extra).toEqual({ kind: 'inbox' })
    expect(notifications[0].isExactNotification).toBe(false)
    expect(notifications[0].schedule).toBeUndefined()

    expect(await notifyNewInbox('10002', [item(5), item(4, true), item(3)])).toBe(0)
    expect(native.schedule).toHaveBeenCalledOnce()
  })

  it('keeps each account separate on a shared phone', async () => {
    store.set('rightcentral.notified-up-to.10002', '9')
    expect(await notifyNewInbox('10003', [item(10)])).toBe(0)   // first check for 10003
    expect(store.get('rightcentral.notified-up-to.10003')).toBe('10')
  })
})
