// Left/right swipe between pages of a screen (weeks, tabs). The existing
// arrows and tabs keep working; this adds the gesture, like a native pager:
//
//   - while dragging, the page follows the finger 1:1 (drawn once per frame),
//     with rubber-band resistance where there is no page in that direction;
//   - let go past SWIPE_MIN_PX, or with a quick flick, and the page glides off
//     that side; the next page then glides in from the other side (slideClass);
//   - a short or slow drag springs back.
//
// Touches that start near the screen edges are ignored (Android's back
// gesture), and so are touches on fields and dialogs. Vertical scrolling is
// left to the browser (touch-action: pan-y).
import { useCallback, useRef } from 'react'

export const SWIPE_MIN_PX = 60
/** A flick: at least this fast (px per ms) over at least FLICK_MIN_PX. */
const FLICK_SPEED = 0.45
const FLICK_MIN_PX = 24
const EDGE_PX = 24
const OUT_MS = 130
const BACK_MS = 220

/** Which way a finger movement swipes, or null when it isn't a swipe. */
export function swipeDirection(dx: number, dy: number, startX: number, screenWidth: number, speed = 0): 'left' | 'right' | null {
  if (startX < EDGE_PX || startX > screenWidth - EDGE_PX) return null
  if (Math.abs(dx) < Math.abs(dy) * 1.5) return null
  const far = Math.abs(dx) >= SWIPE_MIN_PX
  const flick = Math.abs(dx) >= FLICK_MIN_PX && speed >= FLICK_SPEED
  if (!far && !flick) return null
  return dx < 0 ? 'left' : 'right'
}

/** How far the page follows the finger: all the way, or a rubber band when there is nowhere to go. */
export function dragOffset(dx: number, canGo: boolean): number {
  if (canGo) return Math.round(dx)
  // Rubber band: the further you pull, the less it moves (at most about 60 px).
  const pull = Math.abs(dx)
  return Math.round(Math.sign(dx) * (60 * pull) / (pull + 120))
}

/** The animation class for a page that just arrived from the next (right) or previous (left) side. */
export function slideClass(from: 'next' | 'prev' | null): string {
  return from === 'next' ? 'slide-from-next' : from === 'prev' ? 'slide-from-prev' : ''
}

/**
 * Swipe left (finger moves to the left) means "next", swipe right
 * "previous". Either handler may be left out (no page that way). Returns a
 * ref callback for the element that moves: it works whenever that element is
 * on screen, also when it appears later.
 */
export function useSwipe<T extends HTMLElement>(
  onLeft: (() => void) | undefined,
  onRight: (() => void) | undefined,
): (el: T | null) => void {
  const handlers = useRef({ onLeft, onRight })
  handlers.current = { onLeft, onRight }
  const detach = useRef<(() => void) | null>(null)

  return useCallback((el: T | null) => {
    detach.current?.()
    detach.current = null
    if (!el) return
    el.style.touchAction = 'pan-y'
    let start: { x: number; y: number; t: number } | null = null
    let last = { x: 0, t: 0 }
    let speed = 0
    let dragging = false
    let frame = 0
    let offset = 0
    let busy = false

    const paint = () => {
      frame = 0
      el.style.transform = offset ? `translate3d(${offset}px, 0, 0)` : ''
    }
    const moveTo = (px: number) => {
      offset = px
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const animateTo = (px: number, ms: number, ease: string, then?: () => void) => {
      cancelAnimationFrame(frame)
      frame = 0
      el.style.transition = `transform ${ms}ms ${ease}, opacity ${ms}ms ${ease}`
      el.style.transform = px ? `translate3d(${px}px, 0, 0)` : ''
      el.style.opacity = px ? '0.35' : ''
      window.setTimeout(() => {
        el.style.transition = ''
        then?.()
      }, ms)
    }
    const reset = () => {
      offset = 0
      el.style.transition = 'none'
      el.style.transform = ''
      el.style.opacity = ''
    }

    const down = (e: TouchEvent) => {
      dragging = false
      const target = e.target as HTMLElement | null
      if (busy || e.touches.length !== 1 || target?.closest('input, textarea, select, [role="dialog"], [data-no-swipe]')) {
        start = null
        return
      }
      const x = e.touches[0].clientX
      if (x < EDGE_PX || x > window.innerWidth - EDGE_PX) {
        start = null
        return
      }
      start = { x, y: e.touches[0].clientY, t: e.timeStamp }
      last = { x, t: e.timeStamp }
      speed = 0
    }
    const move = (e: TouchEvent) => {
      if (!start) return
      const x = e.touches[0].clientX
      const dx = x - start.x
      const dy = e.touches[0].clientY - start.y
      if (!dragging) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy) * 1.2) return
        dragging = true
        el.style.transition = 'none'
        el.style.willChange = 'transform'
      }
      const dt = Math.max(1, e.timeStamp - last.t)
      speed = Math.abs(x - last.x) / dt
      last = { x, t: e.timeStamp }
      const canGo = dx < 0 ? !!handlers.current.onLeft : !!handlers.current.onRight
      moveTo(dragOffset(dx, canGo))
    }
    const up = (e: TouchEvent) => {
      if (!start) return
      const t = e.changedTouches[0]
      const dir = swipeDirection(t.clientX - start.x, t.clientY - start.y, start.x, window.innerWidth, speed)
      start = null
      const wasDragging = dragging
      dragging = false
      el.style.willChange = ''
      const go = dir === 'left' ? handlers.current.onLeft : dir === 'right' ? handlers.current.onRight : undefined
      if (!go) {
        if (wasDragging) animateTo(0, BACK_MS, 'cubic-bezier(0.2, 0.9, 0.3, 1.15)')
        return
      }
      // Glide off that side, then show the next page (which glides in from the other side).
      busy = true
      const width = el.getBoundingClientRect().width || window.innerWidth
      animateTo(dir === 'left' ? -width * 0.6 : width * 0.6, OUT_MS, 'cubic-bezier(0.4, 0, 1, 1)', () => {
        go()
        // Two frames: the new page is on screen before the old position is cleared.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          reset()
          busy = false
        }))
      })
    }
    const cancel = () => {
      start = null
      if (dragging) animateTo(0, BACK_MS, 'cubic-bezier(0.2, 0.9, 0.3, 1.15)')
      dragging = false
    }
    el.addEventListener('touchstart', down, { passive: true })
    el.addEventListener('touchmove', move, { passive: true })
    el.addEventListener('touchend', up, { passive: true })
    el.addEventListener('touchcancel', cancel, { passive: true })
    detach.current = () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('touchstart', down)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', up)
      el.removeEventListener('touchcancel', cancel)
      reset()
      el.style.transition = ''
    }
  }, [])
}

/**
 * Which side a changing value (week, tab) last came from: 'next' when it
 * moved forward, 'prev' when back, null before the first change, so the first
 * view does not slide in. order compares two values like a sort.
 */
export function useSlideFrom<V>(value: V, order: (a: V, b: V) => number): 'next' | 'prev' | null {
  const last = useRef(value)
  const from = useRef<'next' | 'prev' | null>(null)
  if (!Object.is(last.current, value)) {
    from.current = order(value, last.current) > 0 ? 'next' : 'prev'
    last.current = value
  }
  return from.current
}
