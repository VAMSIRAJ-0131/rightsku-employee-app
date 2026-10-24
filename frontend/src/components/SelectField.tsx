// A labelled dropdown styled like the app's other inputs (a native <select>,
// so phones open their own easy picker). Used in HR forms.
import { Icon } from './Icons'

export default function SelectField<T extends string>({
  id, label, value, options, onChange, placeholder, error, hint,
}: {
  id: string
  label: string
  value: T | ''
  options: { value: T; label: string }[]
  onChange: (value: T | '') => void
  /** The first, empty choice, e.g. "Not set". */
  placeholder: string
  error?: string
  hint?: string
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-[13px] font-medium text-ink-soft">{label}</span>
      <span className="relative mt-1.5 block">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value as T | '')}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={`h-12 w-full appearance-none rounded-xl border bg-white pl-4 pr-10 text-[15px] outline-none focus:border-mist-500 focus:ring-4 focus:ring-mist-100 ${
            value ? 'text-ink' : 'text-ink-muted'
          } ${error ? 'border-bad/50' : 'border-line-strong'}`}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon
          name="chevronRight"
          className="pointer-events-none absolute right-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 rotate-90 text-ink-muted"
        />
      </span>
      {error ? (
        <span id={`${id}-error`} className="mt-1.5 block text-[12px] text-bad">{error}</span>
      ) : hint ? (
        <span id={`${id}-hint`} className="mt-1.5 block text-[12px] leading-relaxed text-ink-muted">{hint}</span>
      ) : null}
    </label>
  )
}
