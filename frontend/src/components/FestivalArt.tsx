// Festive drawings for the Home Holidays card, one small animated scene per
// festival theme (lib/festivals). Inline SVG and CSS loops only (index.css,
// "fx-" classes), no images; hidden from screen readers; still when the phone
// asks for reduced motion. Animated parts never carry a transform attribute
// themselves (CSS would replace it), so they sit inside a positioned <g>.
import type { CSSProperties, ReactNode } from 'react'
import type { FestivalTheme } from '../lib/festivals'

/** The scene for a theme: an optional full-card layer (snow, confetti) and a corner drawing. */
export default function FestivalArt({ theme, animate = true }: { theme: FestivalTheme; animate?: boolean }) {
  const scene = SCENES[theme] ?? SCENES.generic
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${animate ? '' : 'fx-still'}`}>
      {animate && scene.layer}
      <svg viewBox="0 0 120 100" className="absolute bottom-0 right-0 h-[92px] w-[110px]" fill="none">
        {scene.corner}
      </svg>
    </span>
  )
}

/** Card tint behind each theme: cool for winter and night scenes, warm otherwise. */
export function festivalTint(theme: FestivalTheme): 'gold' | 'lavender' | 'blue' {
  if (theme === 'christmas' || theme === 'national' || theme === 'gandhi' || theme === 'dove') return 'blue'
  if (theme === 'eid' || theme === 'newyear' || theme === 'lotus' || theme === 'janmashtami' || theme === 'calm') return 'lavender'
  return 'gold'
}

/* ---------- Pieces shared by several scenes ---------- */

const delay = (s: number, extra?: CSSProperties): CSSProperties => ({ animationDelay: `${s}s`, ...extra })

/** Things drifting down across the whole card (snowflakes, confetti). */
function Falling({ colors, count = 14, round = true }: { colors: string[]; count?: number; round?: boolean }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        // Spread out evenly with a little variation; negative delays start them mid-fall.
        const left = ((i * 37) % 100) + 2
        const size = 4 + (i % 3) * 1.5
        const style: CSSProperties & Record<'--drift', string> = {
          left: `${left}%`,
          width: size,
          height: round ? size : size * 1.6,
          background: colors[i % colors.length],
          animationDuration: `${5 + (i % 5)}s`,
          animationDelay: `${-((i * 0.9) % 6)}s`,
          '--drift': `${(i % 2 ? 1 : -1) * (6 + (i % 4) * 4)}px`,
        }
        return <span key={i} className={`fx-fall absolute top-0 ${round ? 'rounded-full' : 'rounded-[1px]'} opacity-80`} style={style} />
      })}
    </>
  )
}

function Sparkle({ x, y, size = 1, color = '#f6b73c', at = 0 }: { x: number; y: number; size?: number; color?: string; at?: number }) {
  const s = 5 * size
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        className="fx fx-twinkle"
        style={delay(at)}
        d={`M0 ${-s} L${s * 0.3} ${-s * 0.3} L${s} 0 L${s * 0.3} ${s * 0.3} L0 ${s} L${-s * 0.3} ${s * 0.3} L${-s} 0 L${-s * 0.3} ${-s * 0.3}Z`}
        fill={color}
      />
    </g>
  )
}

function Cloud({ x, y, color = '#dfe8fb' }: { x: number; y: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 10a7 7 0 0 1 6-8 9 9 0 0 1 16-1 6 6 0 0 1 4 11H3a4 4 0 0 1-3-2z" fill={color} />
    </g>
  )
}

function Marigold({ x, y, r = 4, at = 0 }: { x: number; y: number; r?: number; at?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="fx fx-pulse" style={delay(at)}>
        <circle r={r} fill="#f59e2b" />
        <circle r={r * 0.55} fill="#fbbf3a" />
      </g>
    </g>
  )
}

/* ---------- Scenes ---------- */

const SCENES: Record<FestivalTheme, { layer?: ReactNode; corner: ReactNode }> = {
  // Snow falling over the card, a little tree with a twinkling star and a cute Santa.
  christmas: {
    layer: <Falling colors={['#b9d3f3', '#cfe0f7', '#a9c6ee']} />,
    corner: (
      <>
        <path d="M0 100 C30 88 80 86 120 94 V100Z" fill="#e6effb" />
        <g transform="translate(22 50)">
          <path d="M14 0 L28 22 H20 L30 38 H-2 L8 22 H0Z" fill="#3fae78" />
          <rect x="11" y="38" width="6" height="7" rx="1" fill="#9a6b45" />
          <circle cx="8" cy="30" r="2" fill="#ee6863" />
          <circle cx="20" cy="24" r="2" fill="#f5b53f" />
          <circle cx="14" cy="14" r="1.8" fill="#8fb0fa" />
        </g>
        <Sparkle x={36} y={47} size={1.1} color="#f5b53f" />
        <g transform="translate(58 34)">
          <g className="fx fx-bob">
            {/* hat */}
            <path d="M8 20 C10 4 26 -2 40 6 L46 16 L38 20Z" fill="#e04848" />
            <circle cx="47" cy="17" r="5" fill="#fff" />
            <rect x="4" y="17" width="38" height="8" rx="4" fill="#fff" />
            {/* face, beard and smile */}
            <circle cx="23" cy="34" r="12" fill="#f8d6bd" />
            <path d="M9 34 C10 52 36 52 37 34 C33 42 13 42 9 34Z" fill="#fff" />
            <path d="M16 38 C19 35 22 36 23 38 C24 36 27 35 30 38 C27 40 25 40 23 39 C21 40 19 40 16 38Z" fill="#fff" stroke="#e6ecf5" strokeWidth="0.6" />
            <circle cx="18.5" cy="31" r="1.6" fill="#3a2a2a" />
            <circle cx="27.5" cy="31" r="1.6" fill="#3a2a2a" />
            <circle cx="15" cy="35" r="2.2" fill="#f4a3a3" fillOpacity="0.7" />
            <circle cx="31" cy="35" r="2.2" fill="#f4a3a3" fillOpacity="0.7" />
            <circle cx="23" cy="35.5" r="2.3" fill="#e98a7a" />
          </g>
        </g>
      </>
    ),
  },

  // A diya whose flame flickers, with twinkling sparkles.
  diwali: {
    corner: (
      <>
        <ellipse cx="86" cy="62" rx="34" ry="30" fill="#ffd38a" fillOpacity="0.35" />
        <g transform="translate(84 48)">
          <path className="fx fx-bottom fx-flicker" d="M0 -20c-6 8-8 14-8 18a8 8 0 0 0 16 0c0-4-2-10-8-18z" fill="#f7b538" />
        </g>
        <g transform="translate(84 48)">
          <path className="fx fx-bottom fx-flicker" style={delay(0.3)} d="M0 -10c-2.5 3.5-3.4 6-3.4 7.6a3.4 3.4 0 0 0 6.8 0c0-1.6-.9-4.1-3.4-7.6z" fill="#fff3c4" />
        </g>
        <path d="M58 60h52c-2 14-12 22-26 22s-24-8-26-22z" fill="#e0773e" />
        <path d="M58 60h52c-.4 3-1.2 5-2.2 7H60.2c-1-2-1.8-4-2.2-7z" fill="#c95d2c" />
        <Sparkle x={106} y={22} size={1.1} />
        <Sparkle x={62} y={34} size={0.7} at={0.8} />
        <Sparkle x={112} y={50} size={0.6} at={1.5} />
        <Cloud x={20} y={86} />
      </>
    ),
  },

  // Colour powder bursting and specks of colour floating up.
  holi: {
    corner: (
      <>
        {[
          { x: 70, y: 66, r: 20, c: '#f472b6', at: 0 },
          { x: 98, y: 54, r: 16, c: '#facc15', at: 0.6 },
          { x: 96, y: 82, r: 16, c: '#34d399', at: 1.2 },
          { x: 50, y: 86, r: 12, c: '#60a5fa', at: 1.8 },
        ].map((b) => (
          <g key={b.c} transform={`translate(${b.x} ${b.y})`}>
            <circle className="fx fx-pulse" style={delay(b.at)} r={b.r} fill={b.c} fillOpacity="0.55" />
          </g>
        ))}
        {['#f472b6', '#facc15', '#34d399', '#60a5fa', '#a78bfa'].map((c, i) => (
          <g key={c} transform={`translate(${56 + i * 12} ${60 - (i % 2) * 8})`}>
            <circle className="fx fx-rise" style={delay(i * 0.6)} r="2.2" fill={c} />
          </g>
        ))}
      </>
    ),
  },

  // A crescent moon and stars, with a lantern swinging gently.
  eid: {
    corner: (
      <>
        <path d="M78 18a22 22 0 1 0 22 30 18 18 0 1 1-22-30z" fill="#f3c96b" />
        <Sparkle x={104} y={20} size={1} color="#f3c96b" />
        <Sparkle x={58} y={30} size={0.7} color="#f3c96b" at={1} />
        <g transform="translate(40 0)">
          <g className="fx fx-top fx-sway">
            <line x1="10" y1="0" x2="10" y2="44" stroke="#b9a6f2" strokeWidth="1.5" />
            <path d="M3 48h14l-2-4H5z" fill="#6447c0" />
            <rect x="2" y="48" width="16" height="22" rx="4" fill="#7c5fd6" />
            <rect x="6" y="52" width="8" height="14" rx="3" fill="#ffe08a" />
            <path d="M3 70h14l-3 4H6z" fill="#6447c0" />
          </g>
        </g>
      </>
    ),
  },

  // A kite swaying in the breeze (Sankranti, Pongal, Lohri, Bihu, Baisakhi).
  harvest: {
    corner: (
      <>
        <path d="M30 100 C46 84 58 74 76 52" stroke="#c7b07a" strokeWidth="1.2" />
        <g transform="translate(62 14)">
          <g className="fx fx-bottom fx-sway">
            <path d="M18 0 L36 22 L18 44 L0 22Z" fill="#f472b6" />
            <path d="M18 0 L36 22 L18 22Z" fill="#facc15" />
            <path d="M18 22 L18 44 L0 22Z" fill="#fb923c" />
            <path d="M18 0V44M0 22H36" stroke="#fff" strokeOpacity="0.7" strokeWidth="1" />
            <path d="M18 44 C14 52 22 56 16 64" stroke="#e0773e" strokeWidth="1.2" />
            <path d="M12 52l6 2-6 3zM14 60l6 2-6 3z" fill="#34d399" />
          </g>
        </g>
        <Sparkle x={106} y={70} size={0.7} at={0.6} />
      </>
    ),
  },

  // Modaks on a plate under a swaying marigold garland (Ganesh Chaturthi).
  ganesh: {
    corner: (
      <>
        <g transform="translate(46 8)">
          <g className="fx fx-top fx-sway">
            <path d="M0 0 C20 22 52 22 72 0" stroke="#3fae78" strokeWidth="1.2" />
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const t = (i + 0.5) / 6
              const x = 72 * t
              const y = 4 * 22 * t * (1 - t) * 0.82 + 1
              return <circle key={i} cx={x} cy={y} r="4.2" fill={i % 2 ? '#fbbf3a' : '#f59e2b'} />
            })}
          </g>
        </g>
        <ellipse cx="84" cy="88" rx="32" ry="7" fill="#e0b25c" />
        {[66, 84, 102].map((x, i) => (
          <g key={x} transform={`translate(${x} ${i === 1 ? 70 : 76})`}>
            <g className="fx fx-bob" style={delay(i * 0.4)}>
              <path d="M0 -14 C6 -6 10 0 10 6 a10 6 0 0 1 -20 0 C-10 0 -6 -6 0 -14z" fill="#f8e6bd" stroke="#d9b26a" />
              <path d="M0 -14V10M0 -14C-4 -4 -6 2 -6 10M0 -14C4 -4 6 2 6 10" stroke="#d9b26a" strokeWidth="0.8" />
            </g>
          </g>
        ))}
      </>
    ),
  },

  // Two dandiya sticks clinking, with marigolds (Dasara, Navratri, Durga Puja).
  dasara: {
    corner: (
      <>
        <g transform="translate(70 30)">
          <g className="fx fx-bottom fx-clink">
            <rect x="-2" y="0" width="5" height="52" rx="2.5" fill="#e0773e" />
            <path d="M-2 6h5M-2 14h5M-2 22h5" stroke="#facc15" strokeWidth="2" />
            <circle cx="0.5" cy="-2" r="4" fill="#f472b6" />
          </g>
        </g>
        <g transform="translate(92 30)">
          <g className="fx fx-bottom fx-clink" style={{ animationDirection: 'reverse' }}>
            <rect x="-2" y="0" width="5" height="52" rx="2.5" fill="#6447c0" />
            <path d="M-2 6h5M-2 14h5M-2 22h5" stroke="#34d399" strokeWidth="2" />
            <circle cx="0.5" cy="-2" r="4" fill="#facc15" />
          </g>
        </g>
        <Sparkle x={81} y={22} size={0.9} />
        <Marigold x={48} y={86} r={5} />
        <Marigold x={60} y={92} r={4} at={0.5} />
        <Marigold x={110} y={88} r={5} at={1} />
      </>
    ),
  },

  // The national flag waving (Independence Day, Republic Day, state days).
  national: {
    corner: (
      <>
        <rect x="56" y="18" width="2.6" height="74" rx="1.3" fill="#8a94a8" />
        <circle cx="57.3" cy="17" r="2.6" fill="#f5b53f" />
        <g transform="translate(58.6 20)">
          <g className="fx fx-left fx-wave">
            <rect width="46" height="10" fill="#ff9933" />
            <rect y="10" width="46" height="10" fill="#ffffff" stroke="#e8edf5" strokeWidth="0.5" />
            <rect y="20" width="46" height="10" fill="#138808" />
            <circle cx="23" cy="15" r="3.6" stroke="#000080" strokeWidth="1" />
            <circle cx="23" cy="15" r="0.8" fill="#000080" />
          </g>
        </g>
        <ellipse cx="57" cy="94" rx="18" ry="4" fill="#dbe4f3" />
        <Sparkle x={106} y={64} size={0.7} color="#ff9933" />
        <Sparkle x={96} y={78} size={0.6} color="#138808" at={1} />
      </>
    ),
  },

  // A charkha whose wheel spins slowly (Gandhi Jayanti).
  gandhi: {
    corner: (
      <>
        <rect x="44" y="86" width="70" height="5" rx="2.5" fill="#b78a5a" />
        <path d="M70 86 L78 62 L86 86" stroke="#9a6b45" strokeWidth="3" strokeLinecap="round" />
        <g transform="translate(78 58)">
          <g className="fx fx-spin">
            <circle r="22" stroke="#9a6b45" strokeWidth="3" />
            {[0, 30, 60, 90, 120, 150].map((a) => (
              <line key={a} x1={-22 * Math.cos((a * Math.PI) / 180)} y1={-22 * Math.sin((a * Math.PI) / 180)} x2={22 * Math.cos((a * Math.PI) / 180)} y2={22 * Math.sin((a * Math.PI) / 180)} stroke="#b78a5a" strokeWidth="1.4" />
            ))}
            <circle r="3" fill="#9a6b45" />
          </g>
        </g>
        <path d="M100 58 C110 62 112 74 110 86" stroke="#e8dcc8" strokeWidth="1.2" />
      </>
    ),
  },

  // A flower pookalam turning slowly (Onam).
  onam: {
    corner: (
      <>
        <g transform="translate(84 66)">
          <g className="fx fx-spin-slow">
            {Array.from({ length: 12 }, (_, i) => {
              const a = (i * Math.PI) / 6
              return <ellipse key={i} cx={Math.cos(a) * 28} cy={Math.sin(a) * 28} rx="6" ry="3.5" transform={`rotate(${i * 30} ${Math.cos(a) * 28} ${Math.sin(a) * 28})`} fill="#3fae78" />
            })}
            <circle r="26" fill="#f59e2b" />
            <circle r="19" fill="#facc15" />
            <circle r="12" fill="#e0533b" />
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i * Math.PI) / 4
              return <circle key={i} cx={Math.cos(a) * 16} cy={Math.sin(a) * 16} r="2.4" fill="#fff" />
            })}
            <circle r="5" fill="#fff7e0" />
          </g>
        </g>
      </>
    ),
  },

  // A rakhi on its thread, its flower gently pulsing (Raksha Bandhan).
  rakhi: {
    corner: (
      <>
        <path d="M30 70 C50 60 70 60 84 64 C98 68 108 66 120 60" stroke="#e0533b" strokeWidth="2.4" />
        <g transform="translate(84 64)">
          <g className="fx fx-pulse">
            {Array.from({ length: 8 }, (_, i) => {
              const a = (i * Math.PI) / 4
              return <circle key={i} cx={Math.cos(a) * 11} cy={Math.sin(a) * 11} r="6" fill={i % 2 ? '#f472b6' : '#facc15'} />
            })}
            <circle r="9" fill="#e0533b" />
            <circle r="4.5" fill="#fde68a" />
          </g>
        </g>
        <Sparkle x={58} y={44} size={0.8} at={0.4} />
        <Sparkle x={110} y={40} size={0.7} at={1.2} />
      </>
    ),
  },

  // A mango-leaf toran swaying over a small kalash (Ugadi, Gudi Padwa, regional new years).
  'newyear-regional': {
    corner: (
      <>
        <path d="M40 8 C60 18 96 18 120 8" stroke="#9a6b45" strokeWidth="1.4" />
        {[48, 60, 72, 84, 96, 108].map((x, i) => (
          <g key={x} transform={`translate(${x} ${12 + Math.sin(((x - 40) / 80) * Math.PI) * 4})`}>
            <path className="fx fx-top fx-sway" style={delay(i * 0.25)} d="M0 0 C5 6 5 14 0 20 C-5 14 -5 6 0 0Z" fill={i % 2 ? '#3fae78' : '#58c48c'} />
          </g>
        ))}
        <path d="M72 66 h26 l-3 22 h-20z" fill="#e0b25c" />
        <ellipse cx="85" cy="66" rx="15" ry="4" fill="#c9963e" />
        <path d="M78 64 C80 54 84 50 85 46 C86 50 90 54 92 64" fill="#3fae78" />
        <circle cx="85" cy="58" r="5" fill="#a3542f" />
      </>
    ),
  },

  // A flute and a swaying peacock feather (Janmashtami).
  janmashtami: {
    corner: (
      <>
        <g transform="translate(92 22)">
          <g className="fx fx-bottom fx-sway">
            <path d="M0 0 C-2 20 0 40 2 60" stroke="#3fae78" strokeWidth="1.6" />
            <ellipse cx="0" cy="8" rx="11" ry="15" fill="#34d399" fillOpacity="0.55" />
            <ellipse cx="0" cy="8" rx="7" ry="9.5" fill="#0ea5e9" />
            <ellipse cx="0" cy="9" rx="4" ry="5.5" fill="#1e3a8a" />
            <circle cx="0" cy="9" r="1.8" fill="#facc15" />
          </g>
        </g>
        <g transform="rotate(-14 70 78)">
          <rect x="34" y="74" width="72" height="7" rx="3.5" fill="#b78a5a" />
          {[48, 58, 68, 78, 88].map((x) => (
            <circle key={x} cx={x} cy="77.5" r="1.4" fill="#6b4a2c" />
          ))}
          <rect x="40" y="74" width="4" height="7" fill="#f5b53f" />
        </g>
        <Sparkle x={60} y={40} size={0.7} at={0.7} />
      </>
    ),
  },

  // A lotus on still water, bobbing gently (Buddha Purnima, Mahavir Jayanti).
  lotus: {
    corner: (
      <>
        <ellipse cx="84" cy="88" rx="34" ry="6" fill="#c9d8f5" fillOpacity="0.8" />
        <g transform="translate(84 70)">
          <g className="fx fx-bob">
            <path d="M0 14 C-8 4 -8 -8 0 -18 C8 -8 8 4 0 14Z" fill="#f9a8d4" />
            <path d="M0 14 C-16 10 -22 0 -20 -10 C-10 -6 -4 2 0 14Z" fill="#f472b6" />
            <path d="M0 14 C16 10 22 0 20 -10 C10 -6 4 2 0 14Z" fill="#f472b6" />
            <path d="M-4 14 C-22 16 -30 8 -32 2 C-20 2 -10 6 -4 14Z" fill="#fbcfe8" />
            <path d="M4 14 C22 16 30 8 32 2 C20 2 10 6 4 14Z" fill="#fbcfe8" />
          </g>
        </g>
        <Sparkle x={108} y={28} size={0.8} color="#f3c96b" />
        <Sparkle x={58} y={36} size={0.6} color="#f3c96b" at={1.1} />
      </>
    ),
  },

  // A dove with an olive twig, gently gliding (Good Friday, Easter).
  dove: {
    corner: (
      <>
        <g transform="translate(44 44)">
          <g className="fx fx-bob">
            <path d="M8 22 C18 10 34 8 44 16 C50 14 54 16 56 20 C50 20 48 22 46 26 C40 38 22 40 8 22Z" fill="#ffffff" stroke="#c7d3ea" />
            <path d="M24 18 C22 4 30 -6 42 -8 C40 4 36 12 30 18Z" fill="#eef3fb" stroke="#c7d3ea" />
            <circle cx="49" cy="18" r="1.3" fill="#3a4660" />
            <path d="M56 20 C62 22 66 26 68 30" stroke="#3fae78" strokeWidth="1.4" />
            <ellipse cx="63" cy="23" rx="3" ry="1.6" fill="#58c48c" />
            <ellipse cx="66" cy="27.5" rx="3" ry="1.6" fill="#58c48c" />
          </g>
        </g>
        <Cloud x={20} y={84} />
      </>
    ),
  },

  // A quiet night sky with softly twinkling stars (days of remembrance).
  calm: {
    corner: (
      <>
        <path d="M84 24a18 18 0 1 0 18 24 14 14 0 1 1-18-24z" fill="#c9d4ee" />
        <Sparkle x={58} y={30} size={0.6} color="#b9a6f2" />
        <Sparkle x={108} y={70} size={0.7} color="#b9a6f2" at={1.2} />
      </>
    ),
  },

  // Fireworks bursting (New Year).
  newyear: {
    corner: (
      <>
        {[
          { x: 80, y: 40, c: '#f472b6', at: 0 },
          { x: 104, y: 64, c: '#facc15', at: 0.9 },
          { x: 60, y: 70, c: '#60a5fa', at: 1.7 },
        ].map((f) => (
          <g key={f.c} transform={`translate(${f.x} ${f.y})`}>
            <g className="fx fx-burst" style={delay(f.at)}>
              {Array.from({ length: 10 }, (_, i) => {
                const a = (i * Math.PI) / 5
                return <line key={i} x1={Math.cos(a) * 5} y1={Math.sin(a) * 5} x2={Math.cos(a) * 15} y2={Math.sin(a) * 15} stroke={f.c} strokeWidth="2" strokeLinecap="round" />
              })}
              <circle r="2.2" fill={f.c} />
            </g>
          </g>
        ))}
      </>
    ),
  },

  // Any other holiday: gentle confetti and twinkling stars.
  generic: {
    layer: <Falling colors={['#f472b6', '#facc15', '#60a5fa', '#34d399', '#a78bfa']} count={10} round={false} />,
    corner: (
      <>
        <Sparkle x={86} y={46} size={1.6} />
        <Sparkle x={106} y={74} size={1} color="#f472b6" at={0.8} />
        <Sparkle x={64} y={74} size={0.9} color="#60a5fa" at={1.6} />
        <Cloud x={20} y={86} />
      </>
    ),
  },
}
