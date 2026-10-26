// HR: Activity, the audit log in plain words: who did what, about whom,
// and when, newest first. Filter chips by kind; "Show more" loads older.
// Read only: nothing here can change or delete an entry.
import { useEffect, useState } from 'react'
import { Icon } from '../../components/Icons'
import { Button, Card, EmptyState, Notice, Section, Spinner, TopBar } from '../../components/ui'
import type { ApiError } from '../../lib/api'
import {
  ACTIVITY_CATEGORIES, activityDay, activityTone, getActivity, type ActivityCategory, type ActivityItem,
} from '../../lib/activity'

export default function ActivityScreen({
  token, onBack, onError,
}: {
  token: string
  onBack: () => void
  onError: (error: ApiError) => ApiError
}) {
  const [category, setCategory] = useState<ActivityCategory>('all')
  const [items, setItems] = useState<ActivityItem[] | null>(null)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setItems(null)
    setError(null)
    getActivity(token, 0, category, controller.signal).then((r) => {
      if (controller.signal.aborted) return
      if (!r.ok) return setError(onError(r.error).message)
      setItems(r.data.items)
      setPage(0)
      setHasMore(r.data.hasMore)
      setTotal(r.data.total)
    })
    return () => controller.abort()
  }, [token, category, version, onError])

  async function more() {
    if (loadingMore) return
    setLoadingMore(true)
    const r = await getActivity(token, page + 1, category)
    setLoadingMore(false)
    if (!r.ok) return setError(onError(r.error).message)
    setItems((list) => [...(list ?? []), ...r.data.items])
    setPage(r.data.page)
    setHasMore(r.data.hasMore)
  }

  // Grouped by day ("Today", "Yesterday", "Mon 19 Oct").
  const groups: { day: string; items: ActivityItem[] }[] = []
  for (const item of items ?? []) {
    const day = activityDay(item.at)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.items.push(item)
    else groups.push({ day, items: [item] })
  }

  return (
    <>
      <TopBar title="Activity" subtitle={items ? `${total} recorded actions` : 'Who did what, and when'} onBack={onBack} />
      <Section>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Kind of activity">
          {ACTIVITY_CATEGORIES.map((c) => {
            const on = c.id === category
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setCategory(c.id)}
                className={`press flex h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] font-semibold transition-transform duration-150 ${
                  on ? 'save-cta text-white' : 'bg-white text-ink-soft ring-1 ring-inset ring-line-strong'
                }`}
              >
                {c.label}
              </button>
            )
          })}
        </div>
      </Section>

      {error ? (
        <Section>
          <div role="alert" className="space-y-3">
            <Notice tone="bad">{error}</Notice>
            <Button variant="secondary" size="sm" onClick={() => setVersion((v) => v + 1)}>Try again</Button>
          </div>
        </Section>
      ) : items === null ? (
        <Section>
          <Card className="flex items-center justify-center gap-2 px-4 py-8 text-[14px] text-ink-muted"><Spinner /> Loading</Card>
        </Section>
      ) : items.length === 0 ? (
        <Section>
          <EmptyState icon="list" title="Nothing recorded yet" message="Approvals, changes to employees, documents and settings appear here." />
        </Section>
      ) : (
        <>
          {groups.map((g) => (
            <Section key={g.day} title={g.day}>
              <Card className="divide-y divide-line overflow-hidden">
                {g.items.map((item) => <ActivityRow key={item.id} item={item} />)}
              </Card>
            </Section>
          ))}
          {hasMore && (
            <Section>
              <Button variant="secondary" className="w-full" onClick={() => void more()} disabled={loadingMore}>
                {loadingMore ? <><Spinner /> Loading</> : 'Show older activity'}
              </Button>
            </Section>
          )}
        </>
      )}
    </>
  )
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const tone = activityTone(item.action)
  const tile = tone === 'approved' ? 'bg-approved-soft text-approved-ink' : tone === 'rejected' ? 'bg-rejected-soft text-rejected-ink' : 'bg-royal-50 text-royal-700'
  const time = new Date(item.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  return (
    <div className="flex gap-3 px-4 py-3">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tile}`}>
        <Icon name={tone === 'approved' ? 'check' : tone === 'rejected' ? 'x' : 'list'} className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[14px] font-semibold leading-snug text-ink">{item.label}</p>
          <span className="tnum shrink-0 text-[12px] text-ink-muted">{time}</span>
        </div>
        {item.subject && <p className="mt-0.5 text-[13px] leading-snug text-ink-soft [overflow-wrap:anywhere]">{item.subject}</p>}
        {item.detail && <p className="mt-0.5 text-[12px] text-ink-muted">{item.detail}</p>}
        <p className="mt-1 text-[12px] text-ink-muted">by {item.actor}</p>
      </div>
    </div>
  )
}
