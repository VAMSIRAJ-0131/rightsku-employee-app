// A small "Are you sure?" sheet in the app's style: Cancel and a confirm button.
// Back gesture, Escape and Cancel all close it; a double tap confirms only once.
import { useEffect, useRef, useState } from 'react'
import { useBackHandler } from './ui'

export default function ConfirmSheet({
  title, message, confirmLabel, danger = false, onCancel, onConfirm,
}: {
  title: string
  message?: string
  confirmLabel: string
  /** Red confirm button, for something that removes things. */
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement | null>(null)
  const [answered, setAnswered] = useState(false)

  useBackHandler(onCancel)
  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="backdrop-enter fixed inset-0 z-50 grid place-items-end bg-navy-950/45 p-4 backdrop-blur-[2px] sm:place-items-center">
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-sheet-title" className="sheet sheet-enter w-full max-w-sm p-5">
        <p id="confirm-sheet-title" className="text-[16px] font-semibold leading-snug text-ink">{title}</p>
        {message && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{message}</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={answered}
            className="h-12 rounded-lg bg-white text-[15px] font-semibold text-navy-900 ring-1 ring-inset ring-line-strong hover:bg-mist-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (answered) return
              setAnswered(true)
              onConfirm()
            }}
            disabled={answered}
            className={`press h-12 rounded-xl text-[15px] font-semibold text-white transition-transform duration-150 disabled:opacity-60 ${
              danger ? 'gloss-red' : 'gloss-navy'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
