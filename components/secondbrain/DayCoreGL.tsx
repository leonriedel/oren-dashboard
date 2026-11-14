'use client'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import DayCore, { type CoreHabit, type CorePrio } from '@/components/secondbrain/DayCore'

/**
 * SECONDBRAIN · DAY CORE (WebGL)
 * Neural core whose energy = day score, accretion disk, tilted orbit system.
 * Habits = planets (Fresnel shells, trails, streak moons), top-3 priorities = gold crystals.
 * Done items fire curved energy beams + pulses into the core. Click a planet to toggle.
 */

interface Props {
  habits: CoreHabit[]
  prios: CorePrio[]
  score: number
  height?: number
  onToggleHabit?: (id: string) => void
}

const POINT_VERT = `
attribute float aSeed;
attribute float aSize;
uniform float uTime;
uniform float uPixelRatio;
varying float vAlpha;
void main() {
  vAlpha = 0.55 + 0.45 * sin(uTime * 1.7 + aSeed * 43.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio * (12.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`
const POINT_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d); a *= a;
  gl_FragColor = vec4(uColor * uOpacity, a * vAlpha);
}`
const FRESNEL_VERT = `
varying vec3 vN; varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`
const FRESNEL_FRAG = `
uniform vec3 uColor; uniform float uIntensity; uniform float uPower;
varying vec3 vN; varying vec3 vV;
void main() {
  float f = pow(1.0 - max(dot(vN, vV), 0.0), uPower);
  gl_FragColor = vec4(uColor * uIntensity, f);
}`
const LumaAlphaShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float v = smoothstep(0.0, 0.07, vUv.x) * smoothstep(1.0, 0.93, vUv.x) * smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
      vec3 rgb = c.rgb * v;
      gl_FragColor = vec4(rgb, clamp(max(max(rgb.r, rgb.g), rgb.b), 0.0, 1.0));
    }`,
}

const C_BLUE = new THREE.Color(0x64c8ff)
const C_MINT = new THREE.Color(0x34d399)
const C_GOLD = new THREE.Color(0xffd73c)
const C_WHITE = new THREE.Color(0xe6f5ff)

function fibSphere(n: number, r: number, jitter = 0) {
  const a = new Float32Array(n * 3)
  const g = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2
    const rad = Math.sqrt(1 - y * y)
    const th = g * i
    const rr = r * (1 + (Math.random() - 0.5) * jitter)
    a[i * 3] = Math.cos(th) * rad * rr; a[i * 3 + 1] = y * rr; a[i * 3 + 2] = Math.sin(th) * rad * rr
  }
  return a
}
function latLong(r: number, mer: number, par: number, seg = 48) {
  const v: number[] = []
  const P = (la: number, lo: number) => [r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), r * Math.cos(la) * Math.sin(lo)]
  for (let m = 0; m < mer; m++) {
    const lo = (m / mer) * Math.PI * 2
    for (let i = 0; i < seg; i++) v.push(...P(-Math.PI / 2 + (i / seg) * Math.PI, lo), ...P(-Math.PI / 2 + ((i + 1) / seg) * Math.PI, lo))
  }
  for (let q = 1; q < par; q++) {
    const la = -Math.PI / 2 + (q / par) * Math.PI
    for (let i = 0; i < seg; i++) v.push(...P(la, (i / seg) * Math.PI * 2), ...P(la, ((i + 1) / seg) * Math.PI * 2))
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); return g
}
function ellipse(rx: number, rz: number, n: number, sides = 0) {
  const v: number[] = []
  const N = sides || n
  for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; v.push(Math.cos(a) * rx, 0, Math.sin(a) * rz) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); return g
}
const lineMat = (color: THREE.Color | number, opacity: number, vertexColors = false) =>
  new THREE.LineBasicMaterial({ color, transparent: true, opacity, vertexColors, blending: THREE.AdditiveBlending, depthWrite: false })

export default function DayCoreGL(props: Props) {
  const { habits, prios, score, height = 420 } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const dataRef = useRef(props)
  dataRef.current = props
  const habitLabelRefs = useRef<(HTMLDivElement | null)[]>([])
  const prioLabelRefs = useRef<(HTMLDivElement | null)[]>([])
  const [failed, setFailed] = useState(false)
  const habitKey = habits.map(h => h.id).join(',')

  useEffect(() => {
    const mount = mountRef.current, wrap = wrapRef.current
    if (!mount || !wrap) return
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch { setFailed(true); return }
    const pr = Math.min(window.devicePixelRatio || 1, 1.5)
    renderer.setPixelRatio(pr)
    renderer.setClearColor(0x000000, 0)
    mount.appendChild(renderer.domElement)

    const disposables: { dispose: () => void }[] = []
    const track = <T extends { dispose: () => void }>(x: T) => { disposables.push(x); return x }

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(36, 3, 0.1, 200)
    const uniformsBase = { uTime: { value: 0 }, uPixelRatio: { value: pr } }

    const pointMat = (color: THREE.Color, opacity = 1) => track(new THREE.ShaderMaterial({
      uniforms: { ...uniformsBase, uColor: { value: color.clone() }, uOpacity: { value: opacity } },
      vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }))
    const makePoints = (pos: Float32Array, color: THREE.Color, sMin: number, sMax: number, opacity = 1) => {
      const n = pos.length / 3
      const g = track(new THREE.BufferGeometry())
      const seeds = new Float32Array(n), sizes = new Float32Array(n)
      for (let i = 0; i < n; i++) { seeds[i] = Math.random(); sizes[i] = sMin + Math.random() * (sMax - sMin) }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
      g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
      return new THREE.Points(g, pointMat(color, opacity))
    }
    const fresnel = (color: THREE.Color, intensity: number, power: number) => track(new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color.clone() }, uIntensity: { value: intensity }, uPower: { value: power } },
      vertexShader: FRESNEL_VERT, fragmentShader: FRESNEL_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
    }))

    const world = new THREE.Group(); scene.add(world)

    // ═══ BACKGROUND STARFIELD ═══
    {
      const n = 2200, a = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) { a[i * 3] = (Math.random() - 0.5) * 46; a[i * 3 + 1] = (Math.random() - 0.5) * 18; a[i * 3 + 2] = -6 - Math.random() * 20 }
      scene.add(makePoints(a, C_WHITE, 0.6, 2.2, 0.75))
    }

    // ═══ CORE ═══
    const core = new THREE.Group(); world.add(core); core.scale.setScalar(1.35)
    const coreColorMats: THREE.ShaderMaterial[] = []
    const coreLineMats: THREE.LineBasicMaterial[] = []
    const R = 1.25

    const spinA = new THREE.Group(), spinB = new THREE.Group(), spinC = new THREE.Group()
    core.add(spinA, spinB, spinC)
    const llMat = track(lineMat(C_BLUE, 0.2)); coreLineMats.push(llMat)
    spinA.add(new THREE.LineSegments(track(latLong(R, 16, 11)), llMat))
    const skin = makePoints(fibSphere(2400, R * 1.01, 0.04), C_BLUE, 1.0, 2.4, 0.6); coreColorMats.push(skin.material as THREE.ShaderMaterial); spinA.add(skin)
    // organic neural cloud
    {
      const n = 1600, a = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        const u = Math.random() * Math.PI * 2, v = Math.acos(2 * Math.random() - 1)
        const r = R * (0.55 + 0.25 * Math.pow(Math.random(), 0.5)) * (1 + 0.15 * Math.sin(u * 3) * Math.sin(v * 4))
        a[i * 3] = r * Math.sin(v) * Math.cos(u); a[i * 3 + 1] = r * Math.cos(v); a[i * 3 + 2] = r * Math.sin(v) * Math.sin(u)
      }
      const cloud = makePoints(a, C_MINT, 1.2, 2.8, 0.4); coreColorMats.push(cloud.material as THREE.ShaderMaterial); spinB.add(cloud)
    }
    const midMat = track(lineMat(0xc864dc, 0.22))
    spinB.add(new THREE.LineSegments(track(latLong(R * 0.66, 10, 1)), midMat))
    spinC.add(new THREE.LineSegments(track(latLong(R * 0.42, 8, 1)), track(lineMat(C_WHITE, 0.28))))
    // neural net
    const NN = 110, nodes: THREE.Vector3[] = []
    for (let i = 0; i < NN; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(R * (0.3 + Math.random() * 0.62)); nodes.push(v)
    }
    const edges: [number, number][] = []
    for (let i = 0; i < NN; i++) {
      const d = nodes.map((n, j) => ({ j, d: n.distanceTo(nodes[i]) })).filter(x => x.j !== i).sort((a, b) => a.d - b.d)
      for (let k = 0; k < 3; k++) if (d[k].j > i) edges.push([i, d[k].j])
    }
    {
      const v: number[] = []; edges.forEach(([a, b]) => v.push(nodes[a].x, nodes[a].y, nodes[a].z, nodes[b].x, nodes[b].y, nodes[b].z))
      const g = track(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
      const m = track(lineMat(C_WHITE, 0.18)); coreLineMats.push(m)
      spinB.add(new THREE.LineSegments(g, m))
      const np = new Float32Array(NN * 3); nodes.forEach((n, i) => { np[i * 3] = n.x; np[i * 3 + 1] = n.y; np[i * 3 + 2] = n.z })
      spinB.add(makePoints(np, C_WHITE, 3, 5, 0.9))
    }
    const NP = 40, netPulse = new Float32Array(NP * 3)
    const netPulseState = Array.from({ length: NP }, () => ({ e: Math.floor(Math.random() * edges.length), t: Math.random() }))
    const netPulsePts = makePoints(netPulse, C_WHITE, 5, 6.5, 1); spinB.add(netPulsePts)
    // fresnel shell + hot core
    const shellMat = fresnel(C_BLUE, 0.5, 3.0)
    core.add(new THREE.Mesh(track(new THREE.SphereGeometry(R * 1.04, 64, 64)), shellMat))
    core.add(new THREE.Mesh(track(new THREE.SphereGeometry(0.09, 32, 32)), track(new THREE.MeshBasicMaterial({ color: 0xffffff }))))
    const coronaMat = fresnel(new THREE.Color(0x8fd0ff), 1.4, 1.4)
    const corona = new THREE.Mesh(track(new THREE.SphereGeometry(0.42, 32, 32)), coronaMat); core.add(corona)
    // gyro rings
    const gyros: THREE.Object3D[] = []
    ;[1.32, 1.42, 1.52].forEach((r, i) => {
      const m = track(lineMat(i === 1 ? C_GOLD : C_BLUE, i === 1 ? 0.35 : 0.3)); if (i !== 1) coreLineMats.push(m)
      const ring = new THREE.LineLoop(track(ellipse(r, r, 160)), m)
      ring.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0); core.add(ring); gyros.push(ring)
    })
    // polygon halo rings
    const polys: THREE.Object3D[] = []
    ;[6, 8, 12].forEach((sides, i) => {
      const r = 1.7 + i * 0.14
      const p = new THREE.LineLoop(track(ellipse(r, r, 0, sides)), track(lineMat(0xbfe0ff, 0.12)))
      p.rotation.x = Math.PI / 2 + (i - 1) * 0.12; core.add(p); polys.push(p)
    })
    // gold data band
    const band = new THREE.Group(); core.add(band)
    {
      const n = 220, a = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; if (Math.sin(t * 9) < -0.2) continue; a[i * 3] = Math.cos(t) * 2.05; a[i * 3 + 1] = (Math.random() - 0.5) * 0.04; a[i * 3 + 2] = Math.sin(t) * 2.05 }
      band.add(makePoints(a, C_GOLD, 1.6, 2.6, 0.9))
    }

    // ═══ ORBITAL SYSTEM ═══
    const orbit = new THREE.Group(); world.add(orbit)
    const stretch = { x: 1.45 }
    const HR = 5.0      // habit orbit radius
    const PR = 3.15     // prio orbit radius
    const stretchGroup = new THREE.Group(); orbit.add(stretchGroup)
    // accretion disk
    const disk = new THREE.Group(); stretchGroup.add(disk)
    {
      const n = 3200, a = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        const r = 2.3 + Math.pow(Math.random(), 1.6) * 5.2
        const t = Math.random() * Math.PI * 2 + r * 0.6
        a[i * 3] = Math.cos(t) * r; a[i * 3 + 1] = (Math.random() - 0.5) * 0.06 * r; a[i * 3 + 2] = Math.sin(t) * r
      }
      disk.add(makePoints(a, new THREE.Color(0x9fd4ff), 0.7, 2.0, 0.55))
    }
    // orbit loops
    stretchGroup.add(new THREE.LineLoop(track(ellipse(HR, HR, 200)), track(lineMat(C_BLUE, 0.22))))
    stretchGroup.add(new THREE.LineLoop(track(ellipse(HR * 1.13, HR * 1.13, 200)), track(lineMat(C_BLUE, 0.07))))
    stretchGroup.add(new THREE.LineLoop(track(ellipse(HR * 0.82, HR * 0.82, 200)), track(lineMat(C_BLUE, 0.06))))
    {
      const g = track(ellipse(PR, PR, 120))
      const dashed = new THREE.LineSegments(g, track(lineMat(C_GOLD, 0.2))); stretchGroup.add(dashed)
    }
    // inclined extra orbits with travelers
    const travelers: { pts: THREE.Points; r: number; speed: number; pos: Float32Array; ph: number }[] = []
    ;[[3.9, 0.35, 0.4], [6.1, -0.22, -0.25], [4.4, 0.6, 0.3]].forEach(([r, incl, sp], i) => {
      const g = new THREE.Group(); g.rotation.x = incl; g.rotation.z = incl * 0.5; stretchGroup.add(g)
      g.add(new THREE.LineLoop(track(ellipse(r, r, 180)), track(lineMat(C_BLUE, 0.07))))
      const pos = new Float32Array(3); const pts = makePoints(pos, i === 1 ? C_WHITE : C_GOLD, 7, 7, 1); g.add(pts)
      travelers.push({ pts, r, speed: sp, pos, ph: Math.random() * 6 })
    })

    // planets
    type Planet = {
      id: string; group: THREE.Group; shell: THREE.ShaderMaterial; glow: THREE.ShaderMaterial; ring: THREE.LineLoop; ringMat: THREE.LineBasicMaterial
      moons: THREE.Points; moonPos: Float32Array; trail: THREE.Line; trailPos: Float32Array; trailCol: Float32Array; hist: THREE.Vector3[]
      beam: THREE.Line; beamPos: Float32Array; beamCol: Float32Array; screen: { x: number; y: number; depth: number }
    }
    const TRAIL = 46, BEAM = 40, MOONS = 10
    const makeBeam = () => {
      const pos = new Float32Array(BEAM * 3), col = new Float32Array(BEAM * 3)
      const g = track(new THREE.BufferGeometry())
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3))
      const line = new THREE.Line(g, track(lineMat(0xffffff, 1, true))); line.frustumCulled = false
      return { line, pos, col }
    }
    const habitsNow = dataRef.current.habits
    const planets: Planet[] = habitsNow.map((h) => {
      const group = new THREE.Group(); orbit.add(group)
      group.add(new THREE.Mesh(track(new THREE.SphereGeometry(0.2, 32, 32)), track(new THREE.MeshBasicMaterial({ color: 0x06122a }))))
      const shell = fresnel(C_BLUE, 1.2, 2.0)
      group.add(new THREE.Mesh(track(new THREE.SphereGeometry(0.24, 32, 32)), shell))
      const glowPos = new Float32Array([0, 0, 0])
      const glowPts = makePoints(glowPos, C_BLUE, 26, 26, 0.6); group.add(glowPts)
      const ringMat = track(lineMat(C_BLUE, 0.4))
      const ring = new THREE.LineLoop(track(ellipse(0.38, 0.38, 64)), ringMat); ring.rotation.x = 1.2; ring.rotation.y = 0.3; group.add(ring)
      const moonPos = new Float32Array(MOONS * 3)
      const moons = makePoints(moonPos, C_GOLD, 4, 4, 1); group.add(moons)
      const trailPos = new Float32Array(TRAIL * 3), trailCol = new Float32Array(TRAIL * 3)
      const tg = track(new THREE.BufferGeometry())
      tg.setAttribute('position', new THREE.BufferAttribute(trailPos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(trailCol, 3))
      const trail = new THREE.Line(tg, track(lineMat(0xffffff, 1, true))); trail.frustumCulled = false; orbit.add(trail)
      const b = makeBeam(); orbit.add(b.line)
      return {
        id: h.id, group, shell, glow: glowPts.material as THREE.ShaderMaterial, ring, ringMat, moons, moonPos,
        trail, trailPos, trailCol, hist: [], beam: b.line, beamPos: b.pos, beamCol: b.col, screen: { x: 0, y: 0, depth: 0 },
      }
    })

    // prio crystals
    const crystals = [0, 1, 2].map(() => {
      const g = new THREE.Group(); orbit.add(g)
      const mat = track(lineMat(C_GOLD, 0.95))
      const oct = new THREE.LineSegments(track(new THREE.EdgesGeometry(track(new THREE.OctahedronGeometry(0.17)))), mat); g.add(oct)
      const glow = makePoints(new Float32Array([0, 0, 0]), C_GOLD, 18, 18, 0.7); g.add(glow)
      const b = makeBeam(); orbit.add(b.line)
      return { g, oct, mat, glow: glow.material as THREE.ShaderMaterial, beam: b.line, beamPos: b.pos, beamCol: b.col, screen: { x: 0, y: 0, depth: 0 } }
    })

    // beam pulses
    const BP = 90, bpPos = new Float32Array(BP * 3).fill(999)
    const bpState: { src: number; t: number; speed: number; alive: boolean }[] = Array.from({ length: BP }, () => ({ src: 0, t: 0, speed: 0, alive: false }))
    const bpPts = makePoints(bpPos, C_WHITE, 6, 8, 1); bpPts.frustumCulled = false; orbit.add(bpPts)

    // inward spiral dust
    const SD = 520, sdPos = new Float32Array(SD * 3)
    const sd = Array.from({ length: SD }, () => ({ a: Math.random() * Math.PI * 2, r: 2 + Math.random() * 5.5, y: (Math.random() - 0.5) * 0.2, v: 0.004 + Math.random() * 0.01 }))
    const sdPts = makePoints(sdPos, C_MINT, 1.2, 2.6, 0.8); sdPts.frustumCulled = false; orbit.add(sdPts)

    // expanding energy rings
    const rings = Array.from({ length: 3 }, () => {
      const mat = track(lineMat(C_MINT, 0))
      const m = new THREE.LineLoop(track(ellipse(1, 1, 160)), mat); stretchGroup.add(m)
      return { m, mat, t: 0, on: false }
    })
    let nextRing = 60

    // comets
    const comets = Array.from({ length: 3 }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 0 }))
    const CT = 16, cometPos = new Float32Array(comets.length * CT * 3).fill(999)
    const cometPts = makePoints(cometPos, C_WHITE, 1.5, 3.5, 1); cometPts.frustumCulled = false; scene.add(cometPts)
    const cometHist = comets.map(() => [] as THREE.Vector3[])
    const respawnComet = (c: typeof comets[number]) => {
      const left = Math.random() > 0.5
      c.p.set(left ? -24 : 24, 2 + Math.random() * 6, -8 - Math.random() * 6)
      c.v.set((left ? 1 : -1) * (0.18 + Math.random() * 0.12), -0.03 - Math.random() * 0.04, 0)
      c.life = 0; c.max = 300 + Math.random() * 400
    }
    comets.forEach((c, i) => { respawnComet(c); c.life = -i * 220 })

    // ═══ POST ═══
    const composer = new EffectComposer(renderer)
    composer.setPixelRatio(pr)
    const bloom = new UnrealBloomPass(new THREE.Vector2(512, 256), 0.5, 0.5, 0.18)
    composer.addPass(new RenderPass(scene, camera))
    composer.addPass(bloom)
    composer.addPass(new OutputPass())
    composer.addPass(new ShaderPass(LumaAlphaShader as any))

    let W = 0, H = height
    const resize = () => {
      W = wrap.clientWidth; H = height
      const aspect = W / H
      renderer.setSize(W, H); composer.setSize(W, H); bloom.setSize(W, H)
      camera.aspect = aspect
      stretch.x = Math.max(0.8, Math.min(1.5, aspect / 2.1))
      stretchGroup.scale.x = stretch.x
      const dist = 13.5 * Math.max(1, 2.0 / aspect)
      camera.position.set(0, dist * 0.46, dist)
      camera.lookAt(0, -0.3, 0)
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(wrap)

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 }
    const onMove = (e: MouseEvent) => {
      const r = wrap.getBoundingClientRect()
      mouse.tx = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / (r.width / 2)))
      mouse.ty = Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / (r.height / 2)))
    }
    window.addEventListener('mousemove', onMove)

    const clock = new THREE.Clock()
    const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), ctrl = new THREE.Vector3(), origin = new THREE.Vector3()
    const coreCol = new THREE.Color()
    let s = 0, frame = 0, raf = 0

    const project = (v: THREE.Vector3, out: { x: number; y: number; depth: number }) => {
      tmp2.copy(v).project(camera)
      out.x = (tmp2.x + 1) / 2 * W; out.y = (1 - tmp2.y) / 2 * H; out.depth = tmp2.z
    }
    const bez = (a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3) => {
      const u = 1 - t
      out.set(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y, u * u * a.z + 2 * u * t * c.z + t * t * b.z)
      return out
    }
    const writeBeam = (pos: Float32Array, col: Float32Array, from: THREE.Vector3, color: THREE.Color, on: boolean, time: number) => {
      ctrl.copy(from).multiplyScalar(0.5); ctrl.y += 1.4 + from.length() * 0.1
      for (let i = 0; i < BEAM; i++) {
        const t = i / (BEAM - 1)
        bez(from, ctrl, origin, t, tmp)
        pos[i * 3] = tmp.x; pos[i * 3 + 1] = tmp.y; pos[i * 3 + 2] = tmp.z
        const flow = 0.5 + 0.5 * Math.sin(t * 18 - time * 6)
        const k = on ? (0.15 + 0.35 * flow) * (1 - t * 0.6) : 0
        col[i * 3] = color.r * k; col[i * 3 + 1] = color.g * k; col[i * 3 + 2] = color.b * k
      }
    }
    const beamSources: { from: THREE.Vector3; color: THREE.Color }[] = []

    const animate = () => {
      raf = requestAnimationFrame(animate)
      frame++
      const time = clock.getElapsedTime()
      const d = dataRef.current
      s += (Math.max(0, Math.min(100, d.score)) / 100 - s) * 0.03
      const mult = 1 + s * 1.2
      coreCol.copy(C_BLUE).lerp(C_MINT, s)
      ;(uniformsBase.uTime as any).value = time
      disposables.forEach(x => { const u = (x as any).uniforms; if (u?.uTime) u.uTime.value = time })

      // parallax
      mouse.x += (mouse.tx - mouse.x) * 0.04; mouse.y += (mouse.ty - mouse.y) * 0.04
      world.rotation.y = mouse.x * 0.18
      world.rotation.x = mouse.y * 0.06

      // core animation
      spinA.rotation.y += 0.0025 * mult
      spinB.rotation.y -= 0.004 * mult; spinB.rotation.x += 0.001
      spinC.rotation.y += 0.006 * mult
      gyros[0].rotation.y += 0.005 * mult; gyros[1].rotation.z += 0.004 * mult; gyros[2].rotation.x += 0.0045 * mult
      polys.forEach((p, i) => { p.rotation.z += (i % 2 ? -1 : 1) * 0.002 * mult })
      band.rotation.y -= 0.006 * mult
      const breathe = 1 + Math.sin(time * 1.6) * 0.04
      core.scale.setScalar(1.35 * (0.92 + s * 0.16) * breathe)
      corona.scale.setScalar(0.85 + Math.sin(time * 3) * 0.06 + s * 0.25)
      coreColorMats.forEach(m => m.uniforms.uColor.value.copy(coreCol))
      coreLineMats.forEach(m => m.color.copy(coreCol))
      shellMat.uniforms.uColor.value.copy(coreCol)
      shellMat.uniforms.uIntensity.value = 0.4 + s * 0.35
      coronaMat.uniforms.uIntensity.value = 0.55 + s * 0.5
      // neural pulses
      for (let i = 0; i < NP; i++) {
        const st = netPulseState[i]; st.t += 0.02 * mult
        if (st.t >= 1) { st.t = 0; st.e = Math.floor(Math.random() * edges.length) }
        const [a, b] = edges[st.e]
        tmp.copy(nodes[a]).lerp(nodes[b], st.t)
        netPulse[i * 3] = tmp.x; netPulse[i * 3 + 1] = tmp.y; netPulse[i * 3 + 2] = tmp.z
      }
      ;(netPulsePts.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true

      // disk + travelers
      disk.rotation.y += 0.0012 * mult
      travelers.forEach(tr => {
        const a = time * tr.speed + tr.ph
        tr.pos[0] = Math.cos(a) * tr.r; tr.pos[1] = 0; tr.pos[2] = Math.sin(a) * tr.r
        ;(tr.pts.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
      })

      beamSources.length = 0

      // planets
      planets.forEach((p, i) => {
        const h = d.habits.find(x => x.id === p.id)
        const done = !!h?.done
        const a = time * 0.11 + (i / planets.length) * Math.PI * 2
        p.group.position.set(Math.cos(a) * HR * stretch.x, Math.sin(time * 0.7 + i) * 0.12, Math.sin(a) * HR)
        const col = done ? C_MINT : C_BLUE
        p.shell.uniforms.uColor.value.lerp(col, 0.08)
        p.shell.uniforms.uIntensity.value += ((done ? 2.0 : 0.9) - p.shell.uniforms.uIntensity.value) * 0.08
        p.glow.uniforms.uColor.value.lerp(col, 0.08)
        p.glow.uniforms.uOpacity.value += ((done ? 0.9 : 0.25) - p.glow.uniforms.uOpacity.value) * 0.08
        p.ringMat.color.lerp(col, 0.08)
        p.ring.rotation.z += done ? 0.03 : 0.006
        const sc = done ? 1.15 + Math.sin(time * 4 + i) * 0.05 : 1
        p.group.scale.setScalar(sc)
        // moons = streak
        const n = Math.min(h?.streak || 0, MOONS)
        for (let m = 0; m < MOONS; m++) {
          if (m < n) {
            const ma = time * 1.4 + (m / Math.max(n, 1)) * Math.PI * 2
            p.moonPos[m * 3] = Math.cos(ma) * 0.5; p.moonPos[m * 3 + 1] = Math.sin(ma) * 0.18; p.moonPos[m * 3 + 2] = Math.sin(ma) * 0.5
          } else { p.moonPos[m * 3] = 999; p.moonPos[m * 3 + 1] = 999; p.moonPos[m * 3 + 2] = 999 }
        }
        ;(p.moons.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
        // trail
        p.hist.unshift(p.group.position.clone()); if (p.hist.length > TRAIL) p.hist.pop()
        for (let k = 0; k < TRAIL; k++) {
          const v = p.hist[Math.min(k, p.hist.length - 1)]
          p.trailPos[k * 3] = v.x; p.trailPos[k * 3 + 1] = v.y; p.trailPos[k * 3 + 2] = v.z
          const f = (1 - k / TRAIL) * (done ? 0.75 : 0.12)
          p.trailCol[k * 3] = col.r * f; p.trailCol[k * 3 + 1] = col.g * f; p.trailCol[k * 3 + 2] = col.b * f
        }
        p.trail.geometry.getAttribute('position').needsUpdate = true
        p.trail.geometry.getAttribute('color').needsUpdate = true
        // beam
        writeBeam(p.beamPos, p.beamCol, p.group.position, C_MINT, done, time)
        p.beam.geometry.getAttribute('position').needsUpdate = true
        p.beam.geometry.getAttribute('color').needsUpdate = true
        if (done) beamSources.push({ from: p.group.position, color: C_MINT })
        project(p.group.position, p.screen)
      })

      // crystals
      crystals.forEach((c, i) => {
        const pr2 = d.prios[i]
        c.g.visible = !!pr2
        const a = -time * 0.2 + (i / 3) * Math.PI * 2
        c.g.position.set(Math.cos(a) * PR * stretch.x, 0.25 + Math.sin(time * 1.3 + i) * 0.1, Math.sin(a) * PR)
        c.oct.rotation.y += 0.02; c.oct.rotation.x += 0.012
        const done = !!pr2?.done
        c.mat.color.lerp(done ? C_MINT : C_GOLD, 0.1)
        c.glow.uniforms.uColor.value.lerp(done ? C_MINT : C_GOLD, 0.1)
        writeBeam(c.beamPos, c.beamCol, c.g.position, C_GOLD, !!pr2 && !done ? false : done, time)
        c.beam.geometry.getAttribute('position').needsUpdate = true
        c.beam.geometry.getAttribute('color').needsUpdate = true
        if (pr2 && done) beamSources.push({ from: c.g.position, color: C_MINT })
        project(c.g.position, c.screen)
      })

      // beam pulses
      if (frame % 9 === 0) {
        beamSources.forEach((_, si) => {
          const free = bpState.find(b => !b.alive)
          if (free) { free.alive = true; free.src = si; free.t = 0; free.speed = 0.012 + Math.random() * 0.01 }
        })
      }
      for (let i = 0; i < BP; i++) {
        const b = bpState[i]
        if (!b.alive || !beamSources[b.src]) { b.alive = false; bpPos[i * 3] = 999; bpPos[i * 3 + 1] = 999; bpPos[i * 3 + 2] = 999; continue }
        b.t += b.speed * mult
        if (b.t >= 1) { b.alive = false; continue }
        const from = beamSources[b.src].from
        ctrl.copy(from).multiplyScalar(0.5); ctrl.y += 1.4 + from.length() * 0.1
        bez(from, ctrl, origin, b.t * b.t, tmp)
        bpPos[i * 3] = tmp.x; bpPos[i * 3 + 1] = tmp.y; bpPos[i * 3 + 2] = tmp.z
      }
      ;(bpPts.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true

      // spiral dust into core
      ;(sdPts.material as THREE.ShaderMaterial).uniforms.uColor.value.copy(coreCol)
      for (let i = 0; i < SD; i++) {
        const q = sd[i]
        q.r -= q.v * (0.4 + s * 2.2) * q.r * 0.25 + 0.002
        q.a += (0.006 + 0.03 / Math.max(q.r, 0.5)) * mult
        if (q.r < 1.2) { q.r = 4 + Math.random() * 3.5; q.a = Math.random() * Math.PI * 2 }
        sdPos[i * 3] = Math.cos(q.a) * q.r * stretch.x; sdPos[i * 3 + 1] = q.y * q.r * 0.3; sdPos[i * 3 + 2] = Math.sin(q.a) * q.r
      }
      ;(sdPts.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true

      // energy rings
      nextRing -= mult
      if (nextRing <= 0) {
        const free = rings.find(r => !r.on); if (free) { free.on = true; free.t = 0 }
        nextRing = 140 - s * 70
      }
      rings.forEach(r => {
        if (!r.on) return
        r.t += 0.006 * mult
        r.m.scale.setScalar(1.6 + r.t * 6.5)
        r.mat.color.copy(coreCol)
        r.mat.opacity = (0.1 + s * 0.25) * (1 - r.t)
        if (r.t >= 1) { r.on = false; r.mat.opacity = 0 }
      })

      // comets
      comets.forEach((c, ci) => {
        c.life++
        if (c.life < 0) return
        c.p.add(c.v)
        const hist = cometHist[ci]; hist.unshift(c.p.clone()); if (hist.length > CT) hist.pop()
        for (let k = 0; k < CT; k++) {
          const v = hist[k]; const idx = (ci * CT + k) * 3
          if (v) { cometPos[idx] = v.x; cometPos[idx + 1] = v.y; cometPos[idx + 2] = v.z } else { cometPos[idx] = 999 }
        }
        if (c.life > c.max || Math.abs(c.p.x) > 26) { respawnComet(c); hist.length = 0; c.life = -200 - Math.random() * 300 }
      })
      ;(cometPts.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true

      bloom.strength += ((0.4 + s * 0.3 + Math.sin(time * 1.5) * 0.03) - bloom.strength) * 0.05

      composer.render()

      // HTML labels
      planets.forEach((p, i) => {
        const el = habitLabelRefs.current[i]; if (!el) return
        const sc = 0.8 + 0.35 * (1 - (p.screen.depth - 0.9) * 8)
        const k = Math.max(0.75, Math.min(1.15, sc))
        el.style.transform = `translate(${p.screen.x}px, ${p.screen.y}px) translate(-50%, -50%) scale(${k})`
        el.style.zIndex = String(Math.round((1 - p.screen.depth) * 10000))
      })
      crystals.forEach((c, i) => {
        const el = prioLabelRefs.current[i]; if (!el) return
        el.style.transform = `translate(${c.screen.x}px, ${c.screen.y}px) translate(-50%, -150%)`
        el.style.opacity = c.g.visible ? '1' : '0'
      })
    }

    try { animate() } catch { setFailed(true) }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('mousemove', onMove)
      disposables.forEach(x => { try { x.dispose() } catch { /* noop */ } })
      composer.dispose?.()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [habitKey, height])

  if (failed) return <DayCore {...props} />

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height, overflow: 'hidden' }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      {habits.map((h, i) => (
        <div
          key={h.id}
          ref={el => { habitLabelRefs.current[i] = el }}
          onClick={() => dataRef.current.onToggleHabit?.(h.id)}
          style={{ position: 'absolute', left: 0, top: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', userSelect: 'none', willChange: 'transform' }}
        >
          <div style={{ width: 46, height: 46, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
            {h.emoji}
          </div>
          <div style={{
            marginTop: 4, whiteSpace: 'nowrap',
            fontFamily: 'Space Mono, monospace', fontSize: 9.5, fontWeight: 700, letterSpacing: 1.5,
            color: h.done ? '#34d399' : 'rgba(170,205,240,0.75)',
            textShadow: h.done ? '0 0 10px rgba(52,211,153,0.8)' : '0 0 8px rgba(0,0,0,0.9)',
          }}>
            {h.label}{h.streak > 0 && <span style={{ color: '#fbbf24', marginLeft: 6 }}>🔥{h.streak}</span>}
          </div>
        </div>
      ))}
      {[0, 1, 2].map(i => (
        <div key={i} ref={el => { prioLabelRefs.current[i] = el }} style={{
          position: 'absolute', left: 0, top: 0, pointerEvents: 'none', willChange: 'transform',
          fontFamily: 'Space Mono, monospace', fontSize: 9, fontWeight: 700, letterSpacing: 1,
          color: prios[i]?.done ? '#34d399' : '#fbbf24', textShadow: '0 0 8px rgba(251,191,36,0.6)',
          maxWidth: 150, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center',
        }}>
          {prios[i] ? `${String(i + 1).padStart(2, '0')} · ${prios[i].text}` : ''}
        </div>
      ))}
      <div style={{ position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)', fontFamily: 'Space Mono, monospace', fontSize: 9, letterSpacing: 3, color: 'rgba(160,210,255,0.55)', pointerEvents: 'none' }}>
        CORE ENERGY {Math.round(score)}%
      </div>
    </div>
  )
}
