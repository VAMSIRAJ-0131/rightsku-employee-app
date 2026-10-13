/** Turns "2026-10-12" into "12 Oct 2026". */
export function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Turns "2026-10-12" into "12 Oct". */
export function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

/** Local date as "YYYY-MM-DD". */
export function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Monday to Friday of the current week, as ISO dates. */
export function currentWorkWeek(today = new Date()): { iso: string; label: string; isToday: boolean }[] {
  const monday = new Date(today)
  const offset = (today.getDay() + 6) % 7
  monday.setDate(today.getDate() - offset)
  const todayIso = toIsoDate(today)
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((label, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const iso = toIsoDate(d)
    return { iso, label, isToday: iso === todayIso }
  })
}

export function monthLabel(d = new Date()): string {
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

export function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function firstName(name: string): string {
  return name.split(' ')[0] ?? name
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
