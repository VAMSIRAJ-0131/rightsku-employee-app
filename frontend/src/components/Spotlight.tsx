// Wraps a list item that a tapped notification points at: scrolls it into
// view and outlines it, so the employee sees which record the message meant.
import { useEffect, useRef, type ReactNode } from 'react'

export default function Spotlight({ on, children }: { on: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!on) return
    // After the screen has settled (lists may still be appearing), jump straight to the item.
    const timer = window.setTimeout(() => ref.current?.scrollIntoView?.({ block: 'center' }), 250)
    return () => window.clearTimeout(timer)
  }, [on])
  return (
    <div
      ref={ref}
      data-spotlight={on || undefined}
      // The outline is drawn on top (::after), so the item's own background can't hide it.
      className={on
        ? 'relative after:pointer-events-none after:absolute after:inset-0 after:rounded-xl after:ring-2 after:ring-inset after:ring-[#1E88D2]/80'
        : undefined}
    >
      {children}
    </div>
  )
}
