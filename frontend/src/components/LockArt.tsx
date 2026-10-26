// Shared look of the app-lock screens (setup, PIN, unlock): the soft blue
// background with waves, the round back/close button and the lock badge.
import type { ReactNode } from 'react'
import { Icon } from './Icons'

/** Full-screen sheet with the pale blue background and soft waves at the bottom. */
export function LockSheet({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className="lock-sheet fixed inset-0 z-[60] flex flex-col items-center overflow-y-auto px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))]"
    >
      <svg aria-hidden="true" viewBox="0 0 400 220" preserveAspectRatio="none" className="pointer-events-none fixed inset-x-0 bottom-0 h-[34vh] w-full text-royal-600">
        <path d="M0 120 C70 70 150 90 220 130 S340 170 400 110 V220 H0Z" fill="currentColor" fillOpacity="0.05" />
        <path d="M0 170 C90 120 170 150 250 175 S360 200 400 160 V220 H0Z" fill="currentColor" fillOpacity="0.07" />
        <path d="M260 40 C320 30 370 55 400 80 V220 H300 C330 160 310 90 260 40Z" fill="currentColor" fillOpacity="0.04" />
      </svg>
      <div className="relative flex w-full max-w-sm flex-1 flex-col">{children}</div>
    </div>
  )
}

/** The round white close (x) or back (<) button at the top left. */
export function RoundBack({ kind, label, onClick, disabled }: { kind: 'close' | 'back'; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="press grid h-12 w-12 place-items-center rounded-full bg-white text-ink ring-1 ring-inset ring-line shadow-[0_4px_12px_-6px_rgb(37_84_204/0.35)] transition-transform duration-150 disabled:opacity-60"
    >
      <Icon name={kind === 'close' ? 'x' : 'arrowLeft'} className="h-6 w-6" />
    </button>
  )
}

/** A solid blue padlock on a raised white tile (above the PIN). */
export function LockBadge() {
  return (
    <span className="grid h-[76px] w-[76px] place-items-center rounded-[22px] bg-white shadow-[0_10px_24px_-12px_rgb(37_84_204/0.45)] ring-1 ring-inset ring-line">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-10 w-10">
        <defs>
          <linearGradient id="lock-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f7df0" />
            <stop offset="100%" stopColor="#2554cc" />
          </linearGradient>
        </defs>
        <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="#2554cc" strokeWidth="2.2" strokeLinecap="round" />
        <rect x="4.5" y="10" width="15" height="11" rx="3" fill="url(#lock-body)" />
        <circle cx="12" cy="14.6" r="1.6" fill="#fff" />
        <path d="M12 15.5v2.2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  )
}
