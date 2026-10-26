// The employee's notifications as cards, newest first: unread ones under
// "New", the rest under "Earlier". Each card has an icon for its kind (green
// for approvals, red for rejections, lavender for payslips and documents...),
// the title, the message and how long ago it came. Tapping opens what it is
// about; the cross clears it from this list only.
import { Icon, type IconName } from '../../components/Icons'
import { timeAgo, type NotificationRecord } from '../../lib/notifications'

/** Icon and colours for a notification type. */
export function notificationLook(type: string): { icon: IconName; tile: string } {
  if (type.endsWith('_APPROVED')) return { icon: 'check', tile: 'bg-approved-soft text-approved-ink' }
  if (type.endsWith('_REJECTED')) return { icon: 'x', tile: 'bg-rejected-soft text-rejected-ink' }
  if (type.endsWith('_REMINDER')) return { icon: 'clock', tile: 'bg-pending-soft text-pending-ink' }
  if (type === 'PAYSLIP_PUBLISHED') return { icon: 'receipt', tile: 'bg-lavender-50 text-lavender-600' }
  if (type === 'DOCUMENT_PUBLISHED') return { icon: 'file', tile: 'bg-lavender-50 text-lavender-600' }
  if (type === 'HOLIDAYS_UPDATED' || type === 'SCHEDULE_CHANGED') return { icon: 'calendar', tile: 'bg-gold-50 text-gold-600' }
  if (type === 'LEAVE_BALANCE_UPDATED') return { icon: 'wallet', tile: 'bg-royal-50 text-royal-700' }
  return { icon: 'bell', tile: 'bg-royal-50 text-royal-700' }
}

export default function NotificationList({
  items, onOpen, onClear,
}: {
  items: NotificationRecord[]
  onOpen: (n: NotificationRecord) => void
  onClear: (n: NotificationRecord) => void
}) {
  const fresh = items.filter((n) => !n.read)
  const earlier = items.filter((n) => n.read)
  return (
    <div className="space-y-6">
      {fresh.length > 0 && <Group title="New" items={fresh} onOpen={onOpen} onClear={onClear} />}
      {earlier.length > 0 && <Group title="Earlier" items={earlier} onOpen={onOpen} onClear={onClear} />}
    </div>
  )
}

function Group({
  title, items, onOpen, onClear,
}: { title: string; items: NotificationRecord[]; onOpen: (n: NotificationRecord) => void; onClear: (n: NotificationRecord) => void }) {
  return (
    <section>
      <p className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
        {title} <span className="tnum font-medium normal-case tracking-normal">· {items.length}</span>
      </p>
      <div className="space-y-2.5">
        {items.map((n) => (
          <Item key={n.id} n={n} onOpen={onOpen} onClear={onClear} />
        ))}
      </div>
    </section>
  )
}

function Item({ n, onOpen, onClear }: { n: NotificationRecord; onOpen: (n: NotificationRecord) => void; onClear: (n: NotificationRecord) => void }) {
  const look = notificationLook(n.type)
  return (
    <div
      className={`card-surface relative flex items-start overflow-hidden rounded-[20px] border ${
        n.read ? 'border-line' : 'border-royal-100 ring-1 ring-inset ring-royal-100'
      }`}
    >
      {!n.read && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-royal-600" />}
      <button
        type="button"
        onClick={() => onOpen(n)}
        aria-label={`${n.read ? '' : 'Unread: '}${n.title}. Open`}
        className="press flex min-w-0 flex-1 gap-3.5 py-3.5 pl-4 pr-1 text-left transition-transform duration-150"
      >
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${look.tile}`}>
          <Icon name={look.icon} className="h-[22px] w-[22px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className={`text-[15px] leading-snug text-ink ${n.read ? 'font-medium' : 'font-bold'}`}>{n.title}</span>
            <span className="tnum mt-0.5 shrink-0 text-[12px] text-ink-muted">{timeAgo(n.createdAt)}</span>
          </span>
          <span className="mt-1 block text-[13.5px] leading-relaxed text-ink-soft">{n.message}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onClear(n)}
        aria-label={`Clear notification: ${n.title}`}
        className="mr-1.5 mt-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-mist-50 hover:text-ink"
      >
        <Icon name="x" className="h-4 w-4" />
      </button>
    </div>
  )
}
