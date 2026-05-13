'use client'
import { useEffect, useRef } from 'react'

export default function GlobalParticles({ active = false }: { active?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeRef = useRef(active)
  activeRef.current = active

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

    const particles: any[] = []
    for (let i = 0; i < 600; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 2.2 + 0.3,
        opacity: Math.random() * 0.55 + 0.12,
        phase: Math.random() * Math.PI * 2,
      })
    }

    let t = 0
    let animId: number

    const draw = () => {
      t++
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const cx = canvas.width / 2
      const cy = canvas.height / 2

      particles.forEach(p => {
        const dx = cx - p.x
        const dy = cy - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (activeRef.current) {
          const force = Math.min(1.5 / Math.max(dist, 60), 0.022)
          p.vx += dx * force
          p.vy += dy * force
        } else {
          p.vx += (Math.random() - 0.5) * 0.08
          p.vy += (Math.random() - 0.5) * 0.08
          if (dist < 200) {
            p.vx -= (dx / dist) * 0.05
            p.vy -= (dy / dist) * 0.05
          }
        }

        p.vx *= 0.97
        p.vy *= 0.97
        p.x += p.vx
        p.y += p.vy

        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width) p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0

        const prox = Math.max(0, 1 - dist / 420)
        const flicker = 0.8 + 0.2 * Math.sin(t * 0.05 + p.phase)
        const alpha = Math.min((p.opacity + prox * 0.35) * flicker, 0.9)

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * (1 + prox * 0.5), 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${90 + prox * 30}, ${165 + prox * 25}, 255, ${alpha})`
        ctx.fill()
      })

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
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    />
  )
}
