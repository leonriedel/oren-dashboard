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

      // Drifting particles
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

      // Soft moving horizontal scan lines
      ctx.strokeStyle = 'rgba(100, 180, 255, 0.04)'
      ctx.lineWidth = 0.5
      const scanY1 = (t * 0.6) % h
      const scanY2 = (t * 0.6 + h / 2) % h
      ctx.beginPath(); ctx.moveTo(0, scanY1); ctx.lineTo(w, scanY1); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, scanY2); ctx.lineTo(w, scanY2); ctx.stroke()

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
