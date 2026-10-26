// Push notifications from the server (Firebase Cloud Messaging), so HR's
// decisions, new payslips and the weekly timesheet reminder reach the phone
// at once, even when the app is closed.
//
// Firebase needs the project's google-services.json in the Android app; a
// build made with it sets VITE_PUSH_ENABLED=true. Without it the app never
// starts Firebase (which would fail) and uses its own weekly reminder on the
// phone instead (lib/systemNotifications), plus the in-app inbox as before.
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { apiRequest } from './api'
import { canNotify } from './systemNotifications'

/** This build includes Firebase (google-services.json) and may register for pushes. */
export const PUSH_CONFIGURED = String(import.meta.env.VITE_PUSH_ENABLED ?? '') === 'true'

let registeredToken: string | null = null

/**
 * Registers this phone for pushes for the signed-in account. Resolves true
 * once the server has the phone's token. onOpen runs when a push is tapped,
 * onReceived when one arrives while the app is open (to refresh the inbox).
 */
export async function startPush(token: string, onOpen: (data: Record<string, string>) => void, onReceived: () => void): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !PUSH_CONFIGURED) return false
  if (!(await canNotify())) return false
  try {
    await PushNotifications.removeAllListeners()
    const saved = new Promise<boolean>((resolve) => {
      void PushNotifications.addListener('registration', async ({ value }) => {
        const result = await apiRequest<void>('/api/push/token', { token, method: 'PUT', body: { token: value } })
        if (result.ok) registeredToken = value
        resolve(result.ok)
      })
      void PushNotifications.addListener('registrationError', () => resolve(false))
    })
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      onOpen((action.notification.data ?? {}) as Record<string, string>)
    })
    await PushNotifications.addListener('pushNotificationReceived', () => onReceived())
    await PushNotifications.register()
    return await saved
  } catch {
    return false
  }
}

/** Log out: the server forgets this phone's token, so this account's pushes stop here. */
export async function stopPush(token: string): Promise<void> {
  if (!Capacitor.isNativePlatform() || !PUSH_CONFIGURED) return
  const phoneToken = registeredToken
  registeredToken = null
  try {
    await PushNotifications.removeAllListeners()
    if (phoneToken) await apiRequest<void>('/api/push/token', { token, method: 'DELETE', body: { token: phoneToken } })
  } catch {
    // Offline: Firebase drops the token later if it is no longer used.
  }
}
