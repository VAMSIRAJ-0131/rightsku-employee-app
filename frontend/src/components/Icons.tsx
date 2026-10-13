// Built-in line icon set: one stroke weight, one grid (24px), no extra library.

export type IconName =
  | 'home' | 'clock' | 'calendar' | 'wallet' | 'folder' | 'file' | 'bell' | 'user' | 'users'
  | 'list' | 'logout' | 'check' | 'x' | 'upload' | 'download' | 'shield' | 'chart'
  | 'chevronRight' | 'arrowLeft' | 'eye' | 'eyeOff' | 'search' | 'plus' | 'info' | 'alert'
  | 'inbox' | 'mail' | 'phone' | 'pin' | 'briefcase' | 'lock' | 'receipt' | 'checkCircle'

const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`

const paths: Record<IconName, string[]> = {
  home: ['M4 10.2 12 4l8 6.2V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z'],
  clock: [circle(12, 12, 8.25), 'M12 7.75V12l2.75 1.75'],
  calendar: ['M4.75 6.5h14.5v13H4.75z', 'M4.75 10.25h14.5', 'M8.5 4v4', 'M15.5 4v4'],
  wallet: ['M4.75 7.5h14.5v11.75H4.75z', 'M7 7.5V5.25h10V7.5', 'M15 13.5h1.75'],
  folder: ['M4.25 7a1 1 0 0 1 1-1h4.25l1.75 2h7.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H5.25a1 1 0 0 1-1-1z'],
  file: ['M7 3.75h7l4 4V20.25H7z', 'M14 3.75v4h4', 'M9.75 12.5h5.5', 'M9.75 16h5.5'],
  bell: ['M6.5 15.5V11a5.5 5.5 0 0 1 11 0v4.5l1.5 1.75H5z', 'M10.25 20h3.5'],
  user: [circle(12, 8.5, 3.5), 'M5.25 19.75a6.75 6.75 0 0 1 13.5 0'],
  users: [circle(9.5, 8.5, 3.25), 'M3.75 19.5a5.75 5.75 0 0 1 11.5 0', 'M15.5 5.5a3.25 3.25 0 0 1 0 6.25', 'M17.5 14a5.5 5.5 0 0 1 3 5.5'],
  list: ['M9 7h11', 'M9 12h11', 'M9 17h11', 'M4.5 7h.01', 'M4.5 12h.01', 'M4.5 17h.01'],
  logout: ['M14.5 4.75h4a1 1 0 0 1 1 1v12.5a1 1 0 0 1-1 1h-4', 'M10 16.25 5.75 12 10 7.75', 'M5.75 12h10'],
  check: ['M5.5 12.5l4 4 9-9'],
  x: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
  upload: ['M12 15.25V4.75', 'M7.75 9 12 4.75 16.25 9', 'M4.75 19.25h14.5'],
  download: ['M12 4.75v10.5', 'M7.75 11 12 15.25 16.25 11', 'M4.75 19.25h14.5'],
  shield: ['M12 3.75 18.75 6.5v5.25c0 4.25-2.9 7-6.75 8.5-3.85-1.5-6.75-4.25-6.75-8.5V6.5z', 'M9.25 12l2 2 3.5-3.75'],
  chart: ['M5.5 19.25v-7', 'M12 19.25V5.5', 'M18.5 19.25v-4.5', 'M3.75 19.25h16.5'],
  chevronRight: ['M9.75 6.5 15.25 12l-5.5 5.5'],
  arrowLeft: ['M14.5 5.75 8.25 12l6.25 6.25'],
  eye: ['M2.75 12S6.25 5.75 12 5.75 21.25 12 21.25 12 17.75 18.25 12 18.25 2.75 12 2.75 12z', circle(12, 12, 2.75)],
  eyeOff: ['M2.75 12S6.25 5.75 12 5.75 21.25 12 21.25 12 17.75 18.25 12 18.25 2.75 12 2.75 12z', circle(12, 12, 2.75), 'M4 4l16 16'],
  search: [circle(11, 11, 6.25), 'M19.25 19.25l-3.75-3.75'],
  plus: ['M12 5.75v12.5', 'M5.75 12h12.5'],
  info: [circle(12, 12, 8.25), 'M12 11v5', 'M12 8h.01'],
  alert: [circle(12, 12, 8.25), 'M12 7.75v5.5', 'M12 16.25h.01'],
  inbox: ['M4.75 13.5 7 5.75h10l2.25 7.75v5.75H4.75z', 'M4.75 13.5h4.5l1 2h3.5l1-2h4.5'],
  mail: ['M4.25 6.25h15.5v11.5H4.25z', 'M4.75 7 12 12.5 19.25 7'],
  phone: ['M7.5 4.25h3l1.25 4-2 1.25a9.5 9.5 0 0 0 4.75 4.75l1.25-2 4 1.25v3a1.5 1.5 0 0 1-1.5 1.5A14.75 14.75 0 0 1 6 5.75a1.5 1.5 0 0 1 1.5-1.5z'],
  pin: ['M12 20.25s-6-5.5-6-10.25a6 6 0 0 1 12 0c0 4.75-6 10.25-6 10.25z', circle(12, 10, 2.25)],
  briefcase: ['M4.25 8h15.5v11H4.25z', 'M9 8V5.25h6V8', 'M4.25 12.75h15.5'],
  lock: ['M6 10.75h12v9H6z', 'M8.75 10.75V8a3.25 3.25 0 0 1 6.5 0v2.75'],
  receipt: ['M6.25 3.75h11.5v16.5l-2.4-1.5-2.35 1.5-2.4-1.5-2.35 1.5-2-1.5z', 'M9.25 8.5h5.5', 'M9.25 12h5.5', 'M9.25 15.5h3'],
  checkCircle: [circle(12, 12, 8.25), 'M8.5 12.25l2.4 2.4 4.6-4.9'],
}

export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}
