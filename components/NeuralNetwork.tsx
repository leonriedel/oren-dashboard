'use client'
import { useEffect, useRef } from 'react'

export default function NeuralNetwork({ active = false }: { active?: boolean }) {
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

    // ─── Build node network ────────────────────────────────
    type Node = {
      x: number; y: number
      vx: number; vy: number
      r: number
      tier: 0 | 1 | 2          // 0 = bright/large, 1 = medium, 2 = small
      pulse: number
      pulsePhase: number
    }
    const nodes: Node[] = []

    const NODE_COUNT = Math.min(120, Math.floor(window.innerWidth * window.innerHeight / 18000))
    for (let i = 0; i < NODE_COUNT; i++) {
      const tier = (Math.random() < 0.12 ? 0 : Math.random() < 0.4 ? 1 : 2) as 0 | 1 | 2
      nodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: tier === 0 ? 2.2 + Math.random() * 1.0
         : tier === 1 ? 1.3 + Math.random() * 0.6
         :              0.7 + Math.random() * 0.4,
        tier,
        pulse: 0,
        pulsePhase: Math.random() * Math.PI * 2,
      })
    }

    // pre-allocated for traveling data packets
    type Packet = { from: number; to: number; t: number; speed: number }
    const packets: Packet[] = []

    let t = 0
    let animId: number
    const CONNECT_DIST = 180

    const draw = () => {
      t++
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const cx = canvas.width / 2
      const cy = canvas.height / 2
      const isActive = activeRef.current

      // update positions
      nodes.forEach(n => {
        // gentle attraction to center when active
        if (isActive) {
          const dx = cx - n.x, dy = cy - n.y
          const dist = Math.sqrt(dx*dx + dy*dy)
          const f = Math.min(0.4 / Math.max(dist, 100), 0.008)
          n.vx += dx * f
          n.vy += dy * f
        } else {
          n.vx += (Math.random() - 0.5) * 0.012
          n.vy += (Math.random() - 0.5) * 0.012
          // weak repulsion from center to avoid clustering on idle
          const dx = cx - n.x, dy = cy - n.y
          const dist = Math.sqrt(dx*dx + dy*dy)
          if (dist < 280) {
            n.vx -= (dx/dist) * 0.018
            n.vy -= (dy/dist) * 0.018
          }
        }
        n.vx *= 0.97; n.vy *= 0.97
        n.x += n.vx; n.y += n.vy
        // wrap
        if (n.x < -20) n.x = canvas.width + 20
        if (n.x > canvas.width + 20) n.x = -20
        if (n.y < -20) n.y = canvas.height + 20
        if (n.y > canvas.height + 20) n.y = -20
        n.pulse = (Math.sin(t * 0.04 + n.pulsePhase) + 1) * 0.5
      })

      // collect edges
      const edges: Array<[number, number, number]> = []   // [i, j, strength]
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const d = Math.sqrt(dx*dx + dy*dy)
          if (d < CONNECT_DIST) {
            edges.push([i, j, 1 - d / CONNECT_DIST])
          }
        }
      }

      // draw edges
      edges.forEach(([i, j, strength]) => {
        const a = nodes[i], b = nodes[j]
        const alpha = strength * strength * 0.35
        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
        grad.addColorStop(0, `rgba(${80 + a.pulse * 60}, ${140 + a.pulse * 60}, 255, ${alpha})`)
        grad.addColorStop(1, `rgba(${80 + b.pulse * 60}, ${140 + b.pulse * 60}, 255, ${alpha})`)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.strokeStyle = grad
        ctx.lineWidth = 0.5 + strength * 0.6
        ctx.stroke()
      })

      // spawn data packets occasionally
      if (t % 6 === 0 && edges.length > 0 && packets.length < 40) {
        const e = edges[Math.floor(Math.random() * edges.length)]
        packets.push({ from: e[0], to: e[1], t: 0, speed: 0.015 + Math.random() * 0.02 })
      }

      // update + draw packets
      for (let p = packets.length - 1; p >= 0; p--) {
        const pk = packets[p]
        pk.t += pk.speed
        if (pk.t >= 1) {
          packets.splice(p, 1)
          continue
        }
        const a = nodes[pk.from], b = nodes[pk.to]
        if (!a || !b) { packets.splice(p, 1); continue }
        const x = a.x + (b.x - a.x) * pk.t
        const y = a.y + (b.y - a.y) * pk.t
        // glow
        const pg = ctx.createRadialGradient(x, y, 0, x, y, 5)
        pg.addColorStop(0, 'rgba(160, 220, 255, 0.7)')
        pg.addColorStop(1, 'rgba(80, 160, 255, 0)')
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2)
        ctx.fillStyle = pg; ctx.fill()
        // core
        ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(220, 235, 255, 0.95)'; ctx.fill()
      }

      // draw nodes
      nodes.forEach(n => {
        const baseA = n.tier === 0 ? 0.85 : n.tier === 1 ? 0.55 : 0.35
        const alpha = baseA * (0.7 + n.pulse * 0.3)
        const r = n.r * (1 + n.pulse * 0.18)
        // halo for bigger nodes
        if (n.tier <= 1) {
          const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 5)
          g.addColorStop(0, `rgba(120, 180, 255, ${alpha * 0.35})`)
          g.addColorStop(1, 'rgba(80, 140, 255, 0)')
          ctx.beginPath(); ctx.arc(n.x, n.y, r * 5, 0, Math.PI * 2)
          ctx.fillStyle = g; ctx.fill()
        }
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${130 + n.pulse * 60}, ${190 + n.pulse * 30}, 255, ${alpha})`
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
        top: 0, left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    />
  )
}
