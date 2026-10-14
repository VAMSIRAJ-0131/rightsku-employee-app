// RIGHTSKU design system: shared building blocks used by every screen so the
// whole app looks and behaves the same way.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icons'
import type { Status } from '../data/types'
import { initials } from '../lib/format'

/* ---------- Layout ---------- */

export function Page({ children, withNav = true }: { children: ReactNode; withNav?: boolean }) {
  // Bottom padding keeps content clear of the fixed bottom navigation.
  return (
    <main
      className={`mx-auto min-h-dvh w-full max-w-md bg-canvas ${
        withNav ? 'pb-[calc(5.5rem+env(safe-area-inset-bottom))]' : 'pb-8'
      }`}
    >
      {children}
    </main>
  )
}

export function BrandMark({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const light = tone === 'light'
  return (
    <span className="flex items-center gap-2">
      <span
        className={`grid h-7 w-7 place-items-center rounded-md text-[13px] font-bold ${
          light ? 'bg-white text-navy-900' : 'bg-navy-900 text-white'
        }`}
      >
        R
      </span>
      <span className={`text-[13px] font-semibold tracking-[0.14em] ${light ? 'text-white' : 'text-navy-900'}`}>RIGHTSKU</span>
    </span>
  )
}

/** Home-screen header: brand, notifications and avatar. */
export function AppHeader({ right }: { right: ReactNode }) {
  return (
    <header className="flex h-14 items-center justify-between px-5 pt-[env(safe-area-inset-top)]">
      <BrandMark />
      <div className="flex items-center gap-2">{right}</div>
    </header>
  )
}

/** Inner-screen header with optional back button. */
export function TopBar({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string
  subtitle?: string
  onBack?: () => void
  right?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex min-h-16 items-center gap-2 px-3 py-2">
        {onBack ? (
          <IconButton icon="arrowLeft" label="Go back" onClick={onBack} />
        ) : (
          <span className="w-2" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[19px] font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="truncate text-[13px] text-ink-muted">{subtitle}</p>}
        </div>
        {right && <div className="pr-2">{right}</div>}
      </div>
    </header>
  )
}

export function Section({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`px-5 pt-7 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-end justify-between gap-3">
          {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-white shadow-card ${className}`}>{children}</div>
}

/** Card that can be tapped. */
export function CardButton({ children, onClick, className = '', label }: { children: ReactNode; onClick: () => void; className?: string; label?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`rounded-xl border border-line bg-white text-left shadow-card transition-colors hover:border-line-strong active:bg-mist-50 ${className}`}
    >
      {children}
    </button>
  )
}

/** Small square icon holder used inside cards and rows. */
export function IconTile({ icon, tone = 'mist' }: { icon: IconName; tone?: 'mist' | 'navy' | 'accent' }) {
  const tones = {
    mist: 'bg-mist-50 text-navy-700 ring-1 ring-inset ring-mist-100',
    navy: 'bg-navy-900 text-white',
    accent: 'bg-accent-soft text-accent',
  }
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
      <Icon name={icon} className="h-[18px] w-[18px]" />
    </span>
  )
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-9 w-9 text-[12px]', md: 'h-10 w-10 text-[13px]', lg: 'h-16 w-16 text-lg' }
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-mist-100 font-semibold text-navy-800 ring-1 ring-inset ring-mist-200 ${sizes[size]}`}>
      {initials(name)}
    </span>
  )
}

export function IconButton({ icon, label, onClick, dot }: { icon: IconName; label: string; onClick: () => void; dot?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="relative grid h-11 w-11 place-items-center rounded-full text-ink-soft hover:bg-mist-50"
    >
      <Icon name={icon} className="h-[22px] w-[22px]" />
      {dot && <span className="absolute right-[11px] top-[11px] h-2 w-2 rounded-full bg-accent ring-2 ring-canvas" />}
    </button>
  )
}

/* ---------- Lists ---------- */

export function List({ children }: { children: ReactNode }) {
  return <Card className="divide-y divide-line overflow-hidden">{children}</Card>
}

export function ListRow({
  icon,
  leading,
  title,
  subtitle,
  right,
  onClick,
}: {
  icon?: IconName
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  onClick?: () => void
}) {
  const main = (
    <>
      {leading ?? (icon && <IconTile icon={icon} />)}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink">{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-[13px] text-ink-muted">{subtitle}</span>}
      </span>
    </>
  )
  if (!onClick) {
    return (
      <div className="flex min-h-16 w-full items-center gap-3 px-4 py-3">
        {main}
        {right}
      </div>
    )
  }
  // Tappable row. A trailing action (e.g. download) stays a separate button.
  return (
    <div className="flex min-h-16 w-full items-center hover:bg-mist-50/60">
      <button onClick={onClick} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 text-left active:bg-mist-50">
        {main}
        {!right && <Icon name="chevronRight" className="mr-2 h-[18px] w-[18px] shrink-0 text-ink-muted/70" />}
      </button>
      {right && <div className="flex shrink-0 items-center pr-3">{right}</div>}
    </div>
  )
}

/** Label on the left, value on the right (profile and summary rows). */
export function DetailRow({ icon, label, value }: { icon?: IconName; label: string; value: string }) {
  return (
    <div className="flex min-h-13 items-center gap-3 px-4 py-3">
      {icon && <Icon name={icon} className="h-[18px] w-[18px] shrink-0 text-mist-500" />}
      <span className="text-[14px] text-ink-muted">{label}</span>
      {value ? (
        <span className="ml-auto truncate pl-3 text-right text-[14px] font-medium text-ink">{value}</span>
      ) : (
        <span className="ml-auto pl-3 text-right text-[13px] text-ink-muted">Not on file yet</span>
      )}
    </div>
  )
}

/* ---------- Status, notices, empty and loading states ---------- */

type BadgeStatus = Status | 'Active' | 'Inactive' | 'Available' | 'Not issued'

export function StatusBadge({ status }: { status: BadgeStatus }) {
  const styles: Record<BadgeStatus, { box: string; dot: string }> = {
    Pending: { box: 'bg-warn-soft text-warn', dot: 'bg-warn' },
    Approved: { box: 'bg-ok-soft text-ok', dot: 'bg-ok' },
    Active: { box: 'bg-ok-soft text-ok', dot: 'bg-ok' },
    Available: { box: 'bg-ok-soft text-ok', dot: 'bg-ok' },
    Rejected: { box: 'bg-bad-soft text-bad', dot: 'bg-bad' },
    Inactive: { box: 'bg-mist-50 text-ink-muted', dot: 'bg-ink-muted' },
    'Not issued': { box: 'bg-mist-50 text-ink-muted', dot: 'bg-mist-300' },
  }
  const s = styles[status]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium leading-none ${s.box}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  )
}

export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md bg-mist-50 px-2 py-1 text-[12px] font-medium leading-none text-navy-700 ring-1 ring-inset ring-mist-100">
      {children}
    </span>
  )
}

/** Explains a feature that arrives in a later phase. */
export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'bad' }) {
  const styles = tone === 'bad' ? 'border-bad/15 bg-bad-soft text-bad' : 'border-mist-100 bg-mist-50 text-navy-800'
  return (
    <div className={`flex gap-2.5 rounded-lg border px-3.5 py-3 text-[13px] leading-relaxed ${styles}`}>
      <Icon name={tone === 'bad' ? 'alert' : 'info'} className="mt-px h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

export function EmptyState({ icon, title, message }: { icon: IconName; title: string; message: string }) {
  return (
    <Card className="flex flex-col items-center px-6 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-mist-50 text-mist-500 ring-1 ring-inset ring-mist-100">
        <Icon name={icon} className="h-[22px] w-[22px]" />
      </span>
      <p className="mt-3 text-[15px] font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-64 text-[13px] text-ink-muted">{message}</p>
    </Card>
  )
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`} aria-hidden="true" />
}

/* ---------- Buttons and inputs ---------- */

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'onDark'
  size?: 'sm' | 'md' | 'lg'
  type?: 'button' | 'submit'
  disabled?: boolean
  className?: string
}) {
  const variants = {
    primary: 'bg-navy-900 text-white hover:bg-navy-800 active:bg-navy-950',
    secondary: 'bg-white text-navy-900 ring-1 ring-inset ring-line-strong hover:bg-mist-50',
    danger: 'bg-white text-bad ring-1 ring-inset ring-bad/25 hover:bg-bad-soft',
    ghost: 'text-navy-700 hover:bg-mist-50',
    onDark: 'bg-white text-navy-900 hover:bg-mist-50',
  }
  const sizes = { sm: 'h-10 px-3.5 text-[14px]', md: 'h-11 px-4 text-[14px]', lg: 'h-12 px-5 text-[15px]' }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; count?: number }[]
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div className="flex rounded-lg bg-mist-100/70 p-1" role="tablist">
      {options.map((o) => {
        const on = value === o.id
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-md text-[14px] font-medium transition-colors ${
              on ? 'bg-white text-navy-900 shadow-card' : 'text-ink-muted'
            }`}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={`tnum rounded px-1.5 text-[12px] ${on ? 'bg-navy-900 text-white' : 'bg-white/70 text-ink-muted'}`}>{o.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function FilterChips<T extends string>({ options, value, onChange }: { options: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium ring-1 ring-inset transition-colors ${
            value === o ? 'bg-navy-900 text-white ring-navy-900' : 'bg-white text-ink-soft ring-line-strong hover:bg-mist-50'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center text-ink-muted">
        <Icon name="search" className="h-[18px] w-[18px]" />
      </span>
      <span className="sr-only">{placeholder}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border border-line-strong bg-white pl-10 pr-4 text-[14px] text-ink outline-none placeholder:text-ink-muted/80 focus:border-mist-500 focus:ring-4 focus:ring-mist-100"
      />
    </label>
  )
}

export function ProgressBar({ value, max, tone = 'navy' }: { value: number; max: number; tone?: 'navy' | 'accent' | 'light' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  const tones = {
    navy: ['bg-mist-100', 'bg-navy-700'],
    accent: ['bg-mist-100', 'bg-accent'],
    light: ['bg-white/15', 'bg-white'],
  }
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full ${tones[tone][0]}`} role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={`h-full rounded-full ${tones[tone][1]}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

/* ---------- Bottom navigation ---------- */

export function BottomNav<T extends string>({
  items,
  active,
  onChange,
}: {
  items: { id: T; label: string; icon: IconName; badge?: number }[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const on = item.id === active
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              aria-current={on ? 'page' : undefined}
              className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[12px] ${
                on ? 'font-semibold text-navy-900' : 'font-medium text-ink-muted'
              }`}
            >
              {on && <span className="absolute top-0 h-0.5 w-8 rounded-b bg-navy-900" />}
              <span className="relative">
                <Icon name={item.icon} className="h-[22px] w-[22px]" />
                {!!item.badge && (
                  <span className="tnum absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-navy-900 px-1 text-[10px] font-semibold text-white ring-2 ring-white">
                    {item.badge}
                  </span>
                )}
              </span>
              {item.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

/* ---------- Toast (short message at the bottom) ---------- */

type ToastTone = 'info' | 'success' | 'error'

export function useToast() {
  const [state, setState] = useState<{ text: string; tone: ToastTone } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((text: string, tone: ToastTone = 'info') => {
    window.clearTimeout(timer.current)
    setState({ text, tone })
    timer.current = window.setTimeout(() => setState(null), 2800)
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const icon: Record<ToastTone, IconName> = { info: 'info', success: 'checkCircle', error: 'alert' }
  const iconColor: Record<ToastTone, string> = { info: 'text-mist-300', success: 'text-emerald-300', error: 'text-red-300' }
  const toast = state ? (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 mx-auto flex w-full max-w-md justify-center px-5">
      <div role="status" className="flex items-start gap-2.5 rounded-lg bg-navy-950 px-4 py-3 text-[13px] text-white shadow-raised">
        <Icon name={icon[state.tone]} className={`mt-px h-4 w-4 shrink-0 ${iconColor[state.tone]}`} />
        {state.text}
      </div>
    </div>
  ) : null
  return { show, toast }
}
