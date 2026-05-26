'use client'
import { useEffect, useRef } from 'react'

export default function Stardust() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number

    function resize() {
      if (!canvas) return
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    type Star = { x: number; y: number; r: number; tw: number; tws: number; vx: number; vy: number; silver: boolean }
    const stars: Star[] = []
    for (let i = 0; i < 280; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.6 + 0.3,
        tw: Math.random() * Math.PI * 2,
        tws: 0.008 + Math.random() * 0.025,
        vx: (Math.random() - 0.5) * 0.06,
        vy: (Math.random() - 0.5) * 0.06,
        silver: Math.random() < 0.18,
      })
    }

    type Shoot = { x: number; y: number; vx: number; vy: number; life: number; decay: number }
    const shooting: Shoot[] = []
    let lastShoot = 0

    function spawnShoot() {
      if (!canvas) return
      shooting.push({
        x: Math.random() * canvas.width * 0.7,
        y: Math.random() * canvas.height * 0.4,
        vx: 2 + Math.random() * 2.5,
        vy: 0.6 + Math.random() * 1.0,
        life: 1,
        decay: 0.008 + Math.random() * 0.008,
      })
    }

    function draw(t: number) {
      if (!ctx || !canvas) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const s of stars) {
        s.tw += s.tws
        s.x += s.vx
        s.y += s.vy
        if (s.x < 0) s.x = canvas.width
        if (s.x > canvas.width) s.x = 0
        if (s.y < 0) s.y = canvas.height
        if (s.y > canvas.height) s.y = 0
        const opacity = 0.35 + Math.sin(s.tw) * 0.45
        const color = s.silver
          ? `rgba(200,220,240,${opacity})`
          : `rgba(255,255,255,${opacity})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.shadowColor = color
        ctx.shadowBlur = s.r * 4
        ctx.fill()
      }
      ctx.shadowBlur = 0

      if (t - lastShoot > 2200 && Math.random() < 0.55) {
        spawnShoot()
        lastShoot = t
      }
      for (let i = shooting.length - 1; i >= 0; i--) {
        const sh = shooting[i]
        sh.x += sh.vx
        sh.y += sh.vy
        sh.life -= sh.decay
        if (sh.life <= 0) {
          shooting.splice(i, 1)
          continue
        }
        const grad = ctx.createLinearGradient(sh.x - sh.vx * 22, sh.y - sh.vy * 22, sh.x, sh.y)
        grad.addColorStop(0, 'rgba(200,220,255,0)')
        grad.addColorStop(1, `rgba(255,255,255,${sh.life})`)
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.moveTo(sh.x - sh.vx * 22, sh.y - sh.vy * 22)
        ctx.lineTo(sh.x, sh.y)
        ctx.stroke()
      }

      animId = requestAnimationFrame(draw)
    }
    animId = requestAnimationFrame(draw)

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
      }}
    />
  )
}
