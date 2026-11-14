'use client'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import HUDCore from '@/components/HUDCore'

type OrbState = 'idle' | 'thinking' | 'speaking' | 'listening'

/**
 * OREN CORE · WebGL
 * Three.js + UnrealBloom. Transparent canvas (luma-as-alpha final pass +
 * radial vignette) so the orb floats freely on the page — no square edge.
 */

// ─── Shaders ───────────────────────────────────────────────
const POINT_VERT = `
attribute float aSeed;
attribute float aSize;
uniform float uTime;
uniform float uPixelRatio;
uniform float uFadeR;
varying float vAlpha;
void main() {
  float tw = 0.55 + 0.45 * sin(uTime * 1.7 + aSeed * 43.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float r = length(position);
  float fade = uFadeR > 0.0 ? 1.0 - smoothstep(uFadeR * 0.78, uFadeR, r) : 1.0;
  vAlpha = tw * fade;
  gl_PointSize = aSize * uPixelRatio * (9.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`
const POINT_FRAG = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  gl_FragColor = vec4(uColor * uOpacity, a * vAlpha);
}`

const NODE_VERT = `
attribute float aAct;
attribute float aSeed;
uniform float uPixelRatio;
uniform float uTime;
varying float vAct;
varying float vTw;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vAct = aAct;
  vTw = 0.7 + 0.3 * sin(uTime * 2.0 + aSeed * 30.0);
  gl_PointSize = (3.2 + 10.0 * aAct) * uPixelRatio * (9.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`
const NODE_FRAG = `
varying float vAct;
varying float vTw;
void main() {
  vec3 base = vec3(0.75, 0.88, 1.0);
  vec3 hot = vec3(1.0, 0.86, 0.38);
  vec3 c = mix(base, hot, smoothstep(0.45, 1.0, vAct));
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  gl_FragColor = vec4(c, a * (0.55 + 0.45 * vAct) * vTw);
}`

const FRESNEL_VERT = `
varying vec3 vN;
varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`
const FRESNEL_FRAG = `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uPower;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = pow(1.0 - max(dot(vN, vV), 0.0), uPower);
  gl_FragColor = vec4(uColor * uIntensity, f);
}`

// Final pass: alpha = brightest channel (so black = transparent) + radial vignette
const LumaAlphaShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float v = 1.0 - smoothstep(0.36, 0.5, length(vUv - 0.5));
      vec3 rgb = c.rgb * v;
      float a = clamp(max(max(rgb.r, rgb.g), rgb.b), 0.0, 1.0);
      gl_FragColor = vec4(rgb, a);
    }`,
}

// ─── Geometry helpers ──────────────────────────────────────
function fibSphere(n: number, r: number) {
  const a = new Float32Array(n * 3)
  const g = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2
    const rad = Math.sqrt(1 - y * y)
    const th = g * i
    a[i * 3] = Math.cos(th) * rad * r
    a[i * 3 + 1] = y * r
    a[i * 3 + 2] = Math.sin(th) * rad * r
  }
  return a
}

function latLongGeometry(r: number, mer: number, par: number, seg = 64) {
  const v: number[] = []
  const P = (lat: number, lon: number) => [r * Math.cos(lat) * Math.cos(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.sin(lon)]
  for (let m = 0; m < mer; m++) {
    const lon = (m / mer) * Math.PI * 2
    for (let i = 0; i < seg; i++) {
      const l0 = -Math.PI / 2 + (i / seg) * Math.PI
      const l1 = -Math.PI / 2 + ((i + 1) / seg) * Math.PI
      v.push(...P(l0, lon), ...P(l1, lon))
    }
  }
  for (let q = 1; q < par; q++) {
    const lat = -Math.PI / 2 + (q / par) * Math.PI
    for (let i = 0; i < seg; i++) {
      const o0 = (i / seg) * Math.PI * 2
      const o1 = ((i + 1) / seg) * Math.PI * 2
      v.push(...P(lat, o0), ...P(lat, o1))
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  return g
}

function circlePoints(r: number, n: number) {
  const v: number[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    v.push(Math.cos(a) * r, 0, Math.sin(a) * r)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  return g
}

function lineMat(color: number, opacity: number, vertexColors = false) {
  return new THREE.LineBasicMaterial({
    color, transparent: true, opacity, vertexColors,
    blending: THREE.AdditiveBlending, depthWrite: false,
  })
}

export default function OrenCoreGL({ orbState = 'idle', size = 860 }: { orbState?: OrbState; size?: number }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<OrbState>(orbState)
  stateRef.current = orbState
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    } catch {
      setFailed(true)
      return
    }
    const pr = Math.min(window.devicePixelRatio || 1, 2)
    renderer.setPixelRatio(pr)
    renderer.setSize(size, size)
    renderer.setClearColor(0x000000, 0)
    renderer.domElement.style.display = 'block'
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(0, 0, 9)

    const disposables: Array<{ dispose: () => void }> = []
    const track = <T extends { dispose: () => void }>(x: T) => { disposables.push(x); return x }

    const pointMat = (color: number, opacity = 1, fadeR = 0) => track(new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uPixelRatio: { value: pr }, uFadeR: { value: fadeR },
        uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity },
      },
      vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    const pointMats: THREE.ShaderMaterial[] = []
    const makePoints = (positions: Float32Array, color: number, sizeMin: number, sizeMax: number, opacity = 1, fadeR = 0) => {
      const n = positions.length / 3
      const g = track(new THREE.BufferGeometry())
      const seeds = new Float32Array(n), sizes = new Float32Array(n)
      for (let i = 0; i < n; i++) { seeds[i] = Math.random(); sizes[i] = sizeMin + Math.random() * (sizeMax - sizeMin) }
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
      g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
      const m = pointMat(color, opacity, fadeR)
      pointMats.push(m)
      return new THREE.Points(g, m)
    }

    const R = 2.0
    // Parallax group → everything that tilts with the mouse
    const tilt = new THREE.Group()
    scene.add(tilt)

    // ═══ MAIN SPIN GROUP ═══
    const mainSpin = new THREE.Group()
    tilt.add(mainSpin)

    // Main wireframe
    mainSpin.add(new THREE.LineSegments(track(latLongGeometry(R, 18, 12)), track(lineMat(0x64c8ff, 0.22))))

    // Vertex stars at intersections
    {
      const v: number[] = []
      for (let m = 0; m < 18; m++) {
        const lon = (m / 18) * Math.PI * 2
        for (let q = 1; q < 12; q++) {
          const lat = -Math.PI / 2 + (q / 12) * Math.PI
          v.push(R * Math.cos(lat) * Math.cos(lon), R * Math.sin(lat), R * Math.cos(lat) * Math.sin(lon))
        }
      }
      mainSpin.add(makePoints(new Float32Array(v), 0xe6f5ff, 3, 5, 1))
    }

    // Surface particle skin
    mainSpin.add(makePoints(fibSphere(2600, R * 1.005), 0x9fd4ff, 1.2, 2.6, 0.75))

    // Fresnel energy shell
    const shellMat = track(new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x4aa8ff) }, uIntensity: { value: 0.9 }, uPower: { value: 2.6 } },
      vertexShader: FRESNEL_VERT, fragmentShader: FRESNEL_FRAG,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    tilt.add(new THREE.Mesh(track(new THREE.SphereGeometry(R * 1.04, 64, 64)), shellMat))

    // DNA helix (yellow + violet)
    {
      const turns = 3.5, n = 220
      const a: number[] = [], b: number[] = [], rungs: number[] = []
      for (let i = 0; i <= n; i++) {
        const t = i / n
        const ang = t * Math.PI * 2 * turns
        const y = (t - 0.5) * R * 2 * 0.95
        const cr = Math.sqrt(Math.max(0, R * R - y * y)) * 1.02
        const pa = [Math.cos(ang) * cr, y, Math.sin(ang) * cr]
        const pb = [Math.cos(ang + Math.PI) * cr, y, Math.sin(ang + Math.PI) * cr]
        a.push(...pa); b.push(...pb)
        if (i % 8 === 0) rungs.push(...pa, ...pb)
      }
      const ga = track(new THREE.BufferGeometry()); ga.setAttribute('position', new THREE.Float32BufferAttribute(a, 3))
      const gb = track(new THREE.BufferGeometry()); gb.setAttribute('position', new THREE.Float32BufferAttribute(b, 3))
      const gr = track(new THREE.BufferGeometry()); gr.setAttribute('position', new THREE.Float32BufferAttribute(rungs, 3))
      mainSpin.add(new THREE.Line(ga, track(lineMat(0xffd73c, 0.55))))
      mainSpin.add(new THREE.Line(gb, track(lineMat(0xb464ff, 0.55))))
      mainSpin.add(new THREE.LineSegments(gr, track(lineMat(0xffffff, 0.12))))
    }

    // Pulsing cross-section rings
    const crossMats: THREE.LineBasicMaterial[] = []
    for (let i = 0; i < 5; i++) {
      const lat = -Math.PI / 2 + ((i + 0.5) / 5) * Math.PI
      const m = track(lineMat(0x64c8ff, 0.2))
      crossMats.push(m)
      const loop = new THREE.LineLoop(track(circlePoints(R * Math.cos(lat), 96)), m)
      loop.position.y = R * Math.sin(lat)
      mainSpin.add(loop)
    }

    // ═══ NESTED SPHERES ═══
    const midSpin = new THREE.Group(); midSpin.rotation.x = 0.3; tilt.add(midSpin)
    midSpin.add(new THREE.LineSegments(track(latLongGeometry(R * 0.68, 10, 1)), track(lineMat(0xc864dc, 0.28))))
    const deepSpin = new THREE.Group(); deepSpin.rotation.x = -0.6; tilt.add(deepSpin)
    deepSpin.add(new THREE.LineSegments(track(latLongGeometry(R * 0.45, 8, 1)), track(lineMat(0xe6f5ff, 0.3))))

    // ═══ NEURAL NETWORK ═══
    const N = 140, NR = R * 0.78
    const nodePos = new Float32Array(N * 3)
    const nodeAct = new Float32Array(N)
    const nodeSeed = new Float32Array(N)
    const nodeNext = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      let x = 0, y = 0, z = 0, d = 0
      do {
        x = (Math.random() - 0.5) * 2; y = (Math.random() - 0.5) * 2; z = (Math.random() - 0.5) * 2
        d = Math.sqrt(x * x + y * y + z * z)
      } while (d > 1 || d < 0.22)
      nodePos.set([x * NR, y * NR, z * NR], i * 3)
      nodeSeed[i] = Math.random()
      nodeNext[i] = Math.random() * 200
    }
    const edgeSet = new Set<string>()
    const edges: [number, number][] = []
    for (let i = 0; i < N; i++) {
      const ds: { j: number; d: number }[] = []
      for (let j = 0; j < N; j++) {
        if (i === j) continue
        const dx = nodePos[i * 3] - nodePos[j * 3], dy = nodePos[i * 3 + 1] - nodePos[j * 3 + 1], dz = nodePos[i * 3 + 2] - nodePos[j * 3 + 2]
        ds.push({ j, d: dx * dx + dy * dy + dz * dz })
      }
      ds.sort((a, b) => a.d - b.d)
      for (let k = 0; k < 3; k++) {
        const j = ds[k].j
        const key = i < j ? `${i}-${j}` : `${j}-${i}`
        if (!edgeSet.has(key)) { edgeSet.add(key); edges.push([i, j]) }
      }
    }
    const edgeStrength = new Float32Array(edges.length)
    const edgeGeo = track(new THREE.BufferGeometry())
    const ePos = new Float32Array(edges.length * 6)
    const eCol = new Float32Array(edges.length * 6)
    edges.forEach(([a, b], k) => {
      ePos.set(nodePos.subarray(a * 3, a * 3 + 3), k * 6)
      ePos.set(nodePos.subarray(b * 3, b * 3 + 3), k * 6 + 3)
    })
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3))
    edgeGeo.setAttribute('color', new THREE.BufferAttribute(eCol, 3))
    mainSpin.add(new THREE.LineSegments(edgeGeo, track(lineMat(0xffffff, 0.9, true))))

    const nodeGeo = track(new THREE.BufferGeometry())
    nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePos, 3))
    nodeGeo.setAttribute('aAct', new THREE.BufferAttribute(nodeAct, 1))
    nodeGeo.setAttribute('aSeed', new THREE.BufferAttribute(nodeSeed, 1))
    const nodeMat = track(new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: pr }, uTime: { value: 0 } },
      vertexShader: NODE_VERT, fragmentShader: NODE_FRAG,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    mainSpin.add(new THREE.Points(nodeGeo, nodeMat))

    // Traveling white synapse pulses
    const MAXP = 420
    const pulsePos = new Float32Array(MAXP * 3)
    const pulsePts = makePoints(pulsePos, 0xffffff, 4, 5.5, 1)
    pulsePts.geometry.setDrawRange(0, 0)
    mainSpin.add(pulsePts)
    type Pulse = { e: number; dir: 1 | -1; t: number; sp: number }
    const pulses: Pulse[] = []
    const fire = (i: number) => {
      nodeAct[i] = 1
      nodeNext[i] = 60 + Math.random() * 220
      edges.forEach(([a, b], k) => {
        if (pulses.length >= MAXP) return
        if (a === i) { edgeStrength[k] = 1; pulses.push({ e: k, dir: 1, t: 0, sp: 0.018 + Math.random() * 0.02 }) }
        else if (b === i) { edgeStrength[k] = 1; pulses.push({ e: k, dir: -1, t: 0, sp: 0.018 + Math.random() * 0.02 }) }
      })
    }

    // ═══ CORE ═══
    const core = new THREE.Mesh(track(new THREE.SphereGeometry(0.2, 32, 32)), track(new THREE.MeshBasicMaterial({ color: 0xffffff })))
    tilt.add(core)
    const coronaMat = track(new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x8fd0ff) }, uIntensity: { value: 1.4 }, uPower: { value: 1.4 } },
      vertexShader: FRESNEL_VERT, fragmentShader: FRESNEL_FRAG,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }))
    const corona = new THREE.Mesh(track(new THREE.SphereGeometry(0.42, 32, 32)), coronaMat)
    tilt.add(corona)

    // Inward data streams (gold heads + fading trails)
    const STREAMS = 14, TRAIL = 6
    const streamPos = new Float32Array(STREAMS * TRAIL * 3)
    const streamPts = makePoints(streamPos, 0xffd73c, 2, 2, 1)
    const sSizes = streamPts.geometry.getAttribute('aSize') as THREE.BufferAttribute
    for (let s = 0; s < STREAMS; s++) for (let k = 0; k < TRAIL; k++) sSizes.setX(s * TRAIL + k, 5.5 * (1 - k / TRAIL))
    sSizes.needsUpdate = true
    tilt.add(streamPts)
    const streams = Array.from({ length: STREAMS }, () => ({ dir: new THREE.Vector3().randomDirection(), t: Math.random(), sp: 0.004 + Math.random() * 0.006 }))

    // ═══ OUTER SPACE ═══
    // Gyroscope cage
    const gyro = new THREE.Group(); tilt.add(gyro)
    const gyroRings: THREE.LineLoop[] = []
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.LineLoop(track(circlePoints(R * 1.08, 128)), track(lineMat(0x64c8ff, 0.26)))
      if (i === 1) ring.rotation.x = Math.PI / 2
      if (i === 2) ring.rotation.z = Math.PI / 2
      gyro.add(ring); gyroRings.push(ring)
    }

    // Orbital rings with gold travelers
    const orbits: { group: THREE.Group; traveler: THREE.Points; r: number; a: number; sp: number }[] = []
    for (let i = 0; i < 7; i++) {
      const r = R * (1.16 + i * 0.05)
      const group = new THREE.Group()
      group.rotation.set((Math.random() - 0.5) * 2.2, 0, (Math.random() - 0.5) * 2.2)
      group.add(new THREE.LineLoop(track(circlePoints(r, 160)), track(lineMat(0x64c8ff, 0.14))))
      const traveler = makePoints(new Float32Array([r, 0, 0]), 0xffd73c, 7, 7, 1)
      group.add(traveler)
      tilt.add(group)
      orbits.push({ group, traveler, r, a: Math.random() * Math.PI * 2, sp: (Math.random() > 0.5 ? 1 : -1) * (0.006 + Math.random() * 0.007) })
    }

    // Angular polygon rings
    const polys: THREE.Group[] = []
    ;[5, 6, 8, 10, 12].forEach((sides, i) => {
      const r = R * (1.22 + i * 0.07)
      const g = new THREE.Group()
      g.rotation.set((Math.random() - 0.5) * 1.8, 0, (Math.random() - 0.5) * 1.8)
      g.add(new THREE.LineLoop(track(circlePoints(r, sides)), track(lineMat(0xbfe0ff, 0.16))))
      const v: number[] = []
      for (let s = 0; s < sides; s++) { const a = (s / sides) * Math.PI * 2; v.push(Math.cos(a) * r, 0, Math.sin(a) * r) }
      g.add(makePoints(new Float32Array(v), 0xe6f5ff, 4, 4, 1))
      tilt.add(g); polys.push(g)
    })

    // Atmosphere halos (camera-facing concentric rings, scene-level)
    const halos = new THREE.Group(); scene.add(halos)
    const haloMats: THREE.LineBasicMaterial[] = []
    for (let i = 0; i < 6; i++) {
      const m = track(lineMat(0x64c8ff, 0.14 - i * 0.018))
      haloMats.push(m)
      const loop = new THREE.LineLoop(track(circlePoints(R * (1.1 + i * 0.1), 180)), m)
      loop.rotation.x = Math.PI / 2
      halos.add(loop)
    }

    // Outer particle field (white-blue), fades out radially
    const field = new THREE.Group(); tilt.add(field)
    {
      const n = 3400
      const a = new Float32Array(n * 3)
      const v = new THREE.Vector3()
      for (let i = 0; i < n; i++) {
        v.randomDirection().multiplyScalar(R * (1.12 + Math.pow(Math.random(), 0.7) * 0.5))
        a.set([v.x, v.y, v.z], i * 3)
      }
      field.add(makePoints(a, 0xbfe0ff, 0.8, 2.4, 0.85, R * 1.62))
    }

    // Free-floating line fragments
    const FREE = 34
    const freeGeo = track(new THREE.BufferGeometry())
    const fPos = new Float32Array(FREE * 6), fCol = new Float32Array(FREE * 6)
    freeGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3))
    freeGeo.setAttribute('color', new THREE.BufferAttribute(fCol, 3))
    tilt.add(new THREE.LineSegments(freeGeo, track(lineMat(0xffffff, 1, true))))
    const spawnFree = () => ({
      c: new THREE.Vector3().randomDirection().multiplyScalar(R * (1.15 + Math.random() * 0.4)),
      d: new THREE.Vector3().randomDirection(),
      len: 0.15 + Math.random() * 0.4,
      vel: new THREE.Vector3().randomDirection().multiplyScalar(0.0025),
      life: 0, max: 160 + Math.random() * 220,
    })
    const frees = Array.from({ length: FREE }, () => { const f = spawnFree(); f.life = Math.random() * f.max; return f })

    // Comets with trails
    const COMETS = 4, CTRAIL = 22
    const cometPos = new Float32Array(COMETS * CTRAIL * 3)
    const cometPts = makePoints(cometPos, 0xe6f5ff, 2, 2, 1)
    const cSizes = cometPts.geometry.getAttribute('aSize') as THREE.BufferAttribute
    for (let c = 0; c < COMETS; c++) for (let k = 0; k < CTRAIL; k++) cSizes.setX(c * CTRAIL + k, 6 * Math.pow(1 - k / CTRAIL, 1.6))
    cSizes.needsUpdate = true
    tilt.add(cometPts)
    const comets = Array.from({ length: COMETS }, () => ({
      tiltX: (Math.random() - 0.5) * 2.4, tiltZ: (Math.random() - 0.5) * 2.4,
      r: R * (1.3 + Math.random() * 0.25), a: Math.random() * Math.PI * 2, sp: 0.012 + Math.random() * 0.01,
    }))
    const cometPoint = (c: typeof comets[0], a: number, out: THREE.Vector3) => {
      out.set(Math.cos(a) * c.r, 0, Math.sin(a) * c.r)
      out.applyEuler(new THREE.Euler(c.tiltX, 0, c.tiltZ))
      return out
    }

    // Energy pulse rings (camera-facing)
    const pulseRings: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; active: boolean }[] = []
    for (let i = 0; i < 4; i++) {
      const mat = track(new THREE.MeshBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
      const mesh = new THREE.Mesh(track(new THREE.RingGeometry(0.985, 1.0, 160)), mat)
      scene.add(mesh)
      pulseRings.push({ mesh, mat, t: 0, active: false })
    }
    let nextRing = 40

    // ═══ POST-PROCESSING ═══
    const composer = new EffectComposer(renderer)
    composer.setPixelRatio(pr)
    composer.setSize(size, size)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(size, size), 1.1, 0.65, 0.0)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())
    composer.addPass(new ShaderPass(LumaAlphaShader as any))

    // Mouse parallax
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 }
    const onMove = (e: MouseEvent) => {
      const rect = mount.getBoundingClientRect()
      mouse.tx = Math.max(-1.5, Math.min(1.5, (e.clientX - rect.left - size / 2) / (size / 2)))
      mouse.ty = Math.max(-1.5, Math.min(1.5, (e.clientY - rect.top - size / 2) / (size / 2)))
    }
    window.addEventListener('mousemove', onMove)

    const clock = new THREE.Clock()
    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3()
    let frame = 0
    let raf = 0

    const animate = () => {
      raf = requestAnimationFrame(animate)
      frame++
      const time = clock.getElapsedTime()
      const s = stateRef.current
      const mult = s === 'idle' ? 1 : s === 'thinking' ? 1.5 : s === 'speaking' ? 1.8 : 1.3
      const pulse = (Math.sin(time * 1.5) + 1) / 2

      // Parallax
      mouse.x += (mouse.tx - mouse.x) * 0.05
      mouse.y += (mouse.ty - mouse.y) * 0.05
      tilt.rotation.y = mouse.x * 0.45
      tilt.rotation.x = 0.18 + mouse.y * 0.32

      // Spins
      mainSpin.rotation.y += 0.0022 * mult
      midSpin.rotation.y -= 0.0035 * mult
      deepSpin.rotation.y += 0.005 * mult
      gyroRings[0].rotation.y += 0.004 * mult
      gyroRings[1].rotation.z += 0.003 * mult
      gyroRings[2].rotation.x += 0.0035 * mult
      polys.forEach((g, i) => { g.rotation.y += (i % 2 ? -1 : 1) * 0.0012 * mult })
      field.rotation.y += 0.0006 * mult
      field.rotation.x += 0.0002 * mult

      // Uniform time
      for (const m of pointMats) m.uniforms.uTime.value = time
      nodeMat.uniforms.uTime.value = time

      // Cross-section pulse
      crossMats.forEach((m, i) => { m.opacity = 0.08 + ((Math.sin(time * 1.2 * mult + i * 0.7) + 1) / 2) * 0.32 })
      haloMats.forEach((m, i) => { m.opacity = (0.12 - i * 0.016) * (0.7 + pulse * 0.5) })

      // Neural firing
      for (let i = 0; i < N; i++) {
        nodeNext[i] -= mult
        nodeAct[i] *= 0.94
        if (nodeNext[i] <= 0) fire(i)
      }
      ;(nodeGeo.getAttribute('aAct') as THREE.BufferAttribute).needsUpdate = true
      for (let k = 0; k < edges.length; k++) {
        edgeStrength[k] = Math.max(0, edgeStrength[k] - 0.03)
        const st = edgeStrength[k]
        const r = 0.12 + st * 0.8, g = 0.32 + st * 0.65, b = 0.6 + st * 0.4
        eCol[k * 6] = r; eCol[k * 6 + 1] = g; eCol[k * 6 + 2] = b
        eCol[k * 6 + 3] = r; eCol[k * 6 + 4] = g; eCol[k * 6 + 5] = b
      }
      ;(edgeGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true

      // Pulses
      let pc = 0
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]
        p.t += p.sp * mult
        const [a, b] = edges[p.e]
        if (p.t >= 1) {
          const target = p.dir === 1 ? b : a
          if (Math.random() < 0.18 && nodeAct[target] < 0.3) fire(target)  // cascade
          pulses.splice(i, 1)
          continue
        }
      }
      for (const p of pulses) {
        const [a, b] = edges[p.e]
        const from = p.dir === 1 ? a : b, to = p.dir === 1 ? b : a
        const tt = p.t
        pulsePos[pc * 3] = nodePos[from * 3] + (nodePos[to * 3] - nodePos[from * 3]) * tt
        pulsePos[pc * 3 + 1] = nodePos[from * 3 + 1] + (nodePos[to * 3 + 1] - nodePos[from * 3 + 1]) * tt
        pulsePos[pc * 3 + 2] = nodePos[from * 3 + 2] + (nodePos[to * 3 + 2] - nodePos[from * 3 + 2]) * tt
        pc++
        if (pc >= MAXP) break
      }
      ;(pulsePts.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
      pulsePts.geometry.setDrawRange(0, pc)

      // Core
      const cs = 1 + Math.sin(time * 3) * 0.08 * mult
      core.scale.setScalar(cs)
      corona.scale.setScalar(1 + pulse * 0.25 * mult)

      // Streams
      streams.forEach((st, si) => {
        st.t += st.sp * mult
        if (st.t > 1) { st.t = 0; st.dir.randomDirection(); st.sp = 0.004 + Math.random() * 0.006 }
        for (let k = 0; k < TRAIL; k++) {
          const tt = Math.max(0, st.t - k * 0.012)
          const rr = R * 1.5 * (1 - tt) + 0.25 * tt
          const idx = (si * TRAIL + k) * 3
          streamPos[idx] = st.dir.x * rr; streamPos[idx + 1] = st.dir.y * rr; streamPos[idx + 2] = st.dir.z * rr
        }
      })
      ;(streamPts.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true

      // Orbit travelers
      for (const o of orbits) {
        o.a += o.sp * mult
        const pos = o.traveler.geometry.getAttribute('position') as THREE.BufferAttribute
        pos.setXYZ(0, Math.cos(o.a) * o.r, 0, Math.sin(o.a) * o.r)
        pos.needsUpdate = true
      }

      // Free fragments
      frees.forEach((f, i) => {
        f.life++
        if (f.life > f.max) { Object.assign(f, spawnFree()) }
        f.c.add(f.vel)
        const fade = Math.min(1, f.life / 30, (f.max - f.life) / 30) * 0.55
        tmpA.copy(f.d).multiplyScalar(f.len / 2)
        const i6 = i * 6
        fPos[i6] = f.c.x - tmpA.x; fPos[i6 + 1] = f.c.y - tmpA.y; fPos[i6 + 2] = f.c.z - tmpA.z
        fPos[i6 + 3] = f.c.x + tmpA.x; fPos[i6 + 4] = f.c.y + tmpA.y; fPos[i6 + 5] = f.c.z + tmpA.z
        for (let k = 0; k < 2; k++) { fCol[i6 + k * 3] = 0.6 * fade; fCol[i6 + k * 3 + 1] = 0.82 * fade; fCol[i6 + k * 3 + 2] = 1.0 * fade }
      })
      ;(freeGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
      ;(freeGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true

      // Comets
      comets.forEach((c, ci) => {
        c.a += c.sp * mult
        for (let k = 0; k < CTRAIL; k++) {
          cometPoint(c, c.a - k * 0.035, tmpB)
          const idx = (ci * CTRAIL + k) * 3
          cometPos[idx] = tmpB.x; cometPos[idx + 1] = tmpB.y; cometPos[idx + 2] = tmpB.z
        }
      })
      ;(cometPts.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true

      // Energy pulse rings
      nextRing -= mult
      if (nextRing <= 0) {
        const free = pulseRings.find(r => !r.active)
        if (free) { free.active = true; free.t = 0 }
        nextRing = 150 + Math.random() * 60
      }
      for (const pr2 of pulseRings) {
        if (!pr2.active) continue
        pr2.t += 0.008 * mult
        const sc = 0.4 + pr2.t * 3.0
        pr2.mesh.scale.setScalar(sc)
        pr2.mat.opacity = 0.45 * (1 - pr2.t)
        if (pr2.t >= 1) { pr2.active = false; pr2.mat.opacity = 0 }
      }

      // Bloom reacts to state
      const targetBloom = s === 'idle' ? 1.05 : s === 'thinking' ? 1.5 : s === 'speaking' ? 1.75 : 1.3
      bloom.strength += (targetBloom + pulse * 0.15 - bloom.strength) * 0.05

      composer.render()
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      disposables.forEach(d => { try { d.dispose() } catch { /* noop */ } })
      composer.dispose?.()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
    }
  }, [size])

  if (failed) return <HUDCore orbState={orbState} size={Math.min(size, 620)} />
  return <div ref={mountRef} style={{ width: size, height: size, pointerEvents: 'none' }} />
}
