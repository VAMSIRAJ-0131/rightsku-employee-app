// A dropdown in the app's own style. A native <select> opens Android's system
// picker, which looks out of place; this opens the same rounded bottom sheet
// as the app's other pop-ups, with a tick on the chosen option.
//
// Accessible like a listbox: the field says it opens a list; in the list the
// arrow keys, Home/End and Enter/Space work, Escape or a tap outside closes
// it, and focus returns to the field.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icons'
import { useBackHandler } from './ui'

type Step = 1 | -1 | 'first' | 'last'

/**
 * The option a key moves to, skipping disabled ones and wrapping around at
 * the ends (-1 when nothing can be chosen). from is the focused option, or -1.
 */
export function nextOptionIndex(disabled: boolean[], from: number, step: Step): number {
  const enabled = disabled.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0)
  if (enabled.length === 0) return -1
  if (step === 'first') return enabled[0]
  if (step === 'last') return enabled[enabled.length - 1]
  const at = enabled.indexOf(from)
  if (at < 0) return step === 1 ? enabled[0] : enabled[enabled.length - 1]
  return enabled[(at + step + enabled.length) % enabled.length]
}

export interface DropdownOption<T extends string | number> {
  value: T
  label: string
  /** Shown on the right of the option, for example a count. */
  hint?: string
  disabled?: boolean
}

export default function Dropdown<T extends string | number>({
  label, value, options, onChange, sheetTitle, className = '',
}: {
  label: string
  value: T
  options: DropdownOption<T>[]
  onChange: (value: T) => void
  /** Heading of the open list (defaults to the label). */
  sheetTitle?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()
  const selected = options.find((o) => o.value === value)
  // Where focus goes when the list opens (worked out at the moment it opens,
  // so a re-render while it is open never moves the focus).
  const focusOnOpen = useRef(0)

  useEffect(() => {
    if (open) optionRefs.current[focusOnOpen.current]?.focus()
  }, [open])

  function openList() {
    const chosen = options.findIndex((o) => o.value === value && !o.disabled)
    const firstEnabled = options.findIndex((o) => !o.disabled)
    focusOnOpen.current = chosen >= 0 ? chosen : Math.max(0, firstEnabled)
    setOpen(true)
  }

  function close() {
    setOpen(false)
    trigger.current?.focus()
  }

  // Android Back closes the open list first, before the screen goes back.
  useBackHandler(close, open)

  function choose(option: DropdownOption<T>) {
    if (option.disabled) return
    onChange(option.value)
    close()
  }

  function moveFocus(from: number, step: Step) {
    const next = nextOptionIndex(options.map((o) => !!o.disabled), from, step)
    if (next >= 0) optionRefs.current[next]?.focus()
  }

  function onListKey(e: KeyboardEvent<HTMLDivElement>) {
    const current = optionRefs.current.findIndex((el) => el === document.activeElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveFocus(current, 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveFocus(current, -1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      moveFocus(current, 'first')
    } else if (e.key === 'End') {
      e.preventDefault()
      moveFocus(current, 'last')
    } else if (e.key === 'Tab') {
      e.preventDefault() // keep focus inside the open list
    }
  }

  return (
    <div className={className}>
      <span id={`${id}-label`} className="text-[13px] font-medium text-ink-soft">
        {label}
      </span>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={openList}
        className="press gloss-light mt-1.5 flex h-12 w-full items-center gap-2 rounded-xl border border-line-strong px-4 text-left text-[15px] text-ink transition-transform duration-150 focus-visible:border-mist-500"
      >
        <span id={`${id}-value`} className="min-w-0 flex-1 truncate font-medium">
          {selected?.label ?? 'Choose'}
        </span>
        {selected?.hint && <span className="tnum shrink-0 text-[13px] text-ink-muted">{selected.hint}</span>}
        <Icon name="chevronRight" className="h-[18px] w-[18px] shrink-0 rotate-90 text-mist-500" />
      </button>

      {open &&
        createPortal(
          // Sized to the screen (100vw x 100dvh) rather than to the page, so even a page
          // that is wider than the phone can never push the list off the edge.
          <div
            className="backdrop-enter fixed left-0 top-0 z-50 flex h-dvh w-screen items-end justify-center bg-navy-950/45 p-3 backdrop-blur-[2px] sm:items-center"
            onClick={close}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${id}-sheet`}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={onListKey}
              className="sheet sheet-enter relative flex max-h-[min(75dvh,36rem)] w-[min(28rem,calc(100vw-1.5rem))] flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]"
            >
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 pb-3 pt-4">
                <span aria-hidden className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-line-strong" />
                <p id={`${id}-sheet`} className="text-[16px] font-semibold text-ink">
                  {sheetTitle ?? label}
                </p>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  className="grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-mist-50"
                >
                  <Icon name="x" className="h-[18px] w-[18px]" />
                </button>
              </div>
              <div role="listbox" aria-labelledby={`${id}-sheet`} className="overflow-y-auto overscroll-contain p-2">
                {options.map((o, i) => {
                  const on = o.value === value
                  return (
                    <button
                      key={String(o.value)}
                      ref={(el) => {
                        optionRefs.current[i] = el
                      }}
                      type="button"
                      role="option"
                      aria-selected={on}
                      aria-disabled={o.disabled || undefined}
                      disabled={o.disabled}
                      onClick={() => choose(o)}
                      className={`press flex min-h-12 w-full items-center gap-3 rounded-xl px-3.5 text-left text-[15px] transition-[background-color,transform] duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] disabled:cursor-not-allowed disabled:opacity-40 ${
                        on ? 'bg-royal-50 font-semibold text-royal-700' : 'text-ink hover:bg-mist-50'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {o.hint && <span className="tnum shrink-0 text-[13px] text-ink-muted">{o.hint}</span>}
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${on ? 'gloss-navy text-white' : ''}`}>
                        {on && <Icon name="check" className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
