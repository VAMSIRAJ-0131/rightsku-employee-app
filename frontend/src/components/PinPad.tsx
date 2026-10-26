// A 4-digit PIN entry: four dots and a keypad of round keys (no system
// keyboard). onComplete runs as soon as the fourth digit is typed. Changing
// resetKey clears what was typed (after a wrong PIN, or between steps).
import { useEffect, useState } from 'react'
import { Icon } from './Icons'
import { Spinner } from './ui'
import { PIN_LENGTH } from '../lib/appLock'

export default function PinPad({
  onComplete, busy = false, resetKey, extraKey,
}: {
  onComplete: (pin: string) => void
  busy?: boolean
  resetKey?: unknown
  /** Bottom-left key, e.g. "use fingerprint". */
  extraKey?: { label: string; icon: 'fingerprint'; onPress: () => void }
}) {
  const [pin, setPin] = useState('')
  useEffect(() => setPin(''), [resetKey])

  function press(digit: string) {
    if (busy || pin.length >= PIN_LENGTH) return
    const next = pin + digit
    setPin(next)
    if (next.length === PIN_LENGTH) onComplete(next)
  }

  const round = 'press grid h-[74px] w-[74px] place-items-center justify-self-center rounded-full transition-transform duration-150 disabled:opacity-50'
  const digitKey = `${round} pin-key tnum text-[30px] font-medium text-ink`
  const softKey = `${round} bg-royal-50 text-royal-600 ring-1 ring-inset ring-royal-100`

  return (
    <div className="w-[280px] max-w-full">
      <div className="flex h-8 items-center justify-center gap-6" aria-live="polite" aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}>
        {busy ? (
          <Spinner className="h-6 w-6 text-royal-600" />
        ) : (
          Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              className={`h-[18px] w-[18px] rounded-full transition-colors duration-150 ${
                i < pin.length ? 'bg-royal-600' : 'ring-2 ring-inset ring-royal-600/45'
              }`}
            />
          ))
        )}
      </div>
      <div className="mt-8 grid grid-cols-3 gap-x-4 gap-y-3.5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" disabled={busy} onClick={() => press(d)} className={digitKey}>
            {d}
          </button>
        ))}
        {extraKey ? (
          <button type="button" disabled={busy} onClick={extraKey.onPress} aria-label={extraKey.label} className={softKey}>
            <Icon name={extraKey.icon} className="h-8 w-8" />
          </button>
        ) : (
          <span />
        )}
        <button type="button" disabled={busy} onClick={() => press('0')} className={digitKey}>
          0
        </button>
        <button
          type="button"
          disabled={busy || pin.length === 0}
          onClick={() => setPin((p) => p.slice(0, -1))}
          aria-label="Delete last digit"
          className={softKey}
        >
          <Icon name="backspace" className="h-7 w-7" />
        </button>
      </div>
    </div>
  )
}
