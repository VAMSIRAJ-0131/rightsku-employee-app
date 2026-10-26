// Android system notifications (the phone's notification centre), shown by
// the app itself while it is running. There is no server push here: server
// events reach the phone only when the app is open (see notifyNewInbox).
// Push while the app is closed needs Firebase Cloud Messaging, which is not
// set up.
//
// Android 13+ asks the user once for permission to show notifications; if
// they say no, the app keeps working with its in-app messages only.
//
// Every notification is posted immediately (no schedule) and marked
// isExactNotification: false. The plugin otherwise defaults to exact alarms
// and opens Android's "Alarms & reminders" settings screen; this app has no
// timed reminders, so it never needs that permission (it is also removed in
// AndroidManifest.xml).
import { Capacitor } from '@capacitor/core'
import { LocalNotifications, Weekday } from '@capacitor/local-notifications'
import { FileOpener } from '@capawesome-team/capacitor-file-opener'

const DOWNLOADS = 'downloads'
const UPDATES = 'updates'

/** Extra data stored on a notification, read back when it is tapped. */
type Extra = { kind: 'file'; uri: string; mimeType: string } | { kind: 'inbox' } | { kind: 'timesheet' }

let channelsReady: Promise<void> | null = null

function ensureChannels(): Promise<void> {
  channelsReady ??= Promise.all([
    LocalNotifications.createChannel({
      id: DOWNLOADS, name: 'Downloads', description: 'Documents saved to this phone', importance: 3, visibility: 1,
    }),
    LocalNotifications.createChannel({
      id: UPDATES, name: 'Approvals and documents', description: 'Leave and timesheet decisions, new payslips', importance: 4, visibility: 0,
    }),
  ]).then(() => undefined)
  return channelsReady
}

/** True when notifications may be shown, asking once (Android 13+) if the person has not decided yet. */
export async function canNotify(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    let { display } = await LocalNotifications.checkPermissions()
    if (display === 'prompt' || display === 'prompt-with-rationale') display = (await LocalNotifications.requestPermissions()).display
    return display === 'granted'
  } catch {
    return false
  }
}

/** A 31-bit id (Android notification ids are ints). */
function newId(): number {
  return Math.floor(Math.random() * 2_000_000_000) + 1
}

/** "Payslip", "Offer letter", ... from the document title, for the notification heading. */
export function documentKind(title: string): string {
  const t = title.toLowerCase()
  if (t.startsWith('payslip')) return 'Payslip'
  if (t.includes('offer')) return 'Offer letter'
  if (t.includes('experience')) return 'Experience letter'
  if (t.includes('form 16') || t.includes('form16')) return 'Form 16'
  if (t.includes('appraisal') || t.includes('compensation') || t.includes('hike')) return 'Appraisal letter'
  if (t.startsWith('salary summary')) return 'Salary summary'
  return 'Document'
}

/**
 * "Payslip downloaded successfully" with the file name, after the file is
 * really saved. Tapping it opens the file. Returns whether it was shown.
 */
export async function notifyDownloaded(saved: { fileName: string; location: string; uri: string; mimeType: string }, title: string): Promise<boolean> {
  if (!(await canNotify())) return false
  try {
    await ensureChannels()
    const extra: Extra = { kind: 'file', uri: saved.uri, mimeType: saved.mimeType }
    await LocalNotifications.schedule({
      notifications: [{
        id: newId(),
        channelId: DOWNLOADS,
        title: `${documentKind(title)} downloaded successfully`,
        body: `${saved.fileName}\nSaved to ${saved.location.replace(/\/[^/]*$/, '').replace(/\//g, ' › ')}. Tap to open.`,
        largeBody: `${saved.fileName}\nSaved to ${saved.location.replace(/\/[^/]*$/, '').replace(/\//g, ' › ')}. Tap to open.`,
        autoCancel: true,
        // Shown at once, never scheduled: no exact alarm, so Android never asks for "Alarms & reminders".
        isExactNotification: false,
        extra,
      }],
    })
    return true
  } catch {
    return false
  }
}

const SEEN_KEY = 'rightcentral.notified-up-to'

/**
 * Turns new in-app notifications (leave or timesheet decisions, payslips) into
 * phone notifications while the app is open. The first time, it only notes
 * the newest id, so old notifications never flood the notification centre.
 * Only ids and titles are stored on the phone, never tokens.
 */
export async function notifyNewInbox(
  accountId: string,
  items: { id: number; title: string; message: string; read: boolean }[],
): Promise<number> {
  if (!Capacitor.isNativePlatform() || items.length === 0) return 0
  const key = `${SEEN_KEY}.${accountId}`
  const newest = Math.max(...items.map((n) => n.id))
  let seen: number | null = null
  try {
    const stored = localStorage.getItem(key)
    seen = stored === null ? null : Number(stored)
  } catch {
    return 0
  }
  const fresh = seen === null ? [] : items.filter((n) => n.id > (seen as number) && !n.read)
  try {
    localStorage.setItem(key, String(Math.max(newest, seen ?? 0)))
  } catch {
    /* storage unavailable: just skip */
  }
  if (fresh.length === 0 || !(await canNotify())) return 0
  try {
    await ensureChannels()
    const extra: Extra = { kind: 'inbox' }
    await LocalNotifications.schedule({
      notifications: fresh.slice(0, 5).map((n) => ({
        id: n.id % 2_000_000_000,
        channelId: UPDATES,
        title: n.title,
        body: n.message,
        largeBody: n.message,
        autoCancel: true,
        // Shown at once, never scheduled: no exact alarm, so Android never asks for "Alarms & reminders".
        isExactNotification: false,
        extra,
      })),
    })
    return Math.min(fresh.length, 5)
  } catch {
    return 0
  }
}

/** Set by the signed-in employee screen, so tapping an update opens its notification list. */
let inboxOpener: (() => void) | null = null
export function setInboxOpener(open: (() => void) | null): void {
  inboxOpener = open
}

/** Set by the signed-in employee screen, so tapping a timesheet reminder opens the timesheet. */
let timesheetOpener: (() => void) | null = null
export function setTimesheetOpener(open: (() => void) | null): void {
  timesheetOpener = open
}

/* ---------- Weekly timesheet reminder kept on the phone ---------- */

// Two fixed ids, so scheduling again replaces them instead of adding more.
const REMINDER_IDS = [710011, 710021]

/**
 * The phone's own weekly reminder (Mondays 11:00 and 21:00), used while push
 * notifications from the server are not set up. Android keeps it when the app
 * is closed or swiped away. Scheduling again only replaces it.
 */
export async function scheduleWeeklyReminders(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !(await canNotify())) return false
  try {
    await ensureChannels()
    const extra: Extra = { kind: 'timesheet' }
    await LocalNotifications.schedule({
      notifications: [11, 21].map((hour, i) => ({
        id: REMINDER_IDS[i],
        channelId: UPDATES,
        title: 'Submit your timesheet',
        body: 'Submit last week’s timesheet if you haven’t yet, and enter today’s hours.',
        autoCancel: true,
        extra,
        schedule: { on: { weekday: Weekday.Monday, hour, minute: 0 }, allowWhileIdle: true },
      })),
    })
    return true
  } catch {
    return false
  }
}

/** Stops the phone's own reminder (push from the server took over, or the employee logged out). */
export async function cancelWeeklyReminders(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await LocalNotifications.cancel({ notifications: REMINDER_IDS.map((id) => ({ id })) })
  } catch {
    // Nothing scheduled.
  }
}

/**
 * What happens when a notification is tapped, registered once when the app
 * starts (so it also works when the tap launched the app): a download opens
 * the saved file, which needs no sign-in (if no app can open it, the person
 * still has it in Documents); an update opens the in-app notification list
 * when someone is signed in. Returns a function that removes the listener.
 */
export function onNotificationTap(): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}
  const handle = LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const extra = event.notification.extra as Extra | undefined
    if (extra?.kind === 'file') {
      FileOpener.openFile({ path: extra.uri, mimeType: extra.mimeType }).catch(() => {})
    } else if (extra?.kind === 'inbox') {
      inboxOpener?.()
    } else if (extra?.kind === 'timesheet') {
      timesheetOpener?.()
    }
  })
  return () => {
    handle.then((h) => h.remove()).catch(() => {})
  }
}
