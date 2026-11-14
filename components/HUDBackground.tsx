'use client'
import { useEffect, useRef } from 'react'

export default function HUDBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // ─── State: yellow stars drifting freely ───
    type Star = { x: number; y: number; vx: number; vy: number; r: number; twinkle: number }
    const stars: Star[] = []
    const seedStars = () => {
      stars.length = 0
      for (let i = 0; i < 45; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          r: 0.6 + Math.random() * 1.8,
          twinkle: Math.random() * Math.PI * 2,
        })
      }
    }
    seedStars()

    // ─── State: free-floating line segments drifting around ───
    type FreeLine = { x: number; y: number; angle: number; len: number; drift: number; life: number; maxLife: number }
    const lines: FreeLine[] = []
    const spawnLine = () => {
      lines.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        angle: Math.random() * Math.PI * 2,
        len: 15 + Math.random() * 45,
        drift: (Math.random() - 0.5) * 0.3,
        life: 0,
        maxLife: 180 + Math.random() * 240,
      })
    }
    for (let i = 0; i < 20; i++) spawnLine()

    // ─── State: occasional shooting stars ───
    type Shoot = { x: number; y: number; vx: number; vy: number; life: number; trail: {x:number;y:number}[] }
    const shoots: Shoot[] = []
    let nextShootTime = 60

    let t = 0
    let animId: number

    const draw = () => {
      t++
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const w = canvas.width, h = canvas.height
      const cx = w / 2, cy = h / 2

      // Soft radial glow from center
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.55)
      glow.addColorStop(0,   'rgba(30, 90, 180, 0.20)')
      glow.addColorStop(0.5, 'rgba(20, 60, 140, 0.08)')
      glow.addColorStop(1,   'rgba(0, 0, 0, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, w, h)

      // Subtle concentric guide circles
      ctx.strokeStyle = 'rgba(80, 160, 255, 0.035)'
      ctx.lineWidth = 0.5
      for (let i = 1; i <= 8; i++) {
        ctx.beginPath()
        ctx.arc(cx, cy, i * 100, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Blue drifting particles (existing)
      const pCount = 60
      for (let i = 0; i < pCount; i++) {
        const ph = (t * 0.25 + i * 137) % (h + 50)
        const px = ((i * 89) % w + Math.sin(t * 0.008 + i) * 25)
        const alpha = 0.15 + (Math.sin(t * 0.04 + i) + 1) * 0.20
        const size = i % 5 === 0 ? 1.2 : 0.7
        ctx.beginPath()
        ctx.arc(px, ph, size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(140, 200, 255, ${alpha})`
        ctx.fill()
      }

      // ─── YELLOW STARS (free-flying across the page) ───
      for (const s of stars) {
        s.x += s.vx
        s.y += s.vy
        s.twinkle += 0.03
        if (s.x < -10) s.x = w + 10
        if (s.x > w + 10) s.x = -10
        if (s.y < -10) s.y = h + 10
        if (s.y > h + 10) s.y = -10
        const alpha = 0.3 + (Math.sin(s.twinkle) + 1) * 0.35
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4)
        g.addColorStop(0, `rgba(255, 215, 60, ${alpha})`)
        g.addColorStop(1, 'rgba(255, 215, 60, 0)')
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 215, 60, ${alpha})`
        ctx.fill()
      }

      // ─── FREE-FLOATING LINE SEGMENTS ───
      for (let li = lines.length - 1; li >= 0; li--) {
        const ln = lines[li]
        ln.life++
        ln.angle += ln.drift * 0.015
        ln.x += Math.cos(ln.angle) * 0.4
        ln.y += Math.sin(ln.angle) * 0.4
        const fade = ln.life < 30 ? ln.life / 30 : ln.life > ln.maxLife - 30 ? (ln.maxLife - ln.life) / 30 : 1
        if (ln.life >= ln.maxLife) {
          lines.splice(li, 1)
          spawnLine()
          continue
        }
        const x2 = ln.x + Math.cos(ln.angle) * ln.len
        const y2 = ln.y + Math.sin(ln.angle) * ln.len
        const alpha = 0.18 * fade
        const grad = ctx.createLinearGradient(ln.x, ln.y, x2, y2)
        grad.addColorStop(0, `rgba(100, 200, 255, 0)`)
        grad.addColorStop(0.5, `rgba(140, 220, 255, ${alpha})`)
        grad.addColorStop(1, `rgba(100, 200, 255, 0)`)
        ctx.beginPath()
        ctx.moveTo(ln.x, ln.y); ctx.lineTo(x2, y2)
        ctx.strokeStyle = grad
        ctx.lineWidth = 0.6
        ctx.stroke()
      }

      // ─── SHOOTING STARS (occasional long streaks) ───
      nextShootTime--
      if (nextShootTime <= 0) {
        const fromLeft = Math.random() > 0.5
        shoots.push({
          x: fromLeft ? -20 : w + 20,
          y: Math.random() * h,
          vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 3),
          vy: (Math.random() - 0.5) * 1.5,
          life: 0,
          trail: [],
        })
        nextShootTime = 180 + Math.random() * 400
      }
      for (let si = shoots.length - 1; si >= 0; si--) {
        const sh = shoots[si]
        sh.x += sh.vx; sh.y += sh.vy; sh.life++
        sh.trail.push({ x: sh.x, y: sh.y })
        if (sh.trail.length > 24) sh.trail.shift()
        if (sh.x < -40 || sh.x > w + 40 || sh.life > 300) { shoots.splice(si, 1); continue }
        for (let i = 0; i < sh.trail.length - 1; i++) {
          const fade = i / sh.trail.length
          ctx.beginPath()
          ctx.moveTo(sh.trail[i].x, sh.trail[i].y); ctx.lineTo(sh.trail[i+1].x, sh.trail[i+1].y)
          ctx.strokeStyle = `rgba(255, 230, 150, ${fade * 0.7})`
          ctx.lineWidth = 1.2 * fade
          ctx.stroke()
        }
        ctx.beginPath(); ctx.arc(sh.x, sh.y, 2, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 240, 180, 0.9)'
        ctx.fill()
      }

      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', top: 0, left: 0,
        width: '100vw', height: '100vh',
        pointerEvents: 'none', zIndex: 2,
      }}
    />
  )
}
