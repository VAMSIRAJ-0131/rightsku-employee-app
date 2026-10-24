// Employee app theme: Light, Dark, or System (follows the phone, live).
//
// The choice is kept on this phone only (localStorage; a theme is not private).
// While the employee app is open it sets data-theme on <html>, so pop-ups and
// messages rendered outside the app's own element follow it too. HR and the
// sign-in screen never set it, so they always stay light.

export type ThemeChoice = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'rightcentral.employee.theme'
export const THEME_CHOICES: { id: ThemeChoice; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
]

type Store = Pick<Storage, 'getItem' | 'setItem'>

function defaultStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null // storage blocked
  }
}

/** The saved choice; System when nothing (or nothing valid) is saved, or storage is blocked. */
export function readThemeChoice(store: Store | null = defaultStore()): ThemeChoice {
  try {
    const saved = store?.getItem(THEME_STORAGE_KEY)
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
  } catch {
    return 'system'
  }
}

/** Saves the choice. Returns false when it could not be stored (it still applies until the app closes). */
export function saveThemeChoice(choice: ThemeChoice, store: Store | null = defaultStore()): boolean {
  try {
    if (!store) return false
    store.setItem(THEME_STORAGE_KEY, choice)
    return true
  } catch {
    return false
  }
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  return choice === 'system' ? (systemDark ? 'dark' : 'light') : choice
}

/** Sets (or with null, removes) the theme on the page root. */
export function applyTheme(root: HTMLElement, theme: Theme | null) {
  if (theme) {
    root.dataset.theme = theme
    root.style.colorScheme = theme
  } else {
    delete root.dataset.theme
    root.style.colorScheme = ''
  }
}

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Whether the phone is in dark mode now. */
export function systemPrefersDark(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches
  } catch {
    return false
  }
}

/** Calls back whenever the phone switches between light and dark. Returns a function that stops it. */
export function onSystemThemeChange(callback: (dark: boolean) => void): () => void {
  if (typeof matchMedia !== 'function') return () => {}
  const query = matchMedia(DARK_QUERY)
  const listener = (e: MediaQueryListEvent) => callback(e.matches)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}
