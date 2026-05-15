'use client'
import { useEffect, useRef } from 'react'

type OrbState = 'idle' | 'thinking' | 'speaking' | 'listening'

export default function HUDCore({ orbState = 'idle', size = 540 }: { orbState?: OrbState; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef(orbState)
  stateRef.current = orbState

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = size + 'px'
    canvas.style.height = size + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const cx = size / 2
    const cy = size / 2

    let t = 0
    let animId: number

    const draw = () => {
      t += 1
      ctx.clearRect(0, 0, size, size)

      const s = stateRef.current
      const mult = s === 'idle' ? 1.0 : 1.5
      const pulse = (Math.sin(t * 0.025) + 1) * 0.5
      const pulse2 = (Math.sin(t * 0.04 + 1) + 1) * 0.5

      const CYAN = { r: 100, g: 200, b: 255 }
      const YELLOW = { r: 255, g: 215, b: 60 }

      // ═════════════ AMBIENT GLOW ═════════════
      const ambient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.5)
      ambient.addColorStop(0,   `rgba(60, 130, 220, ${0.15 + pulse * 0.10})`)
      ambient.addColorStop(0.4, `rgba(40, 100, 180, ${0.08 + pulse * 0.05})`)
      ambient.addColorStop(1,   'rgba(0, 0, 0, 0)')
      ctx.fillStyle = ambient
      ctx.fillRect(0, 0, size, size)

      // ═════════════ OUTER CYAN RING (with tick marks) ═════════════
      const outerR = size * 0.46
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(t * 0.0008)
      // 80 ticks - 8 major (cardinal), rest small
      for (let i = 0; i < 80; i++) {
        const angle = (i / 80) * Math.PI * 2 - Math.PI / 2
        const isMajor = i % 10 === 0
        const isMid = i % 5 === 0
        const tickLen = isMajor ? 16 : isMid ? 9 : 5
        const x1 = Math.cos(angle) * outerR
        const y1 = Math.sin(angle) * outerR
        const x2 = Math.cos(angle) * (outerR - tickLen)
        const y2 = Math.sin(angle) * (outerR - tickLen)
        ctx.beginPath()
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2)
        ctx.strokeStyle = isMajor
          ? `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, 0.85)`
          : isMid
          ? `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, 0.45)`
          : `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, 0.22)`
        ctx.lineWidth = isMajor ? 1.6 : isMid ? 1.0 : 0.6
        ctx.stroke()
      }
      // cardinal labels
      ctx.fillStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, 0.7)`
      ctx.font = 'bold 11px "Space Mono", monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const cardinals = ['000', '045', '090', '135', '180', '225', '270', '315']
      cardinals.forEach((label, i) => {
        const angle = (i / 8) * Math.PI * 2 - Math.PI / 2
        const x = Math.cos(angle) * (outerR - 30)
        const y = Math.sin(angle) * (outerR - 30)
        ctx.fillText(label, x, y)
      })
      ctx.restore()

      // ═════════════ YELLOW RING (rotating, large arcs) ═════════════
      const yellowR = size * 0.36
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(t * 0.004 * mult)
      // 3 large arc segments
      for (let i = 0; i < 3; i++) {
        const start = (i / 3) * Math.PI * 2 + 0.25
        const end = ((i + 1) / 3) * Math.PI * 2 - 0.25
        ctx.beginPath()
        ctx.arc(0, 0, yellowR, start, end)
        ctx.strokeStyle = `rgba(${YELLOW.r}, ${YELLOW.g}, ${YELLOW.b}, ${0.65 + pulse * 0.20})`
        ctx.lineWidth = 2.5
        ctx.stroke()
        // glowing endpoints
        const sx = Math.cos(start) * yellowR, sy = Math.sin(start) * yellowR
        const ex = Math.cos(end) * yellowR, ey = Math.sin(end) * yellowR
        for (const [px, py] of [[sx, sy], [ex, ey]] as [number,number][]) {
          const g = ctx.createRadialGradient(px, py, 0, px, py, 8)
          g.addColorStop(0, `rgba(${YELLOW.r}, ${YELLOW.g}, ${YELLOW.b}, 0.95)`)
          g.addColorStop(1, `rgba(${YELLOW.r}, ${YELLOW.g}, ${YELLOW.b}, 0)`)
          ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2)
          ctx.fillStyle = g; ctx.fill()
          ctx.beginPath(); ctx.arc(px, py, 3.5, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${YELLOW.r}, ${YELLOW.g}, ${YELLOW.b}, 1)`
          ctx.fill()
        }
      }
      // big arrow pointing inward at angle 0
      const arrowR = yellowR - 4
      ctx.beginPath()
      ctx.moveTo(arrowR, 0)
      ctx.lineTo(arrowR + 18, -10)
      ctx.lineTo(arrowR + 12, 0)
      ctx.lineTo(arrowR + 18, 10)
      ctx.closePath()
      ctx.fillStyle = `rgba(${YELLOW.r}, ${YELLOW.g}, ${YELLOW.b}, 0.95)`
      ctx.fill()
      ctx.restore()

      // ═════════════ INNER CYAN DASHED RING ═════════════
      const innerR = size * 0.27
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(-t * 0.006 * mult)
      ctx.beginPath()
      ctx.arc(0, 0, innerR, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, 0.6)`
      ctx.lineWidth = 1.2
      ctx.setLineDash([14, 8])
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

      // ═════════════ HEXAGON FRAME ═════════════
      const hexR = size * 0.18
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(t * 0.003)
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2
        const x = Math.cos(a) * hexR
        const y = Math.sin(a) * hexR
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.strokeStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, 0.55)`
      ctx.lineWidth = 1.3
      ctx.stroke()
      // glowing vertex dots
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2
        const x = Math.cos(a) * hexR
        const y = Math.sin(a) * hexR
        const g = ctx.createRadialGradient(x, y, 0, x, y, 7)
        g.addColorStop(0, `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, 1)`)
        g.addColorStop(1, `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, 0)`)
        ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2)
        ctx.fillStyle = g; ctx.fill()
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(220, 245, 255, 1)`
        ctx.fill()
      }
      ctx.restore()

      // ═════════════ CROSSHAIR THROUGH HEX ═════════════
      ctx.save()
      ctx.translate(cx, cy)
      const chR1 = hexR * 0.65, chR2 = hexR * 1.15
      ctx.strokeStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, 0.4)`
      ctx.lineWidth = 0.8
      ctx.setLineDash([3, 3])
      // horizontal
      ctx.beginPath()
      ctx.moveTo(-chR2, 0); ctx.lineTo(-chR1, 0)
      ctx.moveTo(chR1, 0); ctx.lineTo(chR2, 0)
      ctx.stroke()
      // vertical
      ctx.beginPath()
      ctx.moveTo(0, -chR2); ctx.lineTo(0, -chR1)
      ctx.moveTo(0, chR1); ctx.lineTo(0, chR2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()

      // ═════════════ BIG GLOWING CORE ═════════════
      const coreR = size * 0.085 + Math.sin(t * 0.05) * 5 * mult
      // huge outer glow
      const outerGlow = ctx.createRadialGradient(cx, cy, coreR, cx, cy, coreR * 5)
      outerGlow.addColorStop(0,   `rgba(120, 200, 255, ${0.45 + pulse * 0.25 * mult})`)
      outerGlow.addColorStop(0.3, `rgba(80, 160, 240, ${0.25 + pulse * 0.15 * mult})`)
      outerGlow.addColorStop(0.7, `rgba(60, 130, 220, ${0.08 + pulse * 0.05})`)
      outerGlow.addColorStop(1,   'rgba(0, 0, 0, 0)')
      ctx.beginPath()
      ctx.arc(cx, cy, coreR * 5, 0, Math.PI * 2)
      ctx.fillStyle = outerGlow
      ctx.fill()

      // mid glow
      const midGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.5)
      midGlow.addColorStop(0,   `rgba(200, 230, 255, ${0.80 + pulse * 0.15})`)
      midGlow.addColorStop(0.3, `rgba(140, 200, 255, ${0.55 + pulse * 0.20})`)
      midGlow.addColorStop(0.7, `rgba(80, 160, 240, ${0.20})`)
      midGlow.addColorStop(1,   'rgba(0, 0, 0, 0)')
      ctx.beginPath()
      ctx.arc(cx, cy, coreR * 2.5, 0, Math.PI * 2)
      ctx.fillStyle = midGlow
      ctx.fill()

      // bright core
      const coreGrad = ctx.createRadialGradient(cx - coreR * 0.25, cy - coreR * 0.3, 0, cx, cy, coreR)
      coreGrad.addColorStop(0,    'rgba(255, 255, 255, 1)')
      coreGrad.addColorStop(0.25, 'rgba(220, 240, 255, 0.98)')
      coreGrad.addColorStop(0.55, 'rgba(140, 200, 255, 0.92)')
      coreGrad.addColorStop(0.85, 'rgba(70, 140, 230, 0.75)')
      coreGrad.addColorStop(1,    'rgba(20, 60, 140, 0.4)')
      ctx.beginPath()
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2)
      ctx.fillStyle = coreGrad
      ctx.fill()

      // inner highlight rings
      ctx.beginPath()
      ctx.arc(cx, cy, coreR * 0.72, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 + pulse2 * 0.20})`
      ctx.lineWidth = 1.2
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, cy, coreR * 0.48, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(230, 245, 255, ${0.22 + pulse * 0.15})`
      ctx.lineWidth = 0.8
      ctx.stroke()

      // ═════════════ PULSING ENERGY RINGS (expanding outward) ═════════════
      for (let i = 0; i < 2; i++) {
        const cycle = (t * 0.012 + i * 0.5) % 1
        const r = coreR + cycle * size * 0.18
        const alpha = (1 - cycle) * 0.45 * mult
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${alpha})`
        ctx.lineWidth = 1.2
        ctx.stroke()
      }

      // ═════════════ MOVING ARROW TRACKER ═════════════
      const trackerAngle = t * 0.018 * mult
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(trackerAngle + Math.PI / 2)
      ctx.translate(0, -outerR)
      ctx.beginPath()
      ctx.moveTo(0, -10)
      ctx.lineTo(-7, 6)
      ctx.lineTo(0, 2)
      ctx.lineTo(7, 6)
      ctx.closePath()
      ctx.fillStyle = `rgba(255, 215, 60, 0.95)`
      ctx.shadowColor = `rgba(255, 215, 60, 0.8)`
      ctx.shadowBlur = 14
      ctx.fill()
      ctx.restore()

      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animId)
  }, [size])

  return <canvas ref={canvasRef} style={{ display: 'block', pointerEvents: 'none' }} />
}
