'use client'
import { useEffect, useRef } from 'react'

type OrbState = 'idle' | 'thinking' | 'speaking' | 'listening'

export default function OrenCore3D({ orbState = 'idle', size = 460 }: { orbState?: OrbState; size?: number }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef(orbState)
  stateRef.current = orbState

  useEffect(() => {
    let THREE: any
    let renderer: any, scene: any, camera: any
    let animId: number
    const mount = mountRef.current
    if (!mount) return

    let disposed = false

    ;(async () => {
      THREE = await import('three')
      if (disposed) return

      // ─── Scene ────────────────────────────────────────────
      scene = new THREE.Scene()
      camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
      camera.position.set(0, 0, 8)

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setSize(size, size)
      renderer.setPixelRatio(window.devicePixelRatio)
      renderer.setClearColor(0x000000, 0)
      mount.appendChild(renderer.domElement)

      // ─── Inner Core (glowing sphere) ──────────────────────
      const coreGeom = new THREE.IcosahedronGeometry(0.9, 4)
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0x80c0ff,
        transparent: true,
        opacity: 0.95,
      })
      const core = new THREE.Mesh(coreGeom, coreMat)
      scene.add(core)

      // ─── Wireframe inner ──────────────────────────────────
      const wire1 = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.05, 1),
        new THREE.MeshBasicMaterial({
          color: 0xa0d0ff, wireframe: true, transparent: true, opacity: 0.5,
        })
      )
      scene.add(wire1)

      // ─── Wireframe middle ─────────────────────────────────
      const wire2 = new THREE.Mesh(
        new THREE.OctahedronGeometry(1.5, 2),
        new THREE.MeshBasicMaterial({
          color: 0x6090ff, wireframe: true, transparent: true, opacity: 0.35,
        })
      )
      scene.add(wire2)

      // ─── Wireframe outer ──────────────────────────────────
      const wire3 = new THREE.Mesh(
        new THREE.IcosahedronGeometry(2.0, 1),
        new THREE.MeshBasicMaterial({
          color: 0x4070dd, wireframe: true, transparent: true, opacity: 0.22,
        })
      )
      scene.add(wire3)

      // ─── Rotating Rings ───────────────────────────────────
      const ring1 = new THREE.Mesh(
        new THREE.TorusGeometry(1.8, 0.012, 8, 80),
        new THREE.MeshBasicMaterial({ color: 0x80c0ff, transparent: true, opacity: 0.4 })
      )
      scene.add(ring1)

      const ring2 = new THREE.Mesh(
        new THREE.TorusGeometry(2.2, 0.008, 8, 80),
        new THREE.MeshBasicMaterial({ color: 0x6090ff, transparent: true, opacity: 0.30 })
      )
      ring2.rotation.x = Math.PI / 2.4
      scene.add(ring2)

      const ring3 = new THREE.Mesh(
        new THREE.TorusGeometry(2.5, 0.006, 8, 80),
        new THREE.MeshBasicMaterial({ color: 0x4070dd, transparent: true, opacity: 0.25 })
      )
      ring3.rotation.x = Math.PI / 1.5
      ring3.rotation.y = Math.PI / 3
      scene.add(ring3)

      // ─── Particle field around core ───────────────────────
      const particleCount = 900
      const positions = new Float32Array(particleCount * 3)
      const speeds: number[] = []
      const radii: number[] = []
      const angles: number[] = []
      const phases: number[] = []
      for (let i = 0; i < particleCount; i++) {
        const r = 1.8 + Math.random() * 2.6
        const a = Math.random() * Math.PI * 2
        const tilt = (Math.random() - 0.5) * Math.PI
        radii.push(r)
        angles.push(a)
        speeds.push((Math.random() > 0.5 ? 1 : -1) * (0.002 + Math.random() * 0.005))
        phases.push(Math.random() * Math.PI * 2)
        positions[i*3]   = Math.cos(a) * r
        positions[i*3+1] = Math.sin(tilt) * r * 0.5
        positions[i*3+2] = Math.sin(a) * r * Math.cos(tilt)
      }
      const pGeom = new THREE.BufferGeometry()
      pGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      const pMat = new THREE.PointsMaterial({
        color: 0x80c0ff,
        size: 0.045,
        transparent: true,
        opacity: 0.85,
        sizeAttenuation: true,
      })
      const points = new THREE.Points(pGeom, pMat)
      scene.add(points)

      // ─── Energy connection lines (random arcs) ────────────
      const lineGroup = new THREE.Group()
      scene.add(lineGroup)
      const lineCount = 18
      const lineMats: any[] = []
      for (let i = 0; i < lineCount; i++) {
        const a1 = Math.random() * Math.PI * 2
        const a2 = a1 + (Math.random() - 0.5) * 1.6
        const r = 1.9 + Math.random() * 0.4
        const p1 = new THREE.Vector3(Math.cos(a1)*r, (Math.random()-0.5)*1.4, Math.sin(a1)*r)
        const p2 = new THREE.Vector3(Math.cos(a2)*r, (Math.random()-0.5)*1.4, Math.sin(a2)*r)
        const mid = new THREE.Vector3().addVectors(p1,p2).multiplyScalar(0.5)
        mid.normalize().multiplyScalar(0.8 + Math.random()*0.6)
        const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2)
        const pts = curve.getPoints(30)
        const g = new THREE.BufferGeometry().setFromPoints(pts)
        const m = new THREE.LineBasicMaterial({
          color: 0x60a0ff, transparent: true, opacity: 0.0,
        })
        lineMats.push({ mat: m, phase: Math.random()*Math.PI*2 })
        const line = new THREE.Line(g, m)
        lineGroup.add(line)
      }

      // ─── Animation loop ───────────────────────────────────
      let t = 0
      const stateColors: any = {
        idle:      { core: 0x80c0ff, wire: 0xa0d0ff, glow: 1.0 },
        thinking:  { core: 0xa080ff, wire: 0xc0a0ff, glow: 1.4 },
        speaking:  { core: 0x60e0c0, wire: 0x80f0d0, glow: 1.5 },
        listening: { core: 0xffa060, wire: 0xffc080, glow: 1.6 },
      }

      const animate = () => {
        t += 0.016
        const s = stateRef.current
        const sc = stateColors[s]
        const mult = s === 'idle' ? 1.0 : 1.3

        // core breathing
        const breath = 1 + Math.sin(t * 1.2) * 0.04 * mult
        core.scale.setScalar(breath)
        coreMat.color.setHex(sc.core)
        coreMat.opacity = 0.9 + Math.sin(t * 2) * 0.05

        wire1.rotation.x += 0.003 * mult
        wire1.rotation.y += 0.004 * mult
        wire2.rotation.x -= 0.002 * mult
        wire2.rotation.z += 0.003 * mult
        wire3.rotation.y += 0.0015 * mult
        wire3.rotation.x += 0.001 * mult

        ring1.rotation.z += 0.005 * mult
        ring2.rotation.z -= 0.004 * mult
        ring3.rotation.z += 0.003 * mult
        ring1.rotation.x = Math.sin(t * 0.3) * 0.2
        ring2.rotation.y = Math.cos(t * 0.4) * 0.3

        // particles orbiting
        const arr = pGeom.attributes.position.array as Float32Array
        for (let i = 0; i < particleCount; i++) {
          angles[i] += speeds[i] * mult
          const r = radii[i] + Math.sin(t * 0.5 + phases[i]) * 0.05
          const tilt = Math.sin(angles[i] * 0.7 + phases[i]) * 0.4
          arr[i*3]   = Math.cos(angles[i]) * r
          arr[i*3+1] = Math.sin(tilt) * r * 0.55
          arr[i*3+2] = Math.sin(angles[i]) * r * Math.cos(tilt)
        }
        pGeom.attributes.position.needsUpdate = true
        pMat.color.setHex(sc.wire)

        // pulse lines
        lineMats.forEach((lm, i) => {
          lm.mat.opacity = (Math.sin(t * 0.9 + lm.phase) * 0.5 + 0.5) * 0.35 * mult
        })
        lineGroup.rotation.y += 0.001 * mult

        // gentle camera orbit
        camera.position.x = Math.sin(t * 0.08) * 0.4
        camera.position.y = Math.cos(t * 0.06) * 0.3
        camera.lookAt(0, 0, 0)

        renderer.render(scene, camera)
        animId = requestAnimationFrame(animate)
      }
      animate()
    })()

    return () => {
      disposed = true
      cancelAnimationFrame(animId)
      if (renderer) {
        renderer.dispose()
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
      }
    }
  }, [size])

  return (
    <div
      ref={mountRef}
      style={{
        width: size,
        height: size,
        position: 'relative',
        pointerEvents: 'none',
      }}
    />
  )
}
