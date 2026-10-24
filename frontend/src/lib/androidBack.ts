// Connects Android's Back (edge-swipe gesture or button) to the app's back stack.
// Capacitor sends both as one "backButton" event; with this listener set, the
// WebView no longer handles Back itself (which would close the app).
import { App as CapacitorApp } from '@capacitor/app'
import { backStack } from './backStack'

/** Starts listening. Returns a function that stops it. Does nothing in a browser. */
export function listenForAndroidBack(): () => void {
  const listener = CapacitorApp.addListener('backButton', () => {
    // Nothing to go back to (Home, sign-in): go to the background, like other apps,
    // instead of closing. The session stays in memory until Android ends the app.
    if (!backStack.back()) CapacitorApp.minimizeApp().catch(() => {})
  }).catch(() => null)
  return () => {
    listener.then((l) => l?.remove())
  }
}
