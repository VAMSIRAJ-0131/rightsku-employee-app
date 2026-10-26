// The Home screen's festival animation, drawn on one see-through canvas over
// the page (taps go through it). Crackers rise from the lower half and burst
// near the top; snow, petals, colours and stars drift over the whole screen.
// It pauses while the app is in the background and is off when the phone
// asks for reduced motion.
import { useEffect, useRef } from 'react'
import type { FestiveEffect } from '../lib/festiveEffects'

const PALETTES: Record<FestiveEffect, string[]> = {
  fireworks: ['#ffd166', '#ff8c42', '#ff5d8f', '#4cc9f0', '#80ed99', '#c77dff'],
  tricolor: ['#ff9933', '#ffffff', '#138808', '#ff9933', '#138808'],
  snow: ['#ffffff'],
  colors: ['#ff5d8f', '#ffd166', '#4cc9f0', '#80ed99', '#c77dff', '#ff8c42'],
  stars: ['#ffe08a', '#fff3c4', '#ffd166'],
  petals: ['#ff9f1c', '#ffbf69', '#ff6b6b', '#ffd166'],
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  /** Seconds left, and the total (for fading). */
  life: number
  max: number
  size: number
  color: string
  /** Spin / sway phase. */
  phase: number
  kind: 'rocket' | 'spark' | 'flake' | 'petal' | 'puff' | 'star'
  /** Rockets: the height where they burst. */
  burstAt?: number
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)]

export default function FestiveSky({ effect }: { effect: FestiveEffect }) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const palette = PALETTES[effect]
    let width = 0
    let height = 0
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const parts: Particle[] = []
    let spawnIn = 0

    // Starts the screen already "snowing" etc., instead of an empty first second.
    const drifting = effect === 'snow' || effect === 'petals' || effect === 'stars'
    if (drifting) {
      const count = effect === 'snow' ? 56 : effect === 'petals' ? 20 : 26
      for (let i = 0; i < count; i++) parts.push(newDrifter(true))
    }

    function newDrifter(anywhere = false): Particle {
      if (effect === 'stars') {
        return {
          x: rand(0, width), y: rand(0, height * 0.55), vx: 0, vy: 0, life: rand(1.5, 4), max: 4,
          size: rand(1.5, 3.4), color: pick(palette), phase: rand(0, Math.PI * 2), kind: 'star',
        }
      }
      const snow = effect === 'snow'
      return {
        x: rand(0, width),
        y: anywhere ? rand(-20, height) : rand(-40, -10),
        vx: rand(-8, 8),
        vy: snow ? rand(28, 62) : rand(34, 58),
        life: 99, max: 99,
        size: snow ? rand(1.6, 3.8) : rand(4, 7),
        color: pick(palette),
        phase: rand(0, Math.PI * 2),
        kind: snow ? 'flake' : 'petal',
      }
    }

    function launchRocket() {
      parts.push({
        x: rand(width * 0.12, width * 0.88), y: height * rand(0.55, 0.7),
        vx: rand(-14, 14), vy: rand(-420, -340), life: 3, max: 3, size: 2.2,
        color: pick(palette), phase: 0, kind: 'rocket', burstAt: height * rand(0.1, 0.3),
      })
    }

    function burst(x: number, y: number, color: string) {
      const n = 58
      const multi = effect === 'tricolor' || Math.random() < 0.3
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2 + rand(-0.05, 0.05)
        const speed = rand(85, 195)
        const life = rand(1.3, 2)
        parts.push({
          x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, max: life,
          size: rand(1.8, 3), color: multi ? pick(palette) : color, phase: 0, kind: 'spark',
        })
      }
    }

    function puff() {
      const x = rand(width * 0.1, width * 0.9)
      const y = rand(height * 0.25, height * 0.85)
      const color = pick(palette)
      for (let i = 0; i < 20; i++) {
        const angle = rand(0, Math.PI * 2)
        const speed = rand(10, 55)
        const life = rand(1.6, 2.6)
        parts.push({
          x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 18, life, max: life,
          size: rand(9, 20), color, phase: 0, kind: 'puff',
        })
      }
    }

    let last = performance.now()
    let frame = 0
    let running = true

    function step(now: number) {
      if (!running) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      ctx!.clearRect(0, 0, width, height)

      // New rockets / puffs every so often.
      spawnIn -= dt
      if (spawnIn <= 0) {
        if (effect === 'fireworks' || effect === 'tricolor') {
          launchRocket()
          spawnIn = rand(0.45, 0.9)
        } else if (effect === 'colors') {
          puff()
          spawnIn = rand(0.6, 1.1)
        } else if (effect === 'stars') {
          if (parts.length < 30) parts.push(newDrifter())
          spawnIn = 0.25
        } else spawnIn = 1
      }

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]
        p.phase += dt
        if (p.kind === 'rocket') {
          p.x += p.vx * dt
          p.y += p.vy * dt
          p.vy += 140 * dt
          drawDot(p.x, p.y, p.size, p.color, 1)
          // A short fading tail.
          drawDot(p.x - p.vx * 0.02, p.y - p.vy * 0.02, p.size * 0.8, p.color, 0.5)
          drawDot(p.x - p.vx * 0.04, p.y - p.vy * 0.04, p.size * 0.6, p.color, 0.25)
          if (p.y <= (p.burstAt ?? 0) || p.vy >= -40) {
            burst(p.x, p.y, p.color)
            parts.splice(i, 1)
          }
          continue
        }
        if (p.kind === 'spark' || p.kind === 'puff') {
          p.life -= dt
          if (p.life <= 0) {
            parts.splice(i, 1)
            continue
          }
          const drag = p.kind === 'spark' ? 0.985 : 0.97
          p.vx *= drag
          p.vy = p.vy * drag + (p.kind === 'spark' ? 55 : -6) * dt
          p.x += p.vx * dt
          p.y += p.vy * dt
          const fade = p.life / p.max
          if (p.kind === 'spark') {
            // A soft glow around a bright core.
            drawDot(p.x, p.y, p.size * 2.8, p.color, Math.min(1, fade * 1.4) * 0.22)
            drawDot(p.x, p.y, p.size, p.color, Math.min(1, fade * 1.5))
          } else drawDot(p.x, p.y, p.size * (1.6 - fade * 0.6), p.color, fade * 0.45)
          continue
        }
        if (p.kind === 'star') {
          p.life -= dt
          if (p.life <= 0) {
            parts.splice(i, 1)
            continue
          }
          const tw = 0.35 + 0.65 * Math.abs(Math.sin(p.phase * 2.2))
          drawStar(p.x, p.y, p.size, p.color, tw * Math.min(1, p.life))
          continue
        }
        // Snow and petals: fall, sway, wrap back to the top.
        p.x += (p.vx + Math.sin(p.phase * 1.4) * 18) * dt
        p.y += p.vy * dt
        if (p.y > height + 20) Object.assign(p, newDrifter(), { y: -20 })
        if (p.kind === 'flake') drawFlake(p.x, p.y, p.size)
        else drawPetal(p.x, p.y, p.size, p.color, p.phase * 2)
      }
      frame = requestAnimationFrame(step)
    }

    function drawDot(x: number, y: number, r: number, color: string, alpha: number) {
      ctx!.globalAlpha = Math.max(0, alpha)
      ctx!.fillStyle = color
      ctx!.beginPath()
      ctx!.arc(x, y, r, 0, Math.PI * 2)
      ctx!.fill()
      ctx!.globalAlpha = 1
    }
    function drawFlake(x: number, y: number, r: number) {
      // White with a soft blue edge, so it also shows on the light screen.
      ctx!.fillStyle = 'rgba(255,255,255,0.95)'
      ctx!.strokeStyle = 'rgba(120,150,205,0.7)'
      ctx!.lineWidth = 0.8
      ctx!.beginPath()
      ctx!.arc(x, y, r, 0, Math.PI * 2)
      ctx!.fill()
      ctx!.stroke()
    }
    function drawPetal(x: number, y: number, r: number, color: string, angle: number) {
      ctx!.save()
      ctx!.translate(x, y)
      ctx!.rotate(angle)
      ctx!.globalAlpha = 0.85
      ctx!.fillStyle = color
      ctx!.beginPath()
      ctx!.ellipse(0, 0, r, r * 0.55, 0, 0, Math.PI * 2)
      ctx!.fill()
      ctx!.restore()
    }
    function drawStar(x: number, y: number, r: number, color: string, alpha: number) {
      ctx!.save()
      ctx!.globalAlpha = Math.max(0, alpha)
      ctx!.fillStyle = color
      ctx!.translate(x, y)
      ctx!.beginPath()
      for (let k = 0; k < 8; k++) {
        const rad = k % 2 === 0 ? r * 2.2 : r * 0.6
        const a = (k / 8) * Math.PI * 2
        ctx!.lineTo(Math.cos(a) * rad, Math.sin(a) * rad)
      }
      ctx!.closePath()
      ctx!.fill()
      ctx!.restore()
    }

    // Pause while the app is hidden; carry on where it left off.
    const onVisibility = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(frame)
      } else if (!running) {
        running = true
        last = performance.now()
        frame = requestAnimationFrame(step)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    frame = requestAnimationFrame(step)

    return () => {
      running = false
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [effect])

  return <canvas ref={ref} aria-hidden="true" data-festive={effect} className="pointer-events-none fixed inset-0 z-[5] h-full w-full" />
}
