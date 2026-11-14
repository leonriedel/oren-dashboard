'use client'
import { useEffect, useRef } from 'react'

// SECONDBRAIN · DAY CORE
// Animated orbital view of the day: core brightness = day score,
// top-3 priorities orbit gold on the inner ring, habits orbit as planets on a tilted outer ring.
// Done items glow mint and send energy pulses into the core. Click a habit planet to toggle it.

export type CoreHabit = { id: string; label: string; emoji: string; done: boolean; streak: number }
export type CorePrio = { id: string; text: string; done: boolean }

interface Props {
  habits: CoreHabit[]
  prios: CorePrio[]
  score: number
  height?: number
  onToggleHabit?: (id: string) => void
}

const MINT = [52, 211, 153]
const GOLD = [251, 191, 36]
const BLUE = [128, 192, 255]
const rgba = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

export default function DayCore({ habits, prios, score, height = 360, onToggleHabit }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dataRef = useRef({ habits, prios, score })
  const hitRef = useRef<{ id: string; x: number; y: number; r: number }[]>([])
  const toggleRef = useRef(onToggleHabit)

  dataRef.current = { habits, prios, score }
  toggleRef.current = onToggleHabit

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0, H = height
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      W = wrap.clientWidth
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    // background stars
    const stars = Array.from({ length: 140 }, () => ({
      x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.2, p: Math.random() * Math.PI * 2, s: 0.01 + Math.random() * 0.03,
    }))
    // energy pulses travelling from a node into the core
    type Pulse = { sx: number; sy: number; t: number; speed: number; color: number[] }
    let pulses: Pulse[] = []
    // inward drifting dust (rate grows with score)
    type Dust = { a: number; d: number; v: number; life: number }
    let dust: Dust[] = []
    // planet trails
    const trails: Record<string, { x: number; y: number }[]> = {}

    let t = 0
    let shownScore = 0
    let raf = 0

    const sphereLines = (cx: number, cy: number, R: number, rot: number, alpha: number, col: number[]) => {
      ctx.lineWidth = 0.6
      // longitudes
      for (let i = 0; i < 9; i++) {
        const a = rot + (i / 9) * Math.PI
        const rx = Math.abs(Math.cos(a)) * R
        ctx.beginPath()
        ctx.ellipse(cx, cy, Math.max(rx, 0.5), R, 0, 0, Math.PI * 2)
        ctx.strokeStyle = rgba(col, alpha * (0.4 + 0.6 * Math.abs(Math.sin(a))))
        ctx.stroke()
      }
      // latitudes
      for (let j = 1; j < 6; j++) {
        const y = -R + (j / 6) * 2 * R
        const rr = Math.sqrt(R * R - y * y)
        ctx.beginPath()
        ctx.ellipse(cx, cy + y, rr, rr * 0.18, 0, 0, Math.PI * 2)
        ctx.strokeStyle = rgba(col, alpha * 0.6)
        ctx.stroke()
      }
    }

    const draw = () => {
      t += 1
      const { habits, prios, score } = dataRef.current
      shownScore += (score - shownScore) * 0.04
      const s = shownScore / 100
      const cx = W / 2, cy = H / 2
      const base = Math.min(W * 0.5, H)
      const coreCol = mix(BLUE, MINT, s)

      ctx.clearRect(0, 0, W, H)

      // stars
      for (const st of stars) {
        st.p += st.s
        ctx.beginPath()
        ctx.arc(st.x * W, st.y * H, st.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(200,230,255,${0.15 + (Math.sin(st.p) + 1) * 0.22})`
        ctx.fill()
      }

      ctx.globalCompositeOperation = 'lighter'

      // ambient glow
      const amb = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 0.9)
      amb.addColorStop(0, rgba(coreCol, 0.12 + s * 0.12))
      amb.addColorStop(0.5, rgba(coreCol, 0.03 + s * 0.03))
      amb.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = amb
      ctx.fillRect(0, 0, W, H)

      // geometry
      const outerRx = Math.min(W * 0.42, base * 1.25)
      const outerRy = base * 0.30
      const innerR = base * 0.2
      const tilt = -0.12

      const orbitPt = (rx: number, ry: number, a: number) => {
        const x0 = Math.cos(a) * rx, y0 = Math.sin(a) * ry
        return {
          x: cx + x0 * Math.cos(tilt) - y0 * Math.sin(tilt),
          y: cy + x0 * Math.sin(tilt) + y0 * Math.cos(tilt),
          depth: Math.sin(a), // >0 = front
        }
      }

      // orbit paths (outer, a second faint one, and dashed inner)
      const drawOrbit = (rx: number, ry: number, alpha: number, dash: number[] = []) => {
        ctx.save()
        ctx.translate(cx, cy); ctx.rotate(tilt)
        ctx.setLineDash(dash)
        ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
        ctx.strokeStyle = rgba(BLUE, alpha); ctx.lineWidth = 0.7; ctx.stroke()
        ctx.restore()
      }
      drawOrbit(outerRx, outerRy, 0.16)
      drawOrbit(outerRx * 1.12, outerRy * 1.18, 0.06, [2, 6])
      drawOrbit(outerRx * 0.78, outerRy * 0.8, 0.05)
      ctx.save(); ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.arc(cx, cy, innerR * 1.55, 0, Math.PI * 2)
      ctx.strokeStyle = rgba(GOLD, 0.12); ctx.lineWidth = 0.7; ctx.stroke(); ctx.restore()

      // compute habit positions
      const hab = habits.map((h, i) => {
        const a = t * 0.0035 + (i / Math.max(habits.length, 1)) * Math.PI * 2
        return { h, ...orbitPt(outerRx, outerRy, a) }
      })
      const pr = prios.slice(0, 3).map((p, i) => {
        const a = -t * 0.006 + (i / 3) * Math.PI * 2
        return { p, x: cx + Math.cos(a) * innerR * 1.55, y: cy + Math.sin(a) * innerR * 1.55 * 0.92 }
      })

      // spawn pulses from done items
      if (t % 14 === 0) {
        for (const o of hab) if (o.h.done) pulses.push({ sx: o.x, sy: o.y, t: 0, speed: 0.012 + Math.random() * 0.01, color: MINT })
        for (const o of pr) if (o.p.done) pulses.push({ sx: o.x, sy: o.y, t: 0, speed: 0.02, color: GOLD })
      }
      // spawn dust
      if (Math.random() < 0.25 + s * 0.9) dust.push({ a: Math.random() * Math.PI * 2, d: base * (0.7 + Math.random() * 0.5), v: 0.4 + Math.random() * 0.8, life: 0 })

      const drawHabit = (o: typeof hab[number]) => {
        const sc = 0.72 + 0.4 * (o.depth + 1) / 2
        const r = 13 * sc
        const done = o.h.done
        const col = done ? MINT : BLUE
        // trail
        const tr = (trails[o.h.id] ||= [])
        tr.push({ x: o.x, y: o.y }); if (tr.length > 26) tr.shift()
        if (done) {
          for (let i = 1; i < tr.length; i++) {
            ctx.beginPath(); ctx.moveTo(tr[i - 1].x, tr[i - 1].y); ctx.lineTo(tr[i].x, tr[i].y)
            ctx.strokeStyle = rgba(MINT, (i / tr.length) * 0.35); ctx.lineWidth = 2 * (i / tr.length) * sc; ctx.stroke()
          }
        }
        // halo
        const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, r * (done ? 3.4 : 2.2))
        g.addColorStop(0, rgba(col, done ? 0.45 : 0.14))
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, r * (done ? 3.4 : 2.2), 0, Math.PI * 2); ctx.fill()
        // body
        ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, Math.PI * 2)
        ctx.fillStyle = done ? rgba(MINT, 0.22) : 'rgba(10,24,54,0.9)'
        ctx.fill()
        ctx.strokeStyle = rgba(col, done ? 0.9 : 0.4); ctx.lineWidth = 1.2; ctx.stroke()
        // spinning ring for done
        if (done) {
          ctx.beginPath(); ctx.arc(o.x, o.y, r + 4, t * 0.05, t * 0.05 + Math.PI * 1.2)
          ctx.strokeStyle = rgba(MINT, 0.6); ctx.lineWidth = 1; ctx.stroke()
        }
        // streak dots
        const n = Math.min(o.h.streak, 7)
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.32
          ctx.beginPath(); ctx.arc(o.x + Math.cos(a) * (r + 9), o.y + Math.sin(a) * (r + 9), 1.4, 0, Math.PI * 2)
          ctx.fillStyle = rgba(GOLD, 0.85); ctx.fill()
        }
        // emoji + label
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 0.55 + 0.45 * (o.depth + 1) / 2
        ctx.font = `${Math.round(13 * sc)}px system-ui, Apple Color Emoji, Segoe UI Emoji`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(o.h.emoji, o.x, o.y + 1)
        ctx.font = `700 ${Math.max(8, 9 * sc)}px Space Mono, monospace`
        ctx.fillStyle = done ? rgba(MINT, 0.95) : 'rgba(170,205,240,0.75)'
        ctx.fillText(o.h.label + (o.h.streak > 0 ? `  🔥${o.h.streak}` : ''), o.x, o.y + r + 13)
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'lighter'
        hitRef.current.push({ id: o.h.id, x: o.x, y: o.y, r: r + 8 })
      }

      hitRef.current = []
      // back habits first
      hab.filter(o => o.depth <= 0).forEach(drawHabit)

      // connection beams for done items
      for (const o of [...hab.filter(o => o.h.done), ...pr.filter(o => o.p.done)]) {
        const isHab = 'h' in o
        const lg = ctx.createLinearGradient(o.x, o.y, cx, cy)
        lg.addColorStop(0, rgba(isHab ? MINT : GOLD, 0.28))
        lg.addColorStop(1, rgba(isHab ? MINT : GOLD, 0))
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(cx, cy)
        ctx.strokeStyle = lg; ctx.lineWidth = 0.8; ctx.stroke()
      }

      // dust into core
      dust = dust.filter(d => d.d > 6)
      for (const d of dust) {
        d.d -= d.v * (1 + s); d.a += 0.004; d.life++
        const x = cx + Math.cos(d.a) * d.d, y = cy + Math.sin(d.a) * d.d * 0.75
        ctx.beginPath(); ctx.arc(x, y, 0.9, 0, Math.PI * 2)
        ctx.fillStyle = rgba(coreCol, Math.min(1, d.life / 30) * 0.5); ctx.fill()
      }

      // pulses
      pulses = pulses.filter(p => p.t < 1)
      for (const p of pulses) {
        p.t += p.speed
        const e = p.t * p.t
        const x = p.sx + (cx - p.sx) * e, y = p.sy + (cy - p.sy) * e
        const g = ctx.createRadialGradient(x, y, 0, x, y, 6)
        g.addColorStop(0, rgba(p.color, 0.9)); g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill()
      }

      // CORE
      const breathe = 1 + Math.sin(t * 0.03) * 0.04
      const coreR = (innerR * 0.42 + s * innerR * 0.2) * breathe
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3.2)
      cg.addColorStop(0, rgba([235, 248, 255], 0.55 + s * 0.35))
      cg.addColorStop(0.18, rgba(coreCol, 0.45 + s * 0.3))
      cg.addColorStop(0.5, rgba(coreCol, 0.1 + s * 0.1))
      cg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, coreR * 3.2, 0, Math.PI * 2); ctx.fill()
      sphereLines(cx, cy, coreR * 1.25, t * 0.01, 0.35 + s * 0.3, coreCol)
      // core rings
      for (let i = 0; i < 3; i++) {
        const rr = coreR * (1.7 + i * 0.35)
        const a0 = t * (0.012 + i * 0.006) * (i % 2 ? -1 : 1)
        ctx.beginPath(); ctx.arc(cx, cy, rr, a0, a0 + Math.PI * (0.6 + s * 1.2))
        ctx.strokeStyle = rgba(coreCol, 0.35 - i * 0.08); ctx.lineWidth = 1; ctx.stroke()
      }
      // score ripple
      if (t % 90 === 0) pulses.push({ sx: cx, sy: cy, t: 1, speed: 0, color: coreCol })
      const ripple = (t % 90) / 90
      ctx.beginPath(); ctx.arc(cx, cy, coreR * (1.4 + ripple * 3), 0, Math.PI * 2)
      ctx.strokeStyle = rgba(coreCol, (1 - ripple) * (0.12 + s * 0.25)); ctx.lineWidth = 1; ctx.stroke()

      // prio nodes (inner ring)
      for (let i = 0; i < pr.length; i++) {
        const o = pr[i]
        const col = o.p.done ? MINT : GOLD
        const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, 14)
        g.addColorStop(0, rgba(col, o.p.done ? 0.6 : 0.4)); g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, 14, 0, Math.PI * 2); ctx.fill()
        ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(t * 0.02 + i)
        ctx.beginPath(); for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; ctx[k ? 'lineTo' : 'moveTo'](Math.cos(a) * 5, Math.sin(a) * 5) }
        ctx.closePath(); ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = 1.2; ctx.stroke()
        ctx.restore()
        ctx.globalCompositeOperation = 'source-over'
        ctx.font = '700 9px Space Mono, monospace'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillStyle = rgba(col, 0.9)
        ctx.fillText(String(i + 1).padStart(2, '0'), o.x, o.y - 14)
        ctx.globalCompositeOperation = 'lighter'
      }

      // front habits
      hab.filter(o => o.depth > 0).forEach(drawHabit)

      ctx.globalCompositeOperation = 'source-over'
      raf = requestAnimationFrame(draw)
    }
    draw()

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left, y = e.clientY - rect.top
      const hit = hitRef.current.find(h => Math.hypot(h.x - x, h.y - y) < h.r)
      if (hit) toggleRef.current?.(hit.id)
    }
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left, y = e.clientY - rect.top
      canvas.style.cursor = hitRef.current.some(h => Math.hypot(h.x - x, h.y - y) < h.r) ? 'pointer' : 'default'
    }
    canvas.addEventListener('click', onClick)
    canvas.addEventListener('mousemove', onMove)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('click', onClick)
      canvas.removeEventListener('mousemove', onMove)
    }
  }, [height])

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  )
}
