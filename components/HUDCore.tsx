'use client'
import { useEffect, useRef } from 'react'

type OrbState = 'idle' | 'thinking' | 'speaking' | 'listening'

/**
 * HUDCore v3 — maxed out complexity
 *
 * Layers (back to front):
 *   1. Ambient nebula glow + soft gradient fog
 *   2. Outer orbital rings (3 tilted elliptical paths with particles on them)
 *   3. Floating ambient particles (60+, slow drift)
 *   4. Geodesic icosahedron outer shell (triangulated faces with glow on front)
 *   5. Mid-layer wireframe sphere (meridians + parallels)
 *   6. Orbit particles — small dots on each ring
 *   7. Energy pulse rings (ripple outward every ~3s)
 *   8. Neural network cluster inside (42 nodes + synapse firings)
 *   9. Dense glowing core nucleus
 *  10. Inward-flowing data streams (yellow)
 *  11. Scanline sweep (subtle horizontal line moving down)
 *  12. Rotating hex glyphs at outer edge (data-like text)
 *  13. Chromatic aberration edge shimmer
 *  14. State indicator arc
 *  15. Corner brackets
 *
 * All canvas 2D. Mouse parallax. State-reactive.
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
    const sphereR = size * 0.38
    const shellR = size * 0.44
    const nodeSphereR = sphereR * 0.78
    const focal = size * 0.9

    // Mouse parallax
    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      const dx = (e.clientX - rect.left - size / 2) / (size / 2)
      const dy = (e.clientY - rect.top - size / 2) / (size / 2)
      mouseRef.current.target_x = Math.max(-1.8, Math.min(1.8, dx))
      mouseRef.current.target_y = Math.max(-1.8, Math.min(1.8, dy))
    }
    window.addEventListener('mousemove', onMouseMove)

    type V3 = { x: number; y: number; z: number }



    // ─── Inner wireframe sphere (meridians + parallels) ───
    const MERIDIANS = 14
    const PARALLELS = 9
    const PPL = 36
    const meridianLines: V3[][] = []
    const parallelLines: V3[][] = []
    for (let m = 0; m < MERIDIANS; m++) {
      const lineLon = (m / MERIDIANS) * Math.PI * 2
      const pts: V3[] = []
      for (let p = 0; p <= PPL; p++) {
        const lat = -Math.PI / 2 + (p / PPL) * Math.PI
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
      for (let p = 0; p <= PPL; p++) {
        const lon = (p / PPL) * Math.PI * 2
        pts.push({
          x: sphereR * Math.cos(lat) * Math.cos(lon),
          y: sphereR * Math.sin(lat),
          z: sphereR * Math.cos(lat) * Math.sin(lon),
        })
      }
      parallelLines.push(pts)
    }

    // ─── Second nested sphere (smaller, rotated differently for depth) ───
    const sphere2R = sphereR * 0.68
    const SPHERE2_LINES = 8
    const sphere2Meridians: V3[][] = []
    for (let m = 0; m < SPHERE2_LINES; m++) {
      const lineLon = (m / SPHERE2_LINES) * Math.PI * 2
      const pts: V3[] = []
      for (let p = 0; p <= PPL; p++) {
        const lat = -Math.PI / 2 + (p / PPL) * Math.PI
        pts.push({
          x: sphere2R * Math.cos(lat) * Math.cos(lineLon),
          y: sphere2R * Math.sin(lat),
          z: sphere2R * Math.cos(lat) * Math.sin(lineLon),
        })
      }
      sphere2Meridians.push(pts)
    }

    // ─── DNA double helix winding around main sphere ───
    const HELIX_TURNS = 3.5
    const HELIX_POINTS = 120
    const helixA: V3[] = []
    const helixB: V3[] = []
    for (let i = 0; i <= HELIX_POINTS; i++) {
      const t2 = i / HELIX_POINTS
      const angle = t2 * Math.PI * 2 * HELIX_TURNS
      const y = (t2 - 0.5) * sphereR * 2 * 0.95
      const circleR = Math.sqrt(Math.max(0, sphereR * sphereR - y * y)) * 1.02
      helixA.push({ x: Math.cos(angle) * circleR, y, z: Math.sin(angle) * circleR })
      helixB.push({ x: Math.cos(angle + Math.PI) * circleR, y, z: Math.sin(angle + Math.PI) * circleR })
    }

    // ─── Vertex intersection stars (meridian×parallel crossings) ───
    const vertexStars: V3[] = []
    for (let m = 0; m < MERIDIANS; m++) {
      const lon = (m / MERIDIANS) * Math.PI * 2
      for (let q = 1; q < PARALLELS; q++) {
        const lat = -Math.PI / 2 + (q / PARALLELS) * Math.PI
        vertexStars.push({
          x: sphereR * Math.cos(lat) * Math.cos(lon),
          y: sphereR * Math.sin(lat),
          z: sphereR * Math.cos(lat) * Math.sin(lon),
        })
      }
    }

    // ─── Pulsing cross-section rings inside sphere (horizontal slices) ───
    const crossRings: { lat: number; phase: number }[] = []
    for (let i = 0; i < 5; i++) {
      crossRings.push({ lat: -Math.PI/2 + (i+0.5)/5 * Math.PI, phase: i * 0.4 })
    }

    // ─── Neural nodes ───
    type Node = { x: number; y: number; z: number; r: number; activation: number; nextFire: number }
    const nodes: Node[] = []
    const NODE_COUNT = 85
    for (let i = 0; i < NODE_COUNT; i++) {
      let x = 0, y = 0, z = 0
      for (let t2 = 0; t2 < 20; t2++) {
        x = (Math.random()-0.5)*2; y = (Math.random()-0.5)*2; z = (Math.random()-0.5)*2
        if (x*x+y*y+z*z <= 1) break
      }
      nodes.push({ x: x*nodeSphereR, y: y*nodeSphereR, z: z*nodeSphereR,
        r: 1.3 + Math.random()*1.8, activation: Math.random()*0.3, nextFire: Math.random()*180 })
    }
    type NEdge = { a: number; b: number; strength: number }
    const nEdges: NEdge[] = []
    for (let i = 0; i < nodes.length; i++) {
      const dists = nodes.map((n,j) => {
        if (i===j) return { j, d: Infinity }
        const dx=nodes[i].x-n.x, dy=nodes[i].y-n.y, dz=nodes[i].z-n.z
        return { j, d: Math.sqrt(dx*dx+dy*dy+dz*dz) }
      }).sort((a,b)=>a.d-b.d)
      for (let k = 0; k < 4; k++) {
        const j = dists[k].j
        if (i < j) nEdges.push({ a: i, b: j, strength: 0 })
      }
    }

    // ─── Orbital rings (3 rings at different 3D tilts) ───
    type Orbit = { tiltX: number; tiltZ: number; r: number; speed: number; particleCount: number; phase: number }
    const orbits: Orbit[] = [
      { tiltX: 0.6,  tiltZ: 0.3,  r: shellR * 0.95, speed: 0.008,  particleCount: 1, phase: 0 },
      { tiltX: -0.4, tiltZ: 0.9,  r: shellR * 1.02, speed: -0.006, particleCount: 1, phase: Math.PI/3 },
      { tiltX: 0.9,  tiltZ: -0.5, r: shellR * 1.10, speed: 0.010,  particleCount: 1, phase: Math.PI/1.5 },
      { tiltX: 0.2,  tiltZ: 1.1,  r: shellR * 0.88, speed: -0.009, particleCount: 1, phase: Math.PI/2.1 },
      { tiltX: -1.1, tiltZ: 0.4,  r: shellR * 1.05, speed: 0.007,  particleCount: 1, phase: Math.PI/0.7 },
      { tiltX: 0.7,  tiltZ: -1.0, r: shellR * 0.98, speed: -0.011, particleCount: 1, phase: Math.PI/4.3 },
      { tiltX: -0.8, tiltZ: -0.3, r: shellR * 1.07, speed: 0.012,  particleCount: 1, phase: Math.PI/1.8 },
    ]

    // ─── Floating ambient particles (orbit randomly) ───
    type Particle = { angle: number; distance: number; speed: number; size: number; tiltX: number; tiltZ: number; phase: number }
    const particles: Particle[] = []
    for (let i = 0; i < 70; i++) {
      particles.push({
        angle: Math.random() * Math.PI * 2,
        distance: shellR * (0.6 + Math.random() * 0.5),
        speed: (Math.random() - 0.5) * 0.004,
        size: 0.6 + Math.random() * 1.2,
        tiltX: (Math.random() - 0.5) * 2,
        tiltZ: (Math.random() - 0.5) * 2,
        phase: Math.random() * Math.PI * 2,
      })
    }

    // ─── Energy pulse rings ───
    type Pulse = { progress: number; speed: number; alpha: number }
    const pulses: Pulse[] = []
    let nextPulseTime = 0

    // ─── Rotating glyphs (data-like text around outer edge) ───
    const GLYPHS = '01□△○◇★✦▲∞Σ∆Ω◊⬡⬢⬣'
    type Glyph = { char: string; angle: number }
    const glyphs: Glyph[] = []
    for (let i = 0; i < 24; i++) {
      glyphs.push({
        char: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
        angle: (i / 24) * Math.PI * 2,
      })
    }
    let glyphRefreshTimer = 0

    // Data streams
    type Stream = { angle: number; progress: number; speed: number }
    const streams: Stream[] = []
    for (let i = 0; i < 8; i++) {
      streams.push({
        angle: Math.random() * Math.PI * 2,
        progress: Math.random(),
        speed: 0.004 + Math.random() * 0.007,
      })
    }

    // ─── Traveling impulses on neural edges ───
    type Impulse = { edgeIdx: number; direction: 1 | -1; progress: number; speed: number }
    const impulses: Impulse[] = []

    // ─── Comets flying outside the sphere ───
    type Comet = { angle: number; r: number; speed: number; trail: {x:number;y:number;a:number}[]; life: number; maxLife: number; tiltX: number; tiltZ: number }
    const comets: Comet[] = []
    let nextCometTime = 60

    // ─── Energy arcs between random particle pairs (brief flashes) ───
    type Arc = { pA: number; pB: number; life: number }
    const arcs: Arc[] = []
    let nextArcTime = 90

    // Rotation
    const rot = (p: V3, rx: number, ry: number): V3 => {
      let x = p.x * Math.cos(ry) + p.z * Math.sin(ry)
      let z = -p.x * Math.sin(ry) + p.z * Math.cos(ry)
      let y = p.y
      const y2 = y * Math.cos(rx) - z * Math.sin(rx)
      const z2 = y * Math.sin(rx) + z * Math.cos(rx)
      return { x, y: y2, z: z2 }
    }
    const project = (p: V3) => {
      const scale = focal / (focal + p.z)
      return { sx: cx + p.x * scale, sy: cy + p.y * scale, scale }
    }

    const CYAN  = { r: 100, g: 200, b: 255 }
    const DEEP  = { r:  60, g: 130, b: 220 }
    const ACC   = { r: 255, g: 215, b:  60 }
    const WHITE = { r: 230, g: 245, b: 255 }
    const MAGENTA = { r: 200, g: 100, b: 220 }

    let t = 0
    let animId: number

    const draw = () => {
      t += 1
      ctx.clearRect(0, 0, size, size)

      mouseRef.current.x += (mouseRef.current.target_x - mouseRef.current.x) * 0.05
      mouseRef.current.y += (mouseRef.current.target_y - mouseRef.current.y) * 0.05

      const s = stateRef.current
      const stateMult = s === 'idle' ? 1.0 : s === 'thinking' ? 1.5 : s === 'speaking' ? 1.8 : 1.3
      const pulse = (Math.sin(t * 0.025) + 1) * 0.5
      const pulseFast = (Math.sin(t * 0.08) + 1) * 0.5

      const ry = t * 0.0028 + mouseRef.current.x * 0.5
      const rx = -0.32 + mouseRef.current.y * -0.35

      // ═══ LAYER 1: AMBIENT NEBULA ═══
      const ambient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.36)
      ambient.addColorStop(0, `rgba(${DEEP.r}, ${DEEP.g}, ${DEEP.b}, ${0.13 + pulse * 0.08})`)
      ambient.addColorStop(0.3, `rgba(${MAGENTA.r}, 80, 180, ${0.04 + pulse * 0.03})`)
      ambient.addColorStop(0.6, `rgba(40, 80, 140, ${0.05 + pulse * 0.02})`)
      ambient.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = ambient
      ctx.fillRect(0, 0, size, size)

      // ═══ LAYER 2: ORBITAL RINGS (behind sphere) ═══
      for (const orb of orbits) {
        orb.phase += orb.speed * stateMult
        ctx.save()
        ctx.translate(cx, cy)
        // Project ellipse manually by sampling
        ctx.beginPath()
        for (let i = 0; i <= 64; i++) {
          const a = (i / 64) * Math.PI * 2
          const px = Math.cos(a) * orb.r
          const pz = Math.sin(a) * orb.r
          const p3: V3 = { x: px, y: 0, z: pz }
          // tilt
          const tx = p3.x, ty = p3.y * Math.cos(orb.tiltX) - p3.z * Math.sin(orb.tiltX), tz = p3.y * Math.sin(orb.tiltX) + p3.z * Math.cos(orb.tiltX)
          const tx2 = tx * Math.cos(orb.tiltZ) - ty * Math.sin(orb.tiltZ), ty2 = tx * Math.sin(orb.tiltZ) + ty * Math.cos(orb.tiltZ), tz2 = tz
          const rotated = rot({ x: tx2, y: ty2, z: tz2 }, rx, ry)
          const prj = project(rotated)
          const px2 = prj.sx - cx, py2 = prj.sy - cy
          if (i === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2)
        }
        ctx.closePath()
        ctx.strokeStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, 0.22)`
        ctx.lineWidth = 0.8
        ctx.stroke()
        ctx.restore()

        // Draw particle on orbit
        const p3: V3 = { x: Math.cos(orb.phase) * orb.r, y: 0, z: Math.sin(orb.phase) * orb.r }
        const tx = p3.x, ty = p3.y * Math.cos(orb.tiltX) - p3.z * Math.sin(orb.tiltX), tz = p3.y * Math.sin(orb.tiltX) + p3.z * Math.cos(orb.tiltX)
        const tx2 = tx * Math.cos(orb.tiltZ) - ty * Math.sin(orb.tiltZ), ty2 = tx * Math.sin(orb.tiltZ) + ty * Math.cos(orb.tiltZ), tz2 = tz
        const rotated = rot({ x: tx2, y: ty2, z: tz2 }, rx, ry)
        const prj = project(rotated)
        const depth = (-rotated.z / orb.r + 1) * 0.5
        const r = 2.5 + depth * 1.5
        const g = ctx.createRadialGradient(prj.sx, prj.sy, 0, prj.sx, prj.sy, r * 4)
        g.addColorStop(0, `rgba(${ACC.r}, ${ACC.g}, ${ACC.b}, ${0.9 * (0.4 + depth * 0.6)})`)
        g.addColorStop(1, `rgba(${ACC.r}, ${ACC.g}, ${ACC.b}, 0)`)
        ctx.beginPath(); ctx.arc(prj.sx, prj.sy, r * 4, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
        ctx.beginPath(); ctx.arc(prj.sx, prj.sy, r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${ACC.r}, ${ACC.g}, ${ACC.b}, ${0.5 + depth * 0.5})`
        ctx.fill()
      }

      // ═══ LAYER 3: FLOATING AMBIENT PARTICLES ═══
      for (const p of particles) {
        p.angle += p.speed * stateMult
        const px = Math.cos(p.angle) * p.distance
        const pz = Math.sin(p.angle) * p.distance
        const py = Math.sin(p.phase + t * 0.01) * p.distance * 0.1
        const tx = px, ty = py * Math.cos(p.tiltX) - pz * Math.sin(p.tiltX), tz = py * Math.sin(p.tiltX) + pz * Math.cos(p.tiltX)
        const rotated = rot({ x: tx, y: ty, z: tz }, rx, ry)
        const prj = project(rotated)
        const depth = (-rotated.z / p.distance + 1) * 0.5
        const r = p.size * (0.5 + depth * 0.8)
        const alpha = 0.15 + depth * 0.45
        ctx.beginPath(); ctx.arc(prj.sx, prj.sy, r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${WHITE.r}, ${WHITE.g}, ${WHITE.b}, ${alpha})`
        ctx.fill()
      }

      // ═══ LAYER 5: INNER WIREFRAME SPHERE ═══
      for (const line of meridianLines) {
        for (let i = 0; i < line.length - 1; i++) {
          const p1 = rot(line[i], rx, ry), p2 = rot(line[i+1], rx, ry)
          const pr1 = project(p1), pr2 = project(p2)
          const avgZ = (p1.z + p2.z) / 2
          const depth = (-avgZ / sphereR + 1) * 0.5
          const alpha = 0.08 + depth * 0.50
          ctx.beginPath()
          ctx.moveTo(pr1.sx, pr1.sy); ctx.lineTo(pr2.sx, pr2.sy)
          ctx.strokeStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${alpha})`
          ctx.lineWidth = 0.7
          ctx.stroke()
        }
      }
      for (const line of parallelLines) {
        for (let i = 0; i < line.length - 1; i++) {
          const p1 = rot(line[i], rx, ry), p2 = rot(line[i+1], rx, ry)
          const pr1 = project(p1), pr2 = project(p2)
          const avgZ = (p1.z + p2.z) / 2
          const depth = (-avgZ / sphereR + 1) * 0.5
          const alpha = 0.05 + depth * 0.35
          ctx.beginPath()
          ctx.moveTo(pr1.sx, pr1.sy); ctx.lineTo(pr2.sx, pr2.sy)
          ctx.strokeStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${alpha})`
          ctx.lineWidth = 0.5
          ctx.stroke()
        }
      }

      // ═══ LAYER 5b: SECOND NESTED SPHERE (counter-rotating for depth) ═══
      const ry2 = -t * 0.0045 + mouseRef.current.x * 0.3
      const rx2 = 0.2 + mouseRef.current.y * -0.2
      for (const line of sphere2Meridians) {
        for (let i = 0; i < line.length - 1; i++) {
          const p1 = rot(line[i], rx2, ry2), p2 = rot(line[i+1], rx2, ry2)
          const pr1 = project(p1), pr2 = project(p2)
          const avgZ = (p1.z + p2.z) / 2
          const depth = (-avgZ / sphere2R + 1) * 0.5
          const alpha = 0.07 + depth * 0.35
          ctx.beginPath()
          ctx.moveTo(pr1.sx, pr1.sy); ctx.lineTo(pr2.sx, pr2.sy)
          ctx.strokeStyle = `rgba(${MAGENTA.r}, ${MAGENTA.g}, ${MAGENTA.b}, ${alpha})`
          ctx.lineWidth = 0.5
          ctx.stroke()
        }
      }

      // ═══ LAYER 5c: DNA HELIX STRANDS ═══
      // Use rotated helix following main sphere rotation
      const ryh = t * 0.0035 + mouseRef.current.x * 0.5
      const rxh = -0.32 + mouseRef.current.y * -0.35
      const drawHelix = (pts: V3[], color: {r:number;g:number;b:number}) => {
        for (let i = 0; i < pts.length - 1; i++) {
          const p1 = rot(pts[i], rxh, ryh), p2 = rot(pts[i+1], rxh, ryh)
          const pr1 = project(p1), pr2 = project(p2)
          const avgZ = (p1.z + p2.z) / 2
          const depth = (-avgZ / sphereR + 1) * 0.5
          const alpha = 0.15 + depth * 0.55
          ctx.beginPath()
          ctx.moveTo(pr1.sx, pr1.sy); ctx.lineTo(pr2.sx, pr2.sy)
          ctx.strokeStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`
          ctx.lineWidth = 1.0
          ctx.stroke()
        }
      }
      drawHelix(helixA, ACC)
      drawHelix(helixB, { r: 180, g: 100, b: 255 })  // violet strand

      // Helix connecting rungs (every 8th point)
      for (let i = 0; i < helixA.length; i += 8) {
        const a = rot(helixA[i], rxh, ryh)
        const b = rot(helixB[i], rxh, ryh)
        const prA = project(a), prB = project(b)
        const depth = (-(a.z + b.z)/2 / sphereR + 1) * 0.5
        ctx.beginPath()
        ctx.moveTo(prA.sx, prA.sy); ctx.lineTo(prB.sx, prB.sy)
        ctx.strokeStyle = `rgba(${WHITE.r}, ${WHITE.g}, ${WHITE.b}, ${0.08 + depth * 0.18})`
        ctx.lineWidth = 0.4
        ctx.stroke()
      }

      // ═══ LAYER 5d: VERTEX STARS (bright points at meridian×parallel) ═══
      for (const v of vertexStars) {
        const r = rot(v, rx, ry)
        const pr = project(r)
        const depth = (-r.z / sphereR + 1) * 0.5
        const sr = 1.2 + depth * 1.3
        const alpha = 0.35 + depth * 0.55
        const g = ctx.createRadialGradient(pr.sx, pr.sy, 0, pr.sx, pr.sy, sr * 3)
        g.addColorStop(0, `rgba(${WHITE.r}, ${WHITE.g}, ${WHITE.b}, ${alpha})`)
        g.addColorStop(1, `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, 0)`)
        ctx.beginPath(); ctx.arc(pr.sx, pr.sy, sr * 3, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
        ctx.beginPath(); ctx.arc(pr.sx, pr.sy, sr * 0.6, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${WHITE.r}, ${WHITE.g}, ${WHITE.b}, ${alpha + 0.15})`
        ctx.fill()
      }

      // ═══ LAYER 5e: PULSING CROSS-SECTION RINGS (horizontal slices inside sphere) ═══
      for (const ring of crossRings) {
        ring.phase += 0.018 * stateMult
        const ringPulse = (Math.sin(ring.phase) + 1) * 0.5
        const circleR = sphereR * Math.cos(ring.lat)
        const yOff = sphereR * Math.sin(ring.lat)
        const pts: V3[] = []
        for (let i = 0; i <= 32; i++) {
          const a = (i / 32) * Math.PI * 2
          pts.push({ x: Math.cos(a) * circleR, y: yOff, z: Math.sin(a) * circleR })
        }
        ctx.beginPath()
        for (let i = 0; i < pts.length; i++) {
          const r = rot(pts[i], rx, ry)
          const pr = project(r)
          if (i === 0) ctx.moveTo(pr.sx, pr.sy); else ctx.lineTo(pr.sx, pr.sy)
        }
        ctx.strokeStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${0.12 + ringPulse * 0.38})`
        ctx.lineWidth = 0.8 + ringPulse * 0.8
        ctx.stroke()
      }

      // ═══ LAYER 5f: RADIAL SUN-BURST RAYS FROM CORE (subtle) ═══
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(t * 0.0015)
      const rayCount = 48
      for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * Math.PI * 2
        const len = size * 0.14 + Math.sin(t * 0.04 + i) * 8
        const x2 = Math.cos(angle) * len
        const y2 = Math.sin(angle) * len
        const grad = ctx.createLinearGradient(0, 0, x2, y2)
        grad.addColorStop(0, `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${0.25 + pulseFast * 0.1})`)
        grad.addColorStop(1, `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, 0)`)
        ctx.beginPath()
        ctx.moveTo(0, 0); ctx.lineTo(x2, y2)
        ctx.strokeStyle = grad
        ctx.lineWidth = 0.4
        ctx.stroke()
      }
      ctx.restore()

      // ═══ LAYER 7: ENERGY PULSE RINGS ═══
      if (t > nextPulseTime) {
        pulses.push({ progress: 0, speed: 0.012, alpha: 0.6 })
        nextPulseTime = t + 160 + Math.random() * 80
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]
        p.progress += p.speed * stateMult
        p.alpha = 0.6 * (1 - p.progress)
        if (p.progress >= 1) { pulses.splice(i, 1); continue }
        const r = sphereR * 0.3 + p.progress * sphereR * 2.0
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${p.alpha})`
        ctx.lineWidth = 1.5 * (1 - p.progress * 0.5)
        ctx.stroke()
      }

      // ═══ LAYER 8: NEURAL NETWORK ═══
      for (let i = 0; i < nodes.length; i++) {
        nodes[i].nextFire--
        nodes[i].activation = Math.max(0, nodes[i].activation - 0.02)
        if (nodes[i].nextFire <= 0) {
          nodes[i].activation = 1
          nodes[i].nextFire = 50 + Math.random() * 180  // fire more often
          for (let ei = 0; ei < nEdges.length; ei++) {
            const e = nEdges[ei]
            if (e.a === i) {
              e.strength = 1
              impulses.push({ edgeIdx: ei, direction: 1, progress: 0, speed: 0.02 + Math.random() * 0.025 })
            } else if (e.b === i) {
              e.strength = 1
              impulses.push({ edgeIdx: ei, direction: -1, progress: 0, speed: 0.02 + Math.random() * 0.025 })
            }
          }
        }
      }
      for (const e of nEdges) e.strength = Math.max(0, e.strength - 0.025)

      const projNodes = nodes.map(n => {
        const r = rot({ x: n.x, y: n.y, z: n.z }, rx, ry)
        const pr = project(r)
        const depth = (-r.z / nodeSphereR + 1) * 0.5
        return { ...n, sx: pr.sx, sy: pr.sy, depth, projScale: pr.scale }
      })
      for (const e of nEdges) {
        const a = projNodes[e.a], b = projNodes[e.b]
        const avgDepth = (a.depth + b.depth) / 2
        const baseAlpha = 0.04 + avgDepth * 0.14
        const activeBoost = e.strength * 0.55
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy)
        ctx.strokeStyle = e.strength > 0.3
          ? `rgba(${WHITE.r}, ${WHITE.g}, ${WHITE.b}, ${baseAlpha + activeBoost})`
          : `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, ${baseAlpha + activeBoost})`
        ctx.lineWidth = 0.5 + e.strength * 1.3
        ctx.stroke()
      }
      // Advance + draw traveling impulses
      for (let ii = impulses.length - 1; ii >= 0; ii--) {
        const imp = impulses[ii]
        imp.progress += imp.speed * stateMult
        if (imp.progress >= 1) { impulses.splice(ii, 1); continue }
        const e = nEdges[imp.edgeIdx]
        const nA = projNodes[e.a], nB = projNodes[e.b]
        const fromA = imp.direction === 1
        const tProg = imp.progress
        const sx = fromA ? nA.sx + (nB.sx - nA.sx) * tProg : nB.sx + (nA.sx - nB.sx) * tProg
        const sy = fromA ? nA.sy + (nB.sy - nA.sy) * tProg : nB.sy + (nA.sy - nB.sy) * tProg
        const depth = (nA.depth + nB.depth) / 2
        const r = 1.5 + depth * 1.5
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 4)
        g.addColorStop(0, `rgba(${ACC.r}, ${ACC.g}, ${ACC.b}, 0.95)`)
        g.addColorStop(1, `rgba(${ACC.r}, ${ACC.g}, ${ACC.b}, 0)`)
        ctx.beginPath(); ctx.arc(sx, sy, r * 4, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${ACC.r}, ${ACC.g}, ${ACC.b}, 0.95)`
        ctx.fill()
      }

      projNodes.sort((a, b) => a.depth - b.depth)
      for (const n of projNodes) {
        const r = n.r * n.projScale * (0.6 + n.depth * 0.7)
        const alpha = 0.3 + n.depth * 0.5 + n.activation * 0.3
        const glow = ctx.createRadialGradient(n.sx, n.sy, 0, n.sx, n.sy, r * 4)
        glow.addColorStop(0, `rgba(${WHITE.r}, ${WHITE.g}, ${WHITE.b}, ${alpha})`)
        glow.addColorStop(1, `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, 0)`)
        ctx.beginPath(); ctx.arc(n.sx, n.sy, r * 4, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill()
        ctx.beginPath(); ctx.arc(n.sx, n.sy, r, 0, Math.PI * 2)
        ctx.fillStyle = n.activation > 0.5
          ? `rgba(${ACC.r}, ${ACC.g}, ${ACC.b}, ${0.85 + n.activation * 0.15})`
          : `rgba(${WHITE.r}, ${WHITE.g}, ${WHITE.b}, ${0.5 + n.depth * 0.5})`
        ctx.fill()
      }

      // ═══ LAYER 9: CORE NUCLEUS ═══
      const coreR = size * 0.05 + Math.sin(t * 0.05) * 3 * stateMult
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 8)
      halo.addColorStop(0, `rgba(140, 210, 255, ${0.3 + pulse * 0.2 * stateMult})`)
      halo.addColorStop(0.3, `rgba(80, 160, 240, ${0.15 + pulse * 0.1 * stateMult})`)
      halo.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = halo
      ctx.beginPath(); ctx.arc(cx, cy, coreR * 8, 0, Math.PI * 2); ctx.fill()
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR)
      core.addColorStop(0, 'rgba(255,255,255,1)')
      core.addColorStop(0.5, 'rgba(180,230,255,0.95)')
      core.addColorStop(1, `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, 0.4)`)
      ctx.fillStyle = core
      ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.fill()

      // ═══ LAYER 10: DATA STREAMS ═══
      for (const stream of streams) {
        stream.progress += stream.speed * stateMult
        if (stream.progress > 1.2) {
          stream.angle = Math.random() * Math.PI * 2
          stream.progress = 0
          stream.speed = 0.003 + Math.random() * 0.007
        }
        const startR = size * 0.36, endR = coreR * 2
        const r = startR - (startR - endR) * stream.progress
        const tailR = startR - (startR - endR) * Math.max(0, stream.progress - 0.18)
        const x1 = cx + Math.cos(stream.angle) * r
        const y1 = cy + Math.sin(stream.angle) * r
        const x2 = cx + Math.cos(stream.angle) * tailR
        const y2 = cy + Math.sin(stream.angle) * tailR
        const grad = ctx.createLinearGradient(x1, y1, x2, y2)
        grad.addColorStop(0, `rgba(${ACC.r}, ${ACC.g}, ${ACC.b}, 0.95)`)
        grad.addColorStop(1, `rgba(${ACC.r}, ${ACC.g}, ${ACC.b}, 0)`)
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2)
        ctx.strokeStyle = grad; ctx.lineWidth = 1.4; ctx.stroke()
        ctx.beginPath(); ctx.arc(x1, y1, 1.8, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${ACC.r}, ${ACC.g}, ${ACC.b}, 0.95)`; ctx.fill()
      }

      // ═══ LAYER 13: CHROMATIC ABERRATION EDGE SHIMMER ═══
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      const chroma = ctx.createRadialGradient(cx, cy, size * 0.28, cx, cy, size * 0.42)
      chroma.addColorStop(0, 'rgba(0,0,0,0)')
      chroma.addColorStop(0.7, `rgba(255, 60, 150, ${0.015 + pulseFast * 0.015})`)
      chroma.addColorStop(1, `rgba(100, 220, 255, ${0.02 + pulseFast * 0.015})`)
      ctx.fillStyle = chroma
      ctx.fillRect(0, 0, size, size)
      ctx.restore()

      // ═══ LAYER 14: STATE INDICATOR ARC ═══
      const stateArcR = size * 0.38
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(t * 0.0025 * stateMult)
      const arcSpan = s === 'idle' ? 0.10 : 0.30
      ctx.beginPath()
      ctx.arc(0, 0, stateArcR, -arcSpan, arcSpan)
      ctx.strokeStyle = `rgba(${ACC.r}, ${ACC.g}, ${ACC.b}, ${0.7 + pulse * 0.25})`
      ctx.lineWidth = 2.5
      ctx.stroke()
      // glow endpoints
      for (const a of [-arcSpan, arcSpan]) {
        const px = Math.cos(a) * stateArcR, py = Math.sin(a) * stateArcR
        const g = ctx.createRadialGradient(px, py, 0, px, py, 8)
        g.addColorStop(0, `rgba(${ACC.r}, ${ACC.g}, ${ACC.b}, 1)`)
        g.addColorStop(1, `rgba(${ACC.r}, ${ACC.g}, ${ACC.b}, 0)`)
        ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
      }
      ctx.restore()


      // ═══ LAYER X: COMETS (flying outside orbits) ═══
      nextCometTime--
      if (nextCometTime <= 0 && comets.length < 4) {
        comets.push({
          angle: Math.random() * Math.PI * 2,
          r: shellR * (1.0 + Math.random() * 0.15),
          speed: 0.012 + Math.random() * 0.012,
          trail: [],
          life: 0,
          maxLife: 60 + Math.random() * 80,
          tiltX: (Math.random() - 0.5) * 2,
          tiltZ: (Math.random() - 0.5) * 2,
        })
        nextCometTime = 50 + Math.random() * 120
      }
      for (let ci = comets.length - 1; ci >= 0; ci--) {
        const c = comets[ci]
        c.life++
        c.angle += c.speed * stateMult
        if (c.life >= c.maxLife) { comets.splice(ci, 1); continue }
        const px = Math.cos(c.angle) * c.r
        const pz = Math.sin(c.angle) * c.r
        const py = Math.sin(c.life * 0.03) * c.r * 0.08
        const tx = px, ty = py * Math.cos(c.tiltX) - pz * Math.sin(c.tiltX), tz = py * Math.sin(c.tiltX) + pz * Math.cos(c.tiltX)
        const rotated = rot({ x: tx, y: ty, z: tz }, rx, ry)
        const prj = project(rotated)
        c.trail.push({ x: prj.sx, y: prj.sy, a: 1 })
        if (c.trail.length > 18) c.trail.shift()
        // Draw trail
        for (let ti = 0; ti < c.trail.length - 1; ti++) {
          const t1 = c.trail[ti], t2 = c.trail[ti + 1]
          const fade = (ti / c.trail.length) * (1 - c.life / c.maxLife)
          ctx.beginPath()
          ctx.moveTo(t1.x, t1.y); ctx.lineTo(t2.x, t2.y)
          ctx.strokeStyle = `rgba(${WHITE.r}, ${WHITE.g}, ${WHITE.b}, ${fade * 0.7})`
          ctx.lineWidth = 1.2 * fade
          ctx.stroke()
        }
        // head
        const headAlpha = 1 - c.life / c.maxLife
        const g = ctx.createRadialGradient(prj.sx, prj.sy, 0, prj.sx, prj.sy, 6)
        g.addColorStop(0, `rgba(${WHITE.r}, ${WHITE.g}, ${WHITE.b}, ${0.9 * headAlpha})`)
        g.addColorStop(1, `rgba(${CYAN.r}, ${CYAN.g}, ${CYAN.b}, 0)`)
        ctx.beginPath(); ctx.arc(prj.sx, prj.sy, 6, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill()
        ctx.beginPath(); ctx.arc(prj.sx, prj.sy, 1.5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${WHITE.r}, ${WHITE.g}, ${WHITE.b}, ${headAlpha})`
        ctx.fill()
      }

      // ═══ LAYER Y: ENERGY ARCS (brief lightning between random particle pairs) ═══
      nextArcTime--
      if (nextArcTime <= 0 && arcs.length < 2) {
        const pA = Math.floor(Math.random() * particles.length)
        let pB = Math.floor(Math.random() * particles.length)
        if (pB === pA) pB = (pB + 1) % particles.length
        arcs.push({ pA, pB, life: 0 })
        nextArcTime = 120 + Math.random() * 180
      }
      for (let ai = arcs.length - 1; ai >= 0; ai--) {
        const a = arcs[ai]
        a.life++
        if (a.life > 20) { arcs.splice(ai, 1); continue }
        const fade = 1 - a.life / 20
        const pA = particles[a.pA], pB = particles[a.pB]
        const projP = (p: typeof pA) => {
          const px = Math.cos(p.angle) * p.distance
          const pz = Math.sin(p.angle) * p.distance
          const py = Math.sin(p.phase + t * 0.01) * p.distance * 0.1
          const tx = px, ty = py * Math.cos(p.tiltX) - pz * Math.sin(p.tiltX), tz = py * Math.sin(p.tiltX) + pz * Math.cos(p.tiltX)
          const rotated = rot({ x: tx, y: ty, z: tz }, rx, ry)
          return project(rotated)
        }
        const aP = projP(pA), bP = projP(pB)
        // Zigzag lightning path
        ctx.beginPath()
        ctx.moveTo(aP.sx, aP.sy)
        const segs = 6
        for (let i = 1; i < segs; i++) {
          const tt = i / segs
          const mx = aP.sx + (bP.sx - aP.sx) * tt + (Math.random() - 0.5) * 10
          const my = aP.sy + (bP.sy - aP.sy) * tt + (Math.random() - 0.5) * 10
          ctx.lineTo(mx, my)
        }
        ctx.lineTo(bP.sx, bP.sy)
        ctx.strokeStyle = `rgba(${WHITE.r}, ${WHITE.g}, ${WHITE.b}, ${0.7 * fade})`
        ctx.lineWidth = 0.8
        ctx.stroke()
      }

      // ═══ FINAL MASK: clip everything to a soft circle (destination-in) ═══
      // This guarantees no visible rectangular canvas edge.
      ctx.save()
      ctx.globalCompositeOperation = 'destination-in'
      const maskGrad = ctx.createRadialGradient(cx, cy, size * 0.20, cx, cy, size * 0.48)
      maskGrad.addColorStop(0, 'rgba(0,0,0,1)')
      maskGrad.addColorStop(0.65, 'rgba(0,0,0,1)')
      maskGrad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = maskGrad
      ctx.fillRect(0, 0, size, size)
      ctx.restore()

      animId = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [size])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: size, height: size, background: 'transparent' }}>
      <canvas ref={canvasRef} style={{ display: 'block', background: 'transparent' }} />
    </div>
  )
}
