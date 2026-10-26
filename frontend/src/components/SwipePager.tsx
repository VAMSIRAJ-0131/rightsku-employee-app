// Side-by-side pages that the finger drags between, like iOS: the phone's own
// scrolling does the work (CSS scroll snap), so the page follows the finger
// exactly, keeps its momentum on a flick and settles on the nearest page.
// The tabs above stay in step both ways: tapping a tab scrolls to its page,
// and swiping to a page selects its tab.
//
// The pager is as tall as the page on screen (so a short page leaves no long
// empty scroll), and at least most of the screen, so swiping works anywhere
// below the tabs, not only on the content.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export interface PagerPage<T extends string> {
  id: T
  content: ReactNode
}

/** How long a tab tap takes to glide to its page. */
const GLIDE_MS = 260

/** Ease-out (fast start, soft stop). */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3)
}

/**
 * Scrolls to a page over ms milliseconds. Snapping is paused while it runs
 * (it would pull the page back mid-way) and restored at the end. Returns a
 * function that stops it.
 */
function glide(el: HTMLElement, target: number, ms: number, done: () => void): () => void {
  const from = el.scrollLeft
  const start = performance.now()
  let frame = 0
  el.style.scrollSnapType = 'none'
  const step = (now: number) => {
    const t = (now - start) / ms
    el.scrollLeft = from + (target - from) * easeOutCubic(t)
    if (t < 1) frame = requestAnimationFrame(step)
    else {
      el.style.scrollSnapType = ''
      done()
    }
  }
  frame = requestAnimationFrame(step)
  return () => {
    cancelAnimationFrame(frame)
    el.style.scrollSnapType = ''
    done()
  }
}

/** The page index nearest to this scroll position. */
export function pageAt(scrollLeft: number, width: number, count: number): number {
  if (width <= 0) return 0
  return Math.max(0, Math.min(count - 1, Math.round(scrollLeft / width)))
}

export default function SwipePager<T extends string>({
  pages, value, onChange, label,
}: {
  pages: PagerPage<T>[]
  value: T
  onChange: (id: T) => void
  /** Read out for screen readers, e.g. "Leave pages". */
  label: string
}) {
  const scroller = useRef<HTMLDivElement | null>(null)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  const index = Math.max(0, pages.findIndex((p) => p.id === value))
  const [height, setHeight] = useState<number | null>(null)
  // The page the finger (not a tab) last brought into view, so the tab change
  // that follows doesn't scroll again.
  const fromScroll = useRef<T | null>(null)
  // A tab tap is gliding to its page: the scrolling it causes is not a swipe.
  const gliding = useRef(false)

  // Open on the chosen page without animating.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = index * el.clientWidth
    // Only on the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A tab was tapped: glide to its page (a little quicker than the browser's own smooth scroll).
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    if (fromScroll.current === value) {
      fromScroll.current = null
      return
    }
    const target = index * el.clientWidth
    if (Math.abs(el.scrollLeft - target) <= 2) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      el.scrollLeft = target
      return
    }
    gliding.current = true
    return glide(el, target, GLIDE_MS, () => {
      gliding.current = false
    })
  }, [value, index])

  // The finger settled on a page: select its tab.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let timer = 0
    const settle = () => {
      if (gliding.current) return
      const i = pageAt(el.scrollLeft, el.clientWidth, pages.length)
      const id = pages[i]?.id
      if (id && id !== value) {
        fromScroll.current = id
        onChange(id)
      }
    }
    const onScroll = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(settle, 90)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('scrollend', settle)
    return () => {
      window.clearTimeout(timer)
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('scrollend', settle)
    }
  }, [pages, value, onChange])

  // As tall as the page on screen (it grows and shrinks with that page's content).
  useEffect(() => {
    const page = pageRefs.current[index]
    if (!page || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setHeight(page.offsetHeight))
    observer.observe(page)
    setHeight(page.offsetHeight)
    return () => observer.disconnect()
  }, [index])

  return (
    <div
      ref={scroller}
      role="region"
      aria-label={label}
      className="swipe-pager"
      style={{ height: height ? `max(${height}px, 62dvh)` : undefined }}
    >
      {pages.map((p, i) => (
        <div
          key={p.id}
          className="swipe-page"
          aria-hidden={i !== index}
          ref={(el) => {
            pageRefs.current[i] = el
          }}
        >
          {p.content}
        </div>
      ))}
    </div>
  )
}
