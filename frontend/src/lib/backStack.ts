// Android Back (the back gesture from the screen edge, or the back button).
//
// Whatever is on top handles it first: an open dropdown or dialog closes,
// otherwise the screen's back arrow runs. Every TopBar with a back arrow and
// every sheet or dialog registers here while it is on screen, so the gesture
// always does the same as the visible "back" control. With nothing registered
// (Home, sign-in) the app goes to the background instead of closing.

/** Returns false to let the next handler below try. */
export type BackHandler = () => boolean | void

export interface BackStack {
  /**
   * Adds a handler on top of its level. Call the returned function to remove it.
   * Level 'app' is for a whole app's fallback (such as "go to Home"): it always
   * runs after every screen and pop-up handler, whatever order React mounted them in.
   */
  push(handler: BackHandler, level?: 'screen' | 'app'): () => void
  /** Runs the top-most handler that takes it. False when none did. */
  back(): boolean
  size(): number
}

export function createBackStack(): BackStack {
  const handlers: { handler: BackHandler; app: boolean }[] = []
  return {
    push(handler, level = 'screen') {
      const entry = { handler, app: level === 'app' }
      // App-level handlers stay below every screen-level one.
      const firstScreen = handlers.findIndex((h) => !h.app)
      if (entry.app && firstScreen >= 0) handlers.splice(firstScreen, 0, entry)
      else handlers.push(entry)
      return () => {
        const i = handlers.indexOf(entry)
        if (i >= 0) handlers.splice(i, 1)
      }
    },
    back() {
      for (let i = handlers.length - 1; i >= 0; i--) {
        if (handlers[i].handler() !== false) return true
      }
      return false
    },
    size: () => handlers.length,
  }
}

/** The app's one stack. */
export const backStack = createBackStack()
