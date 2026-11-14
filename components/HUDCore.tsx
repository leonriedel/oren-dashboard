'use client'
import { useEffect, useRef } from 'react'

type OrbState = 'idle' | 'thinking' | 'speaking' | 'listening'

/**
 * HUDCore v2 — A+C Hybrid
 *   Outer:  3D wireframe sphere (longitude + latitude, rotating)
 *           + subtle tick ring + state indicator arcs
 *   Inner:  Neural network cluster (~40 nodes, pulsing synapses)
 *   Depth:  Mouse parallax, perspective projection
 *   Core:   Dense glowing nucleus
 *
 * All canvas 2D, no WebGL deps. Looks alive, structured, modern.
 */
export default function HUDCore({ orbState = 'idle', size = 540 }: { orbState?: OrbState; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef(orbState)
  const mouseRef = useRef({ x: 0, y: 0, target_x: 0, target_y: 0 })
  stateRef.current = orbState

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
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
    const sphereR = size * 0.34
    const nodeSphereR = sphereR * 0.72
    const focal = size * 0.9

    // Mouse parallax listener (gentle)
    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      const dx = (e.clientX - rect.left - size / 2) / (size / 2)
      const dy = (e.clientY - rect.top - size / 2) / (size / 2)
      mouseRef.current.target_x = Math.max(-1.5, Math.min(1.5, dx))
      mouseRef.current.target_y = Math.max(-1.5, Math.min(1.5, dy))
    }
    window.addEventListener('mousemove', onMouseMove)

    // ─── Build neural node cluster ───
    type Node = { x: number; y: number; z: number; r: number; activation: number; nextFire: number }
    const nodes: Node[] = []
    const NODE_COUNT = 42
    for (let i = 0; i < NODE_COUNT; i++) {
      // Random distribution inside a sphere (rejection sampling)
      let x = 0, y = 0, z = 0
      for (let tries = 0; tries < 20; tries++) {
        x = (Math.random() - 0.5) * 2
        y = (Math.random() - 0.5) * 2
        z = (Math.random() - 0.5) * 2
        if (x * x + y * y + z * z <= 1) break
      }
      nodes.push({
        x: x * nodeSphereR,
        y: y * nodeSphereR,
        z: z * nodeSphereR,
        r: 1.4 + Math.random() * 1.6,
        activation: Math.random() * 0.3,
        nextFire: Math.random() * 180,
      })
    }

    // Precompute edge list (each node connects to its 3-4 nearest)
    type Edge = { a: number; b: number; strength: number; dist: number }
    const edges: Edge[] = []
    for (let i = 0; i < nodes.length; i++) {
      const dists: Array<{ j: number; d: number }> = []
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue
        const dx = nodes[i].x - nodes[j].x
        const dy = nodes[i].y - nodes[j].y
        const dz = nodes[i].z - nodes[j].z
        dists.push({ j, d: Math.sqrt(dx*dx + dy*dy + dz*dz) })
      }
      dists.sort((a, b) => a.d - b.d)
      // Take 3 nearest neighbors
      for (let k = 0; k < 3; k++) {
        const j = dists[k].j
        if (i < j) {   // dedup
          edges.push({ a: i, b: j, strength: 0, dist: dists[k].d })
        }
      }
    }

    // Build sphere wireframe geometry (meridians + parallels)
    const MERIDIANS = 12
    const PARALLELS = 7
    const POINTS_PER_LINE = 48
    type V3 = { x: number; y: number; z: number }
    const meridianLines: V3[][] = []
    const parallelLines: V3[][] = []
    for (let m = 0; m < MERIDIANS; m++) {
      const lineLon = (m / MERIDIANS) * Math.PI * 2
      const pts: V3[] = []
      for (let p = 0; p <= POINTS_PER_LINE; p++) {
        const lat = -Math.PI / 2 + (p / POINTS_PER_LINE) * Math.PI
        pts.push({
          x: sphereR * Math.cos(lat) * Math.cos(lineLon),
          y: sphereR * Math.sin(lat),
          z: sphereR * Math.cos(lat) * Math.sin(lineLon),
        })
      }
      meridianLines.push(pts)
    }
    for (let q = 1; q < PARALLELS; q++) {
      const lat = -Math.PI / 2 + (q / PARALLELS) * Math.PI
      const pts: V3[] = []
      for (let p = 0; p <= POINTS_PER_LINE; p++) {
        const lon = (p / POINTS_PER_LINE) * Math.PI * 2
        pts.push({
          x: sphereR * Math.cos(lat) * Math.cos(lon),
          y: sphereR * Math.sin(lat),
          z: sphereR * Math.cos(lat) * Math.sin(lon),
        })
      }
      parallelLines.push(pts)
    }

    // Rotation matrices
    const rot = (p: V3, rx: number, ry: number): V3 => {
      // Rotate around Y
      let x = p.x * Math.cos(ry) + p.z * Math.sin(ry)
      let z = -p.x * Math.sin(ry) + p.z * Math.cos(ry)
      let y = p.y
      // Rotate around X
      const y2 = y * Math.cos(rx) - z * Math.sin(rx)
      const z2 = y * Math.sin(rx) + z * Math.cos(rx)
      return { x, y: y2, z: z2 }
    }

    // Project 3D → 2D with perspective
    const project = (p: V3): { sx: number; sy: number; scale: number } => {
      const scale = focal / (focal + p.z)
      return { sx: cx + p.x * scale, sy: cy + p.y * scale, scale }
    }

    let t = 0
    let animId: number

    // Data streams (inward arrows)
    type Stream = { angle: number; progress: number; speed: number }
    const streams: Stream[] = []
    for (let i = 0; i < 6; i++) {
      streams.push({
        angle: Math.random() * Math.PI * 2,
        progress: Math.random(),
        speed: 0.004 + Math.random() * 0.006,
      })
    }

    const CYAN = { r: 100, g: 200, b: 255 }
    const DEEP = { r: 60, g: 130, b: 220 }
    const ACC  = { r: 255, g: 215, b: 60 }      // yellow accent for state
    const WHITE = { r: 220, g: 245, b: 255 }

    const draw = () => {
      t += 1
      ctx.clearRect(0, 0, size, size)

      // Smooth mouse interpolation
      mouseRef.current.x += (mouseRef.current.target_x - mouseRef.current.x) * 0.06
      mouseRef.current.y += (mouseRef.current.target_y - mouseRef.current.y) * 0.06

      const s = stateRef.current
      const stateMult = s === 'idle' ? 1.0 : s === 'thinking' ? 1.4 : s === 'speaking' ? 1.6 : 1.3
      const pulse = (Math.sin(t * 0.025) + 1) * 0.5

      // Rotation: continuous slow Y + mouse parallax
      const ry = t * 0.0035 + mouseRef.current.x * 0.4
      const rx = -0.35 + mouseRef.current.y * -0.3

      // ═════════════ AMBIENT GLOW ═════════════
      const ambient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.5)
      ambient.addColorStop(0,   `rgba(${DEEP.r}, ${DEEP.g}, ${DEEP.b}, ${0.14 + pulse * 0.08})`)
      ambient.addColorStop(0.4, `rgba(${DEEP.r}, 100, 180, ${0.07 + pulse * 0.04})`)
      ambient.addColorStop(1,   'rgba(0, 0, 0, 0)')
      ctx.fillStyle = ambient
      ctx.fillRect(0, 0, size, size)

      // ═════════════ OUTER SUBTLE TICK RING ═════════════
      const outerR = size * 0.46
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(t * 0.0006)
      for (let i = 0; i < 60; i++) {
        const angle = (i / 60) * Math.PI * 2 - Math.PI / 2
        const isMajor = i % 15 === 0
        const tickLen = isMajor ? 12 : 4
        const op = isMajor ? 0.5 : 0.15
        const x1 = Math.cos(angle) * outerR
        const y1 = Math.sin(angle) * outerR
        const x2 = Math.cos(angle) * (outerR - tickLen)
        const y2 = Math.sin(angle) * (outerR - tickLen)
        ctx.beginPath()
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2)
        ctx.strokeStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${op})`
        ctx.lineWidth = isMajor ? 1.2 : 0.5
        ctx.stroke()
      }
      ctx.restore()

      // ═════════════ STATE INDICATOR ARC (yellow accent, position shows state) ═════════════
      const stateArcR = size * 0.42
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(t * 0.002 * stateMult)
      const arcSpan = s === 'idle' ? 0.08 : 0.25
      ctx.beginPath()
      ctx.arc(0, 0, stateArcR, -arcSpan, arcSpan)
      ctx.strokeStyle = `rgba(${ACC.r}, ${ACC.g}, ${ACC.b}, ${0.7 + pulse * 0.25})`
      ctx.lineWidth = 2.2
      ctx.stroke()
      ctx.restore()

      // ═════════════ WIREFRAME SPHERE ═════════════
      // Project + draw each line. Back-facing (z > 0) gets dimmer.
      const drawProjectedLine = (pts3: V3[], baseAlpha: number) => {
        ctx.beginPath()
        let started = false
        let lastAlpha = 0
        for (let i = 0; i < pts3.length; i++) {
          const rp = rot(pts3[i], rx, ry)
          const pr = project(rp)
          // depth: z<0 is front, z>0 is back
          const depth = (-rp.z / sphereR + 1) * 0.5    // 0 back, 1 front
          const alpha = baseAlpha * (0.15 + depth * 0.85)
          if (!started) {
            ctx.moveTo(pr.sx, pr.sy)
            started = true
          } else {
            // Draw segment with interpolated alpha per step
            ctx.strokeStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${alpha})`
            ctx.lineTo(pr.sx, pr.sy)
          }
          lastAlpha = alpha
        }
        // single stroke (approximation; for truly per-segment alpha we'd need many strokes)
        ctx.strokeStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${baseAlpha * 0.6})`
        ctx.lineWidth = 0.7
        ctx.stroke()
      }

      // Draw meridians (per-segment alpha for correct depth cueing)
      ctx.lineWidth = 0.8
      for (const line of meridianLines) {
        for (let i = 0; i < line.length - 1; i++) {
          const p1r = rot(line[i], rx, ry)
          const p2r = rot(line[i + 1], rx, ry)
          const p1 = project(p1r)
          const p2 = project(p2r)
          const avgZ = (p1r.z + p2r.z) / 2
          const depth = (-avgZ / sphereR + 1) * 0.5
          const alpha = 0.08 + depth * 0.55
          ctx.beginPath()
          ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy)
          ctx.strokeStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${alpha})`
          ctx.stroke()
        }
      }
      // Parallels (slightly dimmer)
      for (const line of parallelLines) {
        for (let i = 0; i < line.length - 1; i++) {
          const p1r = rot(line[i], rx, ry)
          const p2r = rot(line[i + 1], rx, ry)
          const p1 = project(p1r)
          const p2 = project(p2r)
          const avgZ = (p1r.z + p2r.z) / 2
          const depth = (-avgZ / sphereR + 1) * 0.5
          const alpha = 0.05 + depth * 0.40
          ctx.beginPath()
          ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy)
          ctx.strokeStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${alpha})`
          ctx.lineWidth = 0.6
          ctx.stroke()
        }
      }

      // ═════════════ NEURAL NETWORK (inside sphere) ═════════════
      // Update node activations
      for (let i = 0; i < nodes.length; i++) {
        nodes[i].nextFire--
        nodes[i].activation = Math.max(0, nodes[i].activation - 0.02)
        if (nodes[i].nextFire <= 0) {
          nodes[i].activation = 1
          nodes[i].nextFire = 100 + Math.random() * 300
          // propagate to neighbors with delay via edge strength
          for (const e of edges) {
            if (e.a === i || e.b === i) {
              e.strength = 1
            }
          }
        }
      }
      // Decay edge strength
      for (const e of edges) e.strength = Math.max(0, e.strength - 0.025)

      // Project all nodes
      const projNodes = nodes.map(n => {
        const r = rot({ x: n.x, y: n.y, z: n.z }, rx, ry)
        const pr = project(r)
        const depth = (-r.z / nodeSphereR + 1) * 0.5
        return { ...n, sx: pr.sx, sy: pr.sy, depth, projScale: pr.scale }
      })

      // Draw edges first (behind nodes)
      for (const e of edges) {
        const a = projNodes[e.a]
        const b = projNodes[e.b]
        const avgDepth = (a.depth + b.depth) / 2
        const baseAlpha = 0.03 + avgDepth * 0.12
        const activeBoost = e.strength * 0.5
        ctx.beginPath()
        ctx.moveTo(a.sx, a.sy)
        ctx.lineTo(b.sx, b.sy)
        ctx.strokeStyle = e.strength > 0.3
          ? `rgba(${WHITE.r}, ${WHITE.g}, ${WHITE.b}, ${baseAlpha + activeBoost})`
          : `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${baseAlpha + activeBoost})`
        ctx.lineWidth = 0.6 + e.strength * 1.2
        ctx.stroke()
      }

      // Sort nodes by depth (back first)
      projNodes.sort((a, b) => a.depth - b.depth)

      // Draw nodes
      for (const n of projNodes) {
        const r = n.r * n.projScale * (0.6 + n.depth * 0.7)
        const alpha = 0.25 + n.depth * 0.55 + n.activation * 0.3
        // glow
        const glow = ctx.createRadialGradient(n.sx, n.sy, 0, n.sx, n.sy, r * 4)
        glow.addColorStop(0, `rgba(${WHITE.r}, ${WHITE.g}, ${WHITE.b}, ${alpha})`)
        glow.addColorStop(1, `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, 0)`)
        ctx.beginPath(); ctx.arc(n.sx, n.sy, r * 4, 0, Math.PI * 2)
        ctx.fillStyle = glow; ctx.fill()
        // core
        ctx.beginPath(); ctx.arc(n.sx, n.sy, r, 0, Math.PI * 2)
        ctx.fillStyle = n.activation > 0.5
          ? `rgba(${ACC.r}, ${ACC.g}, ${ACC.b}, ${0.8 + n.activation * 0.2})`
          : `rgba(${WHITE.r}, ${WHITE.g}, ${WHITE.b}, ${0.5 + n.depth * 0.5})`
        ctx.fill()
      }

      // ═════════════ CORE NUCLEUS ═════════════
      const coreR = size * 0.045 + Math.sin(t * 0.05) * 3 * stateMult
      // large outer soft halo
      const haloGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 7)
      haloGrad.addColorStop(0, `rgba(120, 200, 255, ${0.25 + pulse * 0.18 * stateMult})`)
      haloGrad.addColorStop(0.3, `rgba(80, 160, 240, ${0.14 + pulse * 0.10 * stateMult})`)
      haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = haloGrad
      ctx.beginPath(); ctx.arc(cx, cy, coreR * 7, 0, Math.PI * 2); ctx.fill()
      // core
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR)
      core.addColorStop(0, `rgba(255, 255, 255, 1)`)
      core.addColorStop(0.5, `rgba(180, 230, 255, 0.95)`)
      core.addColorStop(1, `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, 0.4)`)
      ctx.fillStyle = core
      ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.fill()

      // ═════════════ DATA STREAMS (thin inward-flowing lines) ═════════════
      for (const stream of streams) {
        stream.progress += stream.speed * stateMult
        if (stream.progress > 1.2) {
          stream.angle = Math.random() * Math.PI * 2
          stream.progress = 0
          stream.speed = 0.003 + Math.random() * 0.007
        }
        const startR = size * 0.44
        const endR = coreR * 2
        const r = startR - (startR - endR) * stream.progress
        const tailR = startR - (startR - endR) * Math.max(0, stream.progress - 0.15)
        const x1 = cx + Math.cos(stream.angle) * r
        const y1 = cy + Math.sin(stream.angle) * r
        const x2 = cx + Math.cos(stream.angle) * tailR
        const y2 = cy + Math.sin(stream.angle) * tailR
        const grad = ctx.createLinearGradient(x1, y1, x2, y2)
        grad.addColorStop(0, `rgba(${ACC.r}, ${ACC.g}, ${ACC.b}, 0.9)`)
        grad.addColorStop(1, `rgba(${ACC.r}, ${ACC.g}, ${ACC.b}, 0)`)
        ctx.beginPath()
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2)
        ctx.strokeStyle = grad
        ctx.lineWidth = 1.4
        ctx.stroke()
        // head dot
        ctx.beginPath(); ctx.arc(x1, y1, 1.8, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${ACC.r}, ${ACC.g}, ${ACC.b}, 0.95)`
        ctx.fill()
      }

      // ═════════════ DECORATIVE CORNER BRACKETS ═════════════
      const cornerR = size * 0.5 - 8
      const cornerLen = 14
      ctx.strokeStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, 0.4)`
      ctx.lineWidth = 1
      for (const [dx, dy] of [[-1,-1],[1,-1],[-1,1],[1,1]] as [number,number][]) {
        const x = cx + dx * cornerR
        const y = cy + dy * cornerR
        ctx.beginPath()
        ctx.moveTo(x, y + dy * -cornerLen)
        ctx.lineTo(x, y)
        ctx.lineTo(x + dx * -cornerLen, y)
        ctx.stroke()
      }

      animId = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [size])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: size, height: size }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  )
}
