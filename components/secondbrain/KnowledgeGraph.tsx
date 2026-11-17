'use client'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

/**
 * SECONDBRAIN · KNOWLEDGE GRAPH (WebGL)
 * OREN core in the centre, tag hubs orbit it, notes cluster around their tags,
 * related notes are wired together. Live 3D force layout, bloom, edge pulses.
 * Drag = rotate · click node = open · click tag = filter.
 */

export type GNote = { id: string; type: string; title: string; tags: string[]; related: string[]; pinned?: boolean }

export const TYPE_COLORS: Record<string, string> = {
  idea: '#ffd73c', note: '#64c8ff', link: '#b47cff', task: '#34d399', goal: '#ff9f43', person: '#ff6fae', quote: '#e6f5ff',
}

interface Props {
  notes: GNote[]
  selectedId: string | null
  highlight: Set<string> | null
  burstId?: string | null
  height: number
  onSelect: (id: string | null) => void
  onTag: (tag: string) => void
}

const NODE_VERT = `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
attribute float aSeed;
uniform float uTime;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha * (0.8 + 0.2 * sin(uTime * 2.0 + aSeed * 40.0));
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio * (30.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}`
const NODE_FRAG = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.16, 0.0, d);
  float halo = smoothstep(0.5, 0.0, d); halo *= halo;
  float ring = smoothstep(0.03, 0.0, abs(d - 0.3)) * 0.5;
  vec3 c = mix(vColor, vec3(1.0), core * 0.7);
  gl_FragColor = vec4(c, (halo * 0.55 + core + ring) * vAlpha);
}`
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
      float v = smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x) * smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
      vec3 rgb = c.rgb * v;
      gl_FragColor = vec4(rgb, clamp(max(max(rgb.r, rgb.g), rgb.b), 0.0, 1.0));
    }`,
}

function fibSphere(n: number, r: number) {
  const a = new Float32Array(n * 3), g = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, rad = Math.sqrt(1 - y * y), th = g * i
    a[i * 3] = Math.cos(th) * rad * r; a[i * 3 + 1] = y * r; a[i * 3 + 2] = Math.sin(th) * rad * r
  }
  return a
}
function latLong(r: number, mer: number, par: number, seg = 48) {
  const v: number[] = []
  const P = (la: number, lo: number) => [r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), r * Math.cos(la) * Math.sin(lo)]
  for (let m = 0; m < mer; m++) { const lo = (m / mer) * Math.PI * 2; for (let i = 0; i < seg; i++) v.push(...P(-Math.PI / 2 + (i / seg) * Math.PI, lo), ...P(-Math.PI / 2 + ((i + 1) / seg) * Math.PI, lo)) }
  for (let q = 1; q < par; q++) { const la = -Math.PI / 2 + (q / par) * Math.PI; for (let i = 0; i < seg; i++) v.push(...P(la, (i / seg) * Math.PI * 2), ...P(la, ((i + 1) / seg) * Math.PI * 2)) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); return g
}
function circle(r: number, n: number) {
  const v: number[] = []; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; v.push(Math.cos(a) * r, 0, Math.sin(a) * r) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); return g
}
const lineMat = (color: number | THREE.Color, opacity: number, vertexColors = false) =>
  new THREE.LineBasicMaterial({ color, transparent: true, opacity, vertexColors, blending: THREE.AdditiveBlending, depthWrite: false })

type GNode = {
  id: string; kind: 'core' | 'tag' | 'note'; label: string; type?: string
  p: THREE.Vector3; v: THREE.Vector3; color: THREE.Color; deg: number; el?: HTMLDivElement
}

export default function KnowledgeGraph(props: Props) {
  const { notes, height } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const mountRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const posMemory = useRef<Map<string, THREE.Vector3>>(new Map())
  const engineRef = useRef<{ rebuild: (n: GNote[]) => void; burst: () => void; zoom: (d: number) => void } | null>(null)
  const [failed, setFailed] = useState(false)

  const graphKey = notes.map(n => `${n.id}:${n.tags.join('.')}:${n.related.join('.')}:${n.type}:${n.title}`).join('|')

  // ── engine (created once) ──
  useEffect(() => {
    const mount = mountRef.current, wrap = wrapRef.current, labels = labelsRef.current
    if (!mount || !wrap || !labels) return
    let renderer: THREE.WebGLRenderer
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }) }
    catch { setFailed(true); return }
    const pr = Math.min(window.devicePixelRatio || 1, 1.5)
    renderer.setPixelRatio(pr); renderer.setClearColor(0x000000, 0)
    renderer.domElement.style.display = 'block'
    mount.appendChild(renderer.domElement)

    const disposables: { dispose: () => void }[] = []
    const track = <T extends { dispose: () => void }>(x: T) => { disposables.push(x); return x }
    const U = { uTime: { value: 0 }, uPixelRatio: { value: pr } }

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 2, 0.1, 400)
    let camDist = 22, camDistTarget = 22
    const world = new THREE.Group(); scene.add(world)

    const pointMat = (color: number, opacity = 1) => track(new THREE.ShaderMaterial({
      uniforms: { ...U, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
      vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }))
    const makePoints = (pos: Float32Array, color: number, sMin: number, sMax: number, opacity = 1) => {
      const n = pos.length / 3, g = track(new THREE.BufferGeometry())
      const seeds = new Float32Array(n), sizes = new Float32Array(n)
      for (let i = 0; i < n; i++) { seeds[i] = Math.random(); sizes[i] = sMin + Math.random() * (sMax - sMin) }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1)); g.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
      const p = new THREE.Points(g, pointMat(color, opacity)); p.frustumCulled = false; return p
    }
    const fresnel = (color: number, intensity: number, power: number) => track(new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uPower: { value: power } },
      vertexShader: FRESNEL_VERT, fragmentShader: FRESNEL_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }))

    // background
    {
      const n = 2600, a = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 60); a.set([v.x, v.y, v.z], i * 3) }
      scene.add(makePoints(a, 0xe6f5ff, 0.8, 2.6, 0.7))
    }
    const nebula = new THREE.Group(); world.add(nebula)
    {
      const n = 2400, a = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        const r = 3 + Math.pow(Math.random(), 1.4) * 14, t = Math.random() * Math.PI * 2 + r * 0.35
        a[i * 3] = Math.cos(t) * r; a[i * 3 + 1] = (Math.random() - 0.5) * 0.12 * r; a[i * 3 + 2] = Math.sin(t) * r
      }
      nebula.add(makePoints(a, 0x7fbfff, 0.6, 1.8, 0.4))
      nebula.rotation.x = 0.35
    }

    // OREN core
    const core = new THREE.Group(); world.add(core)
    const cA = new THREE.Group(), cB = new THREE.Group(); core.add(cA, cB)
    cA.add(new THREE.LineSegments(track(latLong(1.1, 14, 10)), track(lineMat(0x64c8ff, 0.22))))
    cA.add(makePoints(fibSphere(1600, 1.12), 0x9fd4ff, 1, 2.2, 0.65))
    cB.add(new THREE.LineSegments(track(latLong(0.7, 8, 1)), track(lineMat(0xc864dc, 0.28))))
    core.add(new THREE.Mesh(track(new THREE.SphereGeometry(1.16, 48, 48)), fresnel(0x4aa8ff, 0.5, 2.8)))
    core.add(new THREE.Mesh(track(new THREE.SphereGeometry(0.1, 24, 24)), track(new THREE.MeshBasicMaterial({ color: 0xffffff }))))
    const corona = new THREE.Mesh(track(new THREE.SphereGeometry(0.38, 32, 32)), fresnel(0x8fd0ff, 0.9, 1.4)); core.add(corona)
    const gyros = [1.4, 1.55, 1.7].map((r, i) => {
      const g = new THREE.LineLoop(track(circle(r, 140)), track(lineMat(i === 1 ? 0xffd73c : 0x64c8ff, 0.3)))
      g.rotation.set(Math.random() * 3, Math.random() * 3, 0); core.add(g); return g
    })
    const halo = new THREE.Group(); core.add(halo)
    {
      const n = 300, a = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) { const t = Math.random() * Math.PI * 2, r = 2 + Math.random() * 0.25; a.set([Math.cos(t) * r, (Math.random() - 0.5) * 0.06, Math.sin(t) * r], i * 3) }
      halo.add(makePoints(a, 0xffd73c, 1.4, 2.4, 0.8))
    }
    // burst rings
    const bursts = Array.from({ length: 3 }, () => {
      const mat = track(lineMat(0x8fe0ff, 0)); const m = new THREE.LineLoop(track(circle(1, 160)), mat)
      m.rotation.x = Math.PI / 2 - 0.35; core.add(m); return { m, mat, t: 0, on: false }
    })

    const tmp = new THREE.Vector3()
    // graph buffers (resized on rebuild)
    let nodes: GNode[] = []
    let edges: [number, number, number][] = [] // a, b, restLength
    let index = new Map<string, number>()
    let nodePts: THREE.Points | null = null
    let edgeLines: THREE.LineSegments | null = null
    let pulsePts: THREE.Points | null = null
    let hubRings: { ring: THREE.LineLoop; node: GNode }[] = []
    let alpha = 1
    const PULSES = 140
    let pulseState: { e: number; t: number; s: number }[] = []
    const nodeMat = track(new THREE.ShaderMaterial({
      uniforms: { ...U }, vertexShader: NODE_VERT, fragmentShader: NODE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }))
    const edgeMat = track(lineMat(0xffffff, 1, true))

    const clearGraph = () => {
      if (nodePts) { world.remove(nodePts); nodePts.geometry.dispose() }
      if (edgeLines) { world.remove(edgeLines); edgeLines.geometry.dispose() }
      if (pulsePts) { world.remove(pulsePts); pulsePts.geometry.dispose() }
      hubRings.forEach(h => { world.remove(h.ring); h.ring.geometry.dispose() })
      hubRings = []
      labels.innerHTML = ''
    }

    const rebuild = (list: GNote[]) => {
      // remember positions
      nodes.forEach(n => posMemory.current.set(n.id, n.p.clone()))
      clearGraph()
      nodes = []; edges = []; index = new Map()
      const add = (n: Omit<GNode, 'p' | 'v' | 'deg'>, seed?: THREE.Vector3) => {
        const mem = posMemory.current.get(n.id)
        const p = mem ? mem.clone() : (seed ? seed.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(0.6)) : new THREE.Vector3().randomDirection().multiplyScalar(0.5))
        index.set(n.id, nodes.length); nodes.push({ ...n, p, v: new THREE.Vector3(), deg: 0 })
      }
      add({ id: '__core', kind: 'core', label: 'OREN', color: new THREE.Color(0x8fd0ff) })
      nodes[0].p.set(0, 0, 0)
      const tagCount = new Map<string, number>()
      list.forEach(n => n.tags.forEach(t => tagCount.set(t, (tagCount.get(t) || 0) + 1)))
      const tags = Array.from(tagCount.keys())
      tags.forEach((t, i) => {
        const a = (i / Math.max(tags.length, 1)) * Math.PI * 2
        const seed = new THREE.Vector3(Math.cos(a) * 6, (Math.random() - 0.5) * 3, Math.sin(a) * 6)
        add({ id: 'tag:' + t, kind: 'tag', label: '#' + t, color: new THREE.Color(0xbfe0ff) }, seed)
        edges.push([0, index.get('tag:' + t)!, 4.6 + Math.min(tagCount.get(t)!, 8) * 0.2])
      })
      list.forEach(n => {
        const firstTag = n.tags[0] ? nodes[index.get('tag:' + n.tags[0])!]?.p : undefined
        add({ id: n.id, kind: 'note', label: n.title, type: n.type, color: new THREE.Color(TYPE_COLORS[n.type] || TYPE_COLORS.note) }, firstTag)
      })
      list.forEach(n => {
        const i = index.get(n.id)!
        if (!n.tags.length) edges.push([0, i, 4.5])
        n.tags.forEach(t => edges.push([index.get('tag:' + t)!, i, 1.9]))
        n.related.forEach(r => { const j = index.get(r); if (j !== undefined && j > i) edges.push([i, j, 2.6]) })
      })
      edges.forEach(([a, b]) => { nodes[a].deg++; nodes[b].deg++ })

      // node points
      const N = nodes.length
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
      g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
      g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(N), 1))
      g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(N), 1))
      const seeds = new Float32Array(N); for (let i = 0; i < N; i++) seeds[i] = Math.random()
      g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
      nodePts = new THREE.Points(g, nodeMat); nodePts.frustumCulled = false; world.add(nodePts)

      const eg = new THREE.BufferGeometry()
      eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edges.length * 6), 3))
      eg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(edges.length * 6), 3))
      edgeLines = new THREE.LineSegments(eg, edgeMat); edgeLines.frustumCulled = false; world.add(edgeLines)

      pulsePts = makePoints(new Float32Array(PULSES * 3).fill(999), 0xffffff, 4.5, 6, 1); world.add(pulsePts)
      pulseState = Array.from({ length: PULSES }, () => ({ e: Math.floor(Math.random() * Math.max(edges.length, 1)), t: Math.random(), s: 0.006 + Math.random() * 0.01 }))

      nodes.forEach(n => {
        if (n.kind === 'tag') {
          const ring = new THREE.LineLoop(circle(0.42, 48), lineMat(0xbfe0ff, 0.35)); ring.rotation.x = Math.random() * 3
          world.add(ring); hubRings.push({ ring, node: n })
        }
        if (n.kind === 'core') return
        const el = document.createElement('div')
        el.textContent = n.label
        el.style.cssText = `position:absolute;left:0;top:0;white-space:nowrap;pointer-events:none;will-change:transform;font-family:Space Mono,monospace;letter-spacing:1px;transition:opacity .25s;max-width:220px;overflow:hidden;text-overflow:ellipsis;`
        if (n.kind === 'tag') { el.style.fontSize = '10px'; el.style.fontWeight = '700'; el.style.color = 'rgba(200,230,255,0.85)'; el.style.textShadow = '0 0 10px rgba(120,200,255,0.8)' }
        else { el.style.fontSize = '10.5px'; el.style.color = '#' + n.color.getHexString(); el.style.textShadow = '0 0 8px rgba(0,0,0,0.95)' }
        el.style.opacity = '0'
        labels.appendChild(el); n.el = el
      })

      alpha = 1
      const warm = Math.min(260, Math.floor(3e7 / Math.max(nodes.length * nodes.length, 1)))
      for (let k = 0; k < warm; k++) step()
      alpha = Math.max(alpha, 0.25)
      camDistTarget = 15 + Math.sqrt(Math.max(list.length, 1)) * 1.1
    }

    const delta = new THREE.Vector3()
    const step = () => {
      const N = nodes.length
      if (N < 2) return
      for (let i = 1; i < N; i++) {
        const a = nodes[i]
        for (let j = i + 1; j < N; j++) {
          const b = nodes[j]
          delta.subVectors(a.p, b.p); let d2 = delta.lengthSq(); if (d2 < 0.01) { delta.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5); d2 = 0.01 }
          const k = (a.kind === 'tag' && b.kind === 'tag' ? 3.2 : 0.7) / d2
          delta.normalize().multiplyScalar(Math.min(k, 0.6) * alpha)
          a.v.add(delta); b.v.sub(delta)
        }
        const dc = a.p.length(); if (dc < 2.6) a.v.add(tmp.copy(a.p).normalize().multiplyScalar((2.6 - dc) * 0.12))
        a.v.add(tmp.copy(a.p).multiplyScalar(-0.005 * alpha))
      }
      for (const [ai, bi, rest] of edges) {
        const a = nodes[ai], b = nodes[bi]
        delta.subVectors(b.p, a.p); const d = delta.length() || 0.001
        const f = (d - rest) * 0.07 * alpha
        delta.multiplyScalar(f / d)
        if (a.kind !== 'core') a.v.add(delta)
        if (b.kind !== 'core') b.v.sub(delta)
      }
      for (let i = 1; i < N; i++) { const n = nodes[i]; n.v.multiplyScalar(0.8); n.p.add(n.v) }
      alpha = Math.max(alpha * 0.994, 0)
    }

    const burst = () => { const f = bursts.find(b => !b.on); if (f) { f.on = true; f.t = 0 } }
    engineRef.current = { rebuild, burst, zoom: d => { camDistTarget = Math.max(7, Math.min(60, camDistTarget * d)) } }

    // post
    const composer = new EffectComposer(renderer)
    composer.setPixelRatio(pr)
    const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.5, 0.15)
    composer.addPass(new RenderPass(scene, camera)); composer.addPass(bloom); composer.addPass(new OutputPass()); composer.addPass(new ShaderPass(LumaAlphaShader as any))

    let W = 0, H = 0
    const resize = () => {
      W = wrap.clientWidth; H = wrap.clientHeight
      renderer.setSize(W, H); composer.setSize(W, H); bloom.setSize(W, H)
      camera.aspect = W / H; camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(wrap)

    // interaction
    const rot = { x: 0.32, y: 0, vx: 0, vy: 0.0012 }
    let dragging = false, moved = 0, last = { x: 0, y: 0 }, hoverIdx = -1
    const screen: { x: number; y: number; z: number }[] = []
    const pick = (mx: number, my: number) => {
      let best = -1, bd = 18
      for (let i = 1; i < nodes.length; i++) {
        const s = screen[i]; if (!s || s.z > 1) continue
        const d = Math.hypot(s.x - mx, s.y - my)
        const r = nodes[i].kind === 'tag' ? 20 : 14
        if (d < Math.min(bd, r)) { bd = d; best = i }
      }
      return best
    }
    const local = (e: PointerEvent | MouseEvent) => { const r = wrap.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
    const onDown = (e: PointerEvent) => { dragging = true; moved = 0; last = { x: e.clientX, y: e.clientY }; wrap.setPointerCapture(e.pointerId) }
    const onMove = (e: PointerEvent) => {
      if (dragging) {
        const dx = e.clientX - last.x, dy = e.clientY - last.y
        moved += Math.abs(dx) + Math.abs(dy)
        rot.vy = dx * 0.004; rot.vx = dy * 0.003
        rot.y += rot.vy; rot.x = Math.max(-1.2, Math.min(1.2, rot.x + rot.vx))
        last = { x: e.clientX, y: e.clientY }
      }
      const m = local(e); hoverIdx = pick(m.x, m.y)
      wrap.style.cursor = dragging && moved > 4 ? 'grabbing' : hoverIdx >= 0 ? 'pointer' : 'grab'
      const tip = tipRef.current
      if (tip) {
        if (hoverIdx >= 0 && nodes[hoverIdx].kind === 'note') {
          const n = nodes[hoverIdx]
          tip.style.opacity = '1'
          tip.style.transform = `translate(${m.x + 14}px, ${m.y + 10}px)`
          tip.innerHTML = `<div style="font-size:9px;letter-spacing:2px;color:#${n.color.getHexString()}">${(n.type || 'note').toUpperCase()}</div><div style="margin-top:3px">${n.label.replace(/</g, '&lt;')}</div>`
        } else tip.style.opacity = '0'
      }
    }
    const onUp = (e: PointerEvent) => {
      dragging = false
      try { wrap.releasePointerCapture(e.pointerId) } catch { /* noop */ }
      if (moved < 5) {
        const m = local(e); const i = pick(m.x, m.y)
        if (i < 0) propsRef.current.onSelect(null)
        else if (nodes[i].kind === 'tag') propsRef.current.onTag(nodes[i].id.slice(4))
        else if (nodes[i].kind === 'note') propsRef.current.onSelect(nodes[i].id)
      }
    }
    const onLeave = () => { hoverIdx = -1; if (tipRef.current) tipRef.current.style.opacity = '0' }
    wrap.addEventListener('pointerdown', onDown); wrap.addEventListener('pointermove', onMove)
    wrap.addEventListener('pointerup', onUp); wrap.addEventListener('pointerleave', onLeave)

    const clock = new THREE.Clock()
    let raf = 0
    const animate = () => {
      raf = requestAnimationFrame(animate)
      const time = clock.getElapsedTime()
      U.uTime.value = time
      const { selectedId, highlight } = propsRef.current

      // camera / rotation
      if (!dragging) { rot.vy += (0.0012 - rot.vy) * 0.02; rot.vx *= 0.9; rot.y += rot.vy }
      world.rotation.y = rot.y; world.rotation.x = rot.x
      camDist += (camDistTarget - camDist) * 0.05
      camera.position.set(0, 0, camDist); camera.lookAt(0, 0, 0)

      // core
      cA.rotation.y += 0.003; cB.rotation.y -= 0.005
      gyros[0].rotation.y += 0.006; gyros[1].rotation.z += 0.005; gyros[2].rotation.x += 0.0055
      halo.rotation.y -= 0.004; nebula.rotation.y += 0.0006
      corona.scale.setScalar(1 + Math.sin(time * 2.5) * 0.08)
      bursts.forEach(b => {
        if (!b.on) return
        b.t += 0.012; b.m.scale.setScalar(1.2 + b.t * 14); b.mat.opacity = 0.6 * (1 - b.t)
        if (b.t >= 1) { b.on = false; b.mat.opacity = 0 }
      })

      // force layout
      if (alpha > 0.004) step()
      const N = nodes.length

      // write buffers
      if (nodePts && edgeLines && pulsePts) {
        const pos = nodePts.geometry.getAttribute('position') as THREE.BufferAttribute
        const col = nodePts.geometry.getAttribute('aColor') as THREE.BufferAttribute
        const size = nodePts.geometry.getAttribute('aSize') as THREE.BufferAttribute
        const al = nodePts.geometry.getAttribute('aAlpha') as THREE.BufferAttribute
        const selIdx = selectedId ? index.get(selectedId) ?? -1 : -1
        const neighbors = new Set<number>()
        if (selIdx >= 0) edges.forEach(([a, b]) => { if (a === selIdx) neighbors.add(b); if (b === selIdx) neighbors.add(a) })
        for (let i = 0; i < N; i++) {
          const n = nodes[i]
          pos.setXYZ(i, n.p.x, n.p.y, n.p.z)
          col.setXYZ(i, n.color.r, n.color.g, n.color.b)
          let s = n.kind === 'core' ? 0 : n.kind === 'tag' ? 15 + Math.min(n.deg, 10) * 1.2 : 11 + Math.min(n.deg, 6) * 1.8
          let a = 1
          const lit = highlight ? highlight.has(n.id) || (n.kind === 'tag' && false) : true
          if (highlight && !lit) a = 0.12
          if (selIdx >= 0) { if (i === selIdx) { s *= 2.2; a = 1 } else if (neighbors.has(i)) { s *= 1.3; a = Math.max(a, 0.9) } else a = Math.min(a, 0.3) }
          if (i === hoverIdx) s *= 1.6
          size.setX(i, s); al.setX(i, a)
          // screen + labels
          tmp.copy(n.p).applyMatrix4(world.matrixWorld).project(camera)
          screen[i] = { x: (tmp.x + 1) / 2 * W, y: (1 - tmp.y) / 2 * H, z: tmp.z }
          if (n.el) {
            const show = n.kind === 'tag' ? (a > 0.2 ? 0.9 : 0.15)
              : (i === selIdx || neighbors.has(i) || (highlight && lit) || i === hoverIdx) ? 1
              : 0
            n.el.style.opacity = String(show)
            n.el.style.transform = `translate(${screen[i].x}px, ${screen[i].y}px) translate(-50%, ${n.kind === 'tag' ? '14px' : '-22px'})`
          }
        }
        pos.needsUpdate = col.needsUpdate = size.needsUpdate = al.needsUpdate = true

        const ep = edgeLines.geometry.getAttribute('position') as THREE.BufferAttribute
        const ec = edgeLines.geometry.getAttribute('color') as THREE.BufferAttribute
        edges.forEach(([ai, bi], k) => {
          const a = nodes[ai], b = nodes[bi]
          ep.setXYZ(k * 2, a.p.x, a.p.y, a.p.z); ep.setXYZ(k * 2 + 1, b.p.x, b.p.y, b.p.z)
          let w = a.kind === 'core' || b.kind === 'core' ? 0.1 : a.kind === 'note' && b.kind === 'note' ? 0.5 : 0.24
          if (selIdx >= 0) w = (ai === selIdx || bi === selIdx) ? 0.9 : w * 0.25
          if (highlight) w = (highlight.has(a.id) || highlight.has(b.id)) ? Math.max(w, 0.6) : w * 0.2
          const ca = a.kind === 'core' ? b.color : a.color, cb = b.kind === 'core' ? a.color : b.color
          ec.setXYZ(k * 2, ca.r * w, ca.g * w, ca.b * w); ec.setXYZ(k * 2 + 1, cb.r * w, cb.g * w, cb.b * w)
        })
        ep.needsUpdate = ec.needsUpdate = true

        const pp = pulsePts.geometry.getAttribute('position') as THREE.BufferAttribute
        for (let i = 0; i < PULSES; i++) {
          const st = pulseState[i]
          if (!edges.length) { pp.setXYZ(i, 999, 999, 999); continue }
          st.t += st.s
          if (st.t >= 1) { st.t = 0; st.e = Math.floor(Math.random() * edges.length) }
          const [ai, bi] = edges[st.e] || [0, 0]
          tmp.copy(nodes[bi].p).lerp(nodes[ai].p, st.t)
          pp.setXYZ(i, tmp.x, tmp.y, tmp.z)
        }
        pp.needsUpdate = true
      }
      hubRings.forEach(h => { h.ring.position.copy(h.node.p); h.ring.rotation.y += 0.01; h.ring.rotation.z += 0.004 })

      bloom.strength += ((0.55 + Math.sin(time * 1.4) * 0.04) - bloom.strength) * 0.05
      composer.render()
    }
    animate()

    return () => {
      cancelAnimationFrame(raf); ro.disconnect()
      wrap.removeEventListener('pointerdown', onDown); wrap.removeEventListener('pointermove', onMove)
      wrap.removeEventListener('pointerup', onUp); wrap.removeEventListener('pointerleave', onLeave)
      clearGraph()
      disposables.forEach(x => { try { x.dispose() } catch { /* noop */ } })
      composer.dispose?.(); renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
      engineRef.current = null
    }
  }, [])

  // rebuild graph when notes change
  useEffect(() => { engineRef.current?.rebuild(propsRef.current.notes) }, [graphKey, failed])
  // burst on new capture
  useEffect(() => { if (props.burstId) engineRef.current?.burst() }, [props.burstId])

  if (failed) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(160,200,240,0.6)', fontFamily: 'Space Mono, monospace', fontSize: 11 }}>WebGL not available</div>
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', height, overflow: 'hidden', touchAction: 'none', cursor: 'grab' }}>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      <div ref={labelsRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      <div ref={tipRef} style={{
        position: 'absolute', left: 0, top: 0, pointerEvents: 'none', opacity: 0, transition: 'opacity .15s',
        padding: '8px 11px', borderRadius: 8, maxWidth: 260, fontSize: 12, color: '#e8f3ff', lineHeight: 1.35,
        background: 'rgba(6,16,38,0.85)', border: '1px solid rgba(120,200,255,0.25)', backdropFilter: 'blur(8px)',
        fontFamily: 'DM Sans, system-ui, sans-serif', zIndex: 5,
      }} />
      <div style={{ position: 'absolute', right: 14, bottom: 14, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 4 }}>
        {[['+', 0.8], ['−', 1.25]].map(([l, d]) => (
          <button key={l as string} onClick={() => engineRef.current?.zoom(d as number)} style={{
            width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 15, color: '#cfe8ff',
            background: 'rgba(10,24,54,0.6)', border: '1px solid rgba(120,200,255,0.25)',
          }}>{l}</button>
        ))}
      </div>
    </div>
  )
}
