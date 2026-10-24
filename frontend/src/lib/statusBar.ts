// Android status bar and gesture bar icons follow the app's own theme, not the
// phone's: dark (navy/charcoal) icons on the light app, white icons on the dark
// one. The bars are see-through and the app's background shows behind them, so
// the background always matches the page. Does nothing in a browser.
import { SystemBars, SystemBarsStyle } from '@capacitor/core'
import type { Theme } from './theme'

/** The SystemBars style for a page theme: LIGHT means dark icons for a light background. */
export function barStyleFor(theme: Theme): SystemBarsStyle {
  return theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light
}

export function setStatusBarTheme(theme: Theme) {
  try {
    SystemBars.setStyle({ style: barStyleFor(theme) }).catch(() => {})
  } catch {
    // not available here (browser, older native shell)
  }
}
