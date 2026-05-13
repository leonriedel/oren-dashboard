'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

import SecondBrain from '@/components/modules/SecondBrain'
import Finances from '@/components/modules/Finances'
import Investments from '@/components/modules/Investments'
import News from '@/components/modules/News'
import ThinkSpace from '@/components/modules/ThinkSpace'
import Sport from '@/components/modules/Sport'
import SocialMedia from '@/components/modules/SocialMedia'
import TalkToOren from '@/components/modules/TalkToOren'

type Screen = 'home' | 'brain' | 'finance' | 'invest' | 'news' | 'think' | 'sport' | 'social' | 'talk'
type OrbState = 'idle' | 'thinking' | 'speaking' | 'listening'

type Priority = { id: string; text: string; done: boolean }
type CalEvent = { id: string; title: string; date?: string; time?: string }

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [screen, setScreen] = useState<Screen>('home')
  const [time, setTime] = useState({ bali: '', de: '', date: '', mode: '' })
  const [quickInput, setQuickInput] = useState('')
  const [orbState, setOrbState] = useState<OrbState>('idle')
  const [listening, setListening] = useState(false)
  const [quickResponse, setQuickResponse] = useState<string>('')
  const [quickActions, setQuickActions] = useState<string[]>([])
  const [priorities, setPriorities] = useState<Priority[]>([])
  const [events, setEvents] = useState<CalEvent[]>([])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const orbBoxRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login')
      else setUser(session.user)
    })
  }, [router])

  useEffect(() => {
    if (!user) return
    const supabase = createClient()
    supabase.from('priorities').select('id, text, done').eq('user_id', user.id).eq('done', false).limit(5).then(({ data }: any) => {
      if (data) setPriorities(data)
    })
    fetch('/api/calendar').then(r => r.json()).then(data => {
      if (data && Array.isArray(data.events)) setEvents(data.events.slice(0, 5))
    }).catch(() => {})
  }, [user])

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const bali = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Makassar' }))
      const de = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
      const days = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag']
      const months = ['Jan','Feb','Mar','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
      const fmt = (d: Date) => String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + ':' + String(d.getSeconds()).padStart(2,'0')
      const h = de.getHours()
      const mode = h >= 22 || h < 6 ? 'NIGHT' : h < 12 ? 'MORNING' : h < 18 ? 'WORK' : 'EVENING'
      setTime({ bali: fmt(bali), de: fmt(de), date: days[now.getDay()] + ', ' + now.getDate() + '. ' + months[now.getMonth()], mode })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (screen !== 'home') return
    const canvas = canvasRef.current
    const box = orbBoxRef.current
    if (!canvas || !box) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const setSize = () => {
      const rect = box.getBoundingClientRect()
      canvas.width = Math.max(rect.width, 100) * dpr
      canvas.height = Math.max(rect.height, 100) * dpr
      canvas.style.width = rect.width + 'px'
      canvas.style.height = rect.height + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    setSize()
    const ro = new ResizeObserver(setSize)
    ro.observe(box)
    window.addEventListener('resize', setSize)

    const cx = () => canvas.width / dpr / 2
    const cy = () => canvas.height / dpr / 2

    type P = { angle: number; radius: number; speed: number; size: number; opacity: number; ringIndex: number; tilt: number }
    const particles: P[] = []
    for (let i = 0; i < 320; i++) {
      const ringIndex = Math.floor(Math.random() * 5)
      particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: 110 + ringIndex * 35 + Math.random() * 28,
        speed: (0.0008 + Math.random() * 0.0018) * (Math.random() > 0.5 ? 1 : -1),
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.7 + 0.25,
        ringIndex,
        tilt: Math.random() * 0.5 + 0.45
      })
    }

    let animId: number
    let pulse = 0

    const draw = () => {
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      ctx.clearRect(0, 0, w, h)
      pulse += 0.018
      const mult = orbState === 'thinking' ? 1.5 : orbState === 'speaking' ? 1.7 : orbState === 'listening' ? 2.0 : 1
      const boost = orbState !== 'idle' ? 1 : 0

      const orbR = 70 + Math.sin(pulse * 1.2) * 6 * mult

      const halo = ctx.createRadialGradient(cx(), cy(), 0, cx(), cy(), orbR * 5)
      halo.addColorStop(0, 'rgba(120, 180, 255, ' + (0.4 + boost * 0.15) + ')')
      halo.addColorStop(0.25, 'rgba(80, 140, 240, ' + (0.2 + boost * 0.1) + ')')
      halo.addColorStop(0.55, 'rgba(60, 100, 200, 0.06)')
      halo.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(cx(), cy(), orbR * 5, 0, Math.PI * 2)
      ctx.fill()

      const core = ctx.createRadialGradient(cx() - orbR * 0.25, cy() - orbR * 0.25, 0, cx(), cy(), orbR)
      core.addColorStop(0, 'rgba(230, 245, 255, ' + (0.95 + boost * 0.05) + ')')
      core.addColorStop(0.4, 'rgba(120, 180, 255, ' + (0.7 + boost * 0.2) + ')')
      core.addColorStop(0.8, 'rgba(60, 110, 220, 0.5)')
      core.addColorStop(1, 'rgba(30, 60, 160, 0.15)')
      ctx.fillStyle = core
      ctx.beginPath()
      ctx.arc(cx(), cy(), orbR, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.5 + boost * 0.1) + ')'
      ctx.beginPath()
      ctx.arc(cx() - orbR * 0.3, cy() - orbR * 0.35, orbR * 0.2, 0, Math.PI * 2)
      ctx.fill()

      for (const p of particles) {
        p.angle += p.speed * mult
        const wobble = Math.sin(pulse * 0.6 + p.ringIndex) * 5
        const r = p.radius + wobble
        const x = cx() + Math.cos(p.angle) * r
        const y = cy() + Math.sin(p.angle) * r * p.tilt

        const a = p.opacity * (0.6 + Math.sin(pulse + p.angle) * 0.4) * (1 + boost * 0.3)
        ctx.fillStyle = 'rgba(150, 200, 255, ' + Math.min(1, a) + ')'
        ctx.beginPath()
        ctx.arc(x, y, p.size * (1 + boost * 0.4), 0, Math.PI * 2)
        ctx.fill()

        if (p.size > 1.4) {
          ctx.fillStyle = 'rgba(180, 220, 255, ' + a * 0.18 + ')'
          ctx.beginPath()
          ctx.arc(x, y, p.size * 4, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      animId = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(animId)
      ro.disconnect()
      window.removeEventListener('resize', setSize)
    }
  }, [orbState, screen])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const r = new SR()
    r.lang = 'de-DE'
    r.interimResults = false
    r.continuous = false
    r.onresult = (e: any) => {
      const t = e.results[0][0].transcript
      setQuickInput(t)
      setListening(false)
      setOrbState('idle')
      setTimeout(() => sendQuick(t), 100)
    }
    r.onerror = () => { setListening(false); setOrbState('idle') }
    r.onend = () => { setListening(false) }
    recognitionRef.current = r
  }, [])

  function toggleListen() {
    if (!recognitionRef.current) { alert('Voice nicht unterstuetzt. Nimm Chrome/Safari.'); return }
    if (listening) { recognitionRef.current.stop(); setListening(false); setOrbState('idle') }
    else { try { recognitionRef.current.start(); setListening(true); setOrbState('listening') } catch (e) { console.error(e) } }
  }

  function speak(text: string) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const clean = text.replace(/```[\s\S]*?```/g, '').replace(/[*_#]/g, '').trim()
    if (!clean) return
    const u = new SpeechSynthesisUtterance(clean)
    u.lang = 'de-DE'
    const voices = window.speechSynthesis.getVoices()
    const male = voices.find(v => v.lang.startsWith('de') && /eddy|reed|rocko|grandpa|markus|yannick/i.test(v.name)) || voices.find(v => v.lang.startsWith('de'))
    if (male) u.voice = male
    u.rate = 1.05
    u.pitch = 0.95
    u.onstart = () => setOrbState('speaking')
    u.onend = () => setOrbState('idle')
    window.speechSynthesis.speak(u)
  }

  async function executeActions(actions: any[]): Promise<string[]> {
    if (!user) return []
    const supabase = createClient()
    const results: string[] = []
    for (const a of actions) {
      try {
        if (a.type === 'add_priority' && a.text) {
          await supabase.from('priorities').insert({ user_id: user.id, text: a.text, done: false })
          results.push('Prio: ' + a.text)
        } else if (a.type === 'add_goal' && a.text) {
          await supabase.from('goals').insert({ user_id: user.id, text: a.text, done: false })
          results.push('Goal: ' + a.text)
        } else if (a.type === 'add_thinkspace' && a.text) {
          await supabase.from('thinkspace').insert({ user_id: user.id, type: a.category || 'idea', text: a.text })
          results.push('ThinkSpace: ' + a.text)
        } else if (a.type === 'add_transaction' && a.description && a.amount) {
          await supabase.from('transactions').insert({
            user_id: user.id, type: a.kind || 'expense', description: a.description, amount: a.amount,
            category: a.category || (a.kind === 'expense' ? 'private' : 'business'),
            date: new Date().toISOString().split('T')[0]
          })
          results.push((a.kind === 'income' ? 'Einnahme' : 'Ausgabe') + ': ' + a.description + ' (' + a.amount + 'E)')
        } else if (a.type === 'add_food_note' && a.text) {
          await supabase.from('food_notes').insert({ user_id: user.id, text: a.text })
          results.push('Ernaehrung: ' + a.text)
        } else if (a.type === 'add_brain_dump' && a.text) {
          await supabase.from('brain_dump').insert({ user_id: user.id, text: a.text })
          results.push('Brain Dump: ' + a.text)
        }
      } catch (err) { results.push('Fehler bei ' + a.type) }
    }
    if (results.length > 0 && user) {
      const supabase = createClient()
      supabase.from('priorities').select('id, text, done').eq('user_id', user.id).eq('done', false).limit(5).then(({ data }: any) => {
        if (data) setPriorities(data)
      })
    }
    return results
  }

  async function sendQuick(text: string) {
    if (!text.trim()) return
    setQuickInput('')
    setOrbState('thinking')
    setQuickResponse('')
    setQuickActions([])
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: text }] })
      })
      const data = await res.json()
      let executed: string[] = []
      if (data.actions && data.actions.length > 0) executed = await executeActions(data.actions)
      setQuickResponse(data.content)
      setQuickActions(executed)
      speak(data.content)
    } catch (err) {
      setQuickResponse('Fehler.')
      setOrbState('idle')
    }
  }

  const go = useCallback((s: Screen) => setScreen(s), [])
  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (!user) return <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#000' }}><div style={{ width:32, height:32, borderRadius:'50%', background:'radial-gradient(circle at 35% 35%, #00d4ff, #0044aa)' }} /></div>

  const modules: { id: Screen; label: string; desc: string; icon: any }[] = [
    { id:'brain', label:'SECONDBRAIN', desc:'Daily Command Center', icon:(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 3a3 3 0 00-3 3v1a3 3 0 00-3 3v3a3 3 0 003 3v1a3 3 0 003 3M15 3a3 3 0 013 3v1a3 3 0 013 3v3a3 3 0 01-3 3v1a3 3 0 01-3 3M9 8h6M9 16h6"/></svg>) },
    { id:'finance', label:'FINANCES', desc:'Wealth & Liquidity', icon:(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 9.5h4.5a2.5 2.5 0 010 5H9"/></svg>) },
    { id:'invest', label:'INVESTMENTS', desc:'Portfolio & Returns', icon:(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 17l6-6 4 4 8-8M15 7h6v6"/></svg>) },
    { id:'news', label:'NEWS', desc:'Intel & Headlines', icon:(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>) },
    { id:'think', label:'THINKSPACE', desc:'Strategy & Deep Thinking', icon:(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7c.7.6 1 1.4 1 2.3h6c0-.9.3-1.7 1-2.3A7 7 0 0012 2z"/></svg>) },
    { id:'sport', label:'SPORT', desc:'Body & Performance', icon:(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 6L3 9l3 3M18 12l3 3-3 3M9 18l-3 3M15 6l3-3M9 15L15 9"/></svg>) },
    { id:'social', label:'SOCIAL MEDIA', desc:'Content & Growth', icon:(<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>) },
  ]

  if (screen !== 'home') {
    const props = { user, onBack: () => go('home') }
    return (
      <div style={{ minHeight:'100vh', background:'#000' }}>
        {screen === 'talk' && <TalkToOren {...props} />}
        {screen === 'brain' && <SecondBrain {...props} />}
        {screen === 'finance' && <Finances {...props} />}
        {screen === 'invest' && <Investments {...props} />}
        {screen === 'news' && <News {...props} />}
        {screen === 'think' && <ThinkSpace {...props} />}
        {screen === 'sport' && <Sport {...props} />}
        {screen === 'social' && <SocialMedia {...props} />}
      </div>
    )
  }

  const stateLabel = orbState === 'thinking' ? 'PROCESSING' : orbState === 'speaking' ? 'SPEAKING' : orbState === 'listening' ? 'LISTENING' : 'STANDBY'

  return (
    <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at center, #0a1530 0%, #050810 60%, #000 100%)', color:'#e0e8ff', fontFamily:'DM Sans, system-ui, sans-serif', position:'relative', overflow:'hidden' }}>
      {/* Top bar */}
      <div style={{ position:'absolute', top:20, left:0, right:0, display:'flex', justifyContent:'space-between', padding:'0 28px', fontFamily:'Space Mono, monospace', fontSize:10, letterSpacing:3, color:'#5a7ab5', zIndex:5 }}>
        <div>{time.mode} · {time.date}</div>
        <div style={{ textAlign:'right' }}>BALI {time.bali}<br/>DE&nbsp;&nbsp;&nbsp;{time.de}</div>
      </div>

      {/* Main 3-column grid */}
      <div className="oren-grid" style={{ minHeight:'100vh', display:'grid', gridTemplateColumns:'minmax(260px, 320px) 1fr minmax(260px, 320px)', gap:24, padding:'80px 28px 40px', maxWidth:1600, margin:'0 auto' }}>

        {/* LEFT — Today */}
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          <div style={{ background:'rgba(15,25,50,0.4)', border:'1px solid rgba(120,180,255,0.15)', borderRadius:14, padding:'18px 20px', backdropFilter:'blur(12px)' }}>
            <div style={{ fontFamily:'Space Mono, monospace', fontSize:10, letterSpacing:2.5, color:'#5a7ab5', marginBottom:14 }}>TODAY · TERMINE</div>
            {events.length === 0 ? (
              <div style={{ fontSize:12, color:'#5a7ab5', fontStyle:'italic' }}>Keine Termine.</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {events.map(e => (
                  <div key={e.id} style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                    <div style={{ fontFamily:'Space Mono, monospace', fontSize:10, color:'#a0c0ff', minWidth:48, paddingTop:2 }}>{e.time || (e.date ? new Date(e.date).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}) : '')}</div>
                    <div style={{ fontSize:13, color:'#dde7ff', lineHeight:1.4 }}>{e.title}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background:'rgba(15,25,50,0.4)', border:'1px solid rgba(120,180,255,0.15)', borderRadius:14, padding:'18px 20px', backdropFilter:'blur(12px)' }}>
            <div style={{ fontFamily:'Space Mono, monospace', fontSize:10, letterSpacing:2.5, color:'#5a7ab5', marginBottom:14 }}>TOP PRIORITIES</div>
            {priorities.length === 0 ? (
              <div style={{ fontSize:12, color:'#5a7ab5', fontStyle:'italic' }}>Keine Prios. Sag Oren was wichtig ist.</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {priorities.map((p, i) => (
                  <div key={p.id} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                    <div style={{ fontFamily:'Space Mono, monospace', fontSize:10, color:'#a0c0ff', minWidth:18, paddingTop:2 }}>0{i+1}</div>
                    <div style={{ fontSize:13, color:'#dde7ff', lineHeight:1.4 }}>{p.text}</div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => go('brain')} style={{ marginTop:14, background:'transparent', border:'1px solid rgba(120,180,255,0.25)', color:'#a0c0ff', padding:'7px 12px', borderRadius:999, fontSize:10, cursor:'pointer', fontFamily:'Space Mono, monospace', letterSpacing:1.5, width:'100%' }}>OPEN SECONDBRAIN</button>
          </div>
        </div>

        {/* CENTER — Orb */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-start', gap:24 }}>
          <div ref={orbBoxRef} style={{ position:'relative', width:'100%', height:'520px', maxWidth:'600px' }}>
            <canvas ref={canvasRef} style={{ position:'absolute', top:0, left:0, pointerEvents:'none' }} />
            <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%, calc(-50% + 110px))', textAlign:'center', pointerEvents:'none' }}>
              <h1 style={{ fontFamily:'Space Mono, monospace', fontSize:32, fontWeight:700, color:'#a0c8ff', letterSpacing:8, margin:0, textShadow:'0 0 30px rgba(120,180,255,0.5)' }}>OREN</h1>
              <div style={{ fontFamily:'Space Mono, monospace', fontSize:10, letterSpacing:5, color:'#5a7ab5', marginTop:10 }}>{stateLabel}</div>
            </div>
          </div>

          <div style={{ width:'100%', maxWidth:560 }}>
            <div style={{ display:'flex', gap:8, padding:8, background:'rgba(15,25,50,0.85)', border:'1px solid rgba(120,180,255,0.3)', borderRadius:999, backdropFilter:'blur(24px)', boxShadow:'0 12px 60px rgba(0,40,100,0.5)' }}>
              <input value={quickInput} onChange={e => setQuickInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendQuick(quickInput) }} placeholder={listening ? 'Listening...' : 'Sprich mit Oren...'} style={{ flex:1, background:'transparent', border:'none', outline:'none', color:'#e0e8ff', fontSize:15, padding:'10px 16px', fontFamily:'inherit' }} />
              <button onClick={toggleListen} style={{ background:listening?'rgba(255,100,100,0.25)':'rgba(120,180,255,0.15)', border:listening?'1px solid rgba(255,100,100,0.5)':'1px solid rgba(120,180,255,0.3)', color:listening?'#ff8080':'#a0c0ff', width:42, height:42, borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3"/></svg>
              </button>
              <button onClick={() => sendQuick(quickInput)} disabled={!quickInput.trim()} style={{ background:!quickInput.trim()?'rgba(120,180,255,0.1)':'linear-gradient(135deg, #6090ff, #a060ff)', border:'none', color:'#fff', width:42, height:42, borderRadius:'50%', cursor:!quickInput.trim()?'not-allowed':'pointer', opacity:!quickInput.trim()?0.4:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
              </button>
            </div>

            {quickResponse && (
              <div style={{ marginTop:14, padding:'14px 18px', background:'rgba(20,30,60,0.6)', border:'1px solid rgba(120,180,255,0.2)', borderRadius:16, backdropFilter:'blur(20px)', fontSize:14, lineHeight:1.6, whiteSpace:'pre-wrap' }}>
                {quickResponse}
                {quickActions.length > 0 && (<div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid rgba(120,180,255,0.2)', fontSize:12, color:'#7dd3a0', fontFamily:'Space Mono, monospace' }}>{quickActions.map((a, j) => <div key={j}>{a}</div>)}</div>)}
                <button onClick={() => go('talk')} style={{ marginTop:12, background:'transparent', border:'1px solid rgba(120,180,255,0.3)', color:'#a0c0ff', padding:'6px 12px', borderRadius:999, fontSize:11, cursor:'pointer', fontFamily:'Space Mono, monospace', letterSpacing:1.5 }}>OPEN FULL CHAT</button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — Modules */}
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ fontFamily:'Space Mono, monospace', fontSize:10, letterSpacing:2.5, color:'#5a7ab5', padding:'0 4px 4px' }}>MODULES</div>
          {modules.map(mod => (
            <div key={mod.id} onClick={() => go(mod.id)} style={{ background:'rgba(20,30,60,0.45)', border:'1px solid rgba(120,180,255,0.15)', borderRadius:12, padding:'14px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:12, backdropFilter:'blur(12px)', transition:'all 0.2s' }} onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(120,180,255,0.5)'; (e.currentTarget as HTMLDivElement).style.background = 'rgba(30,45,85,0.6)' }} onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(120,180,255,0.15)'; (e.currentTarget as HTMLDivElement).style.background = 'rgba(20,30,60,0.45)' }}>
              <div style={{ width:34, height:34, borderRadius:9, background:'rgba(120,180,255,0.08)', border:'1px solid rgba(120,180,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', color:'#a0c0ff', flexShrink:0 }}>{mod.icon}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:'Space Mono, monospace', fontSize:11, fontWeight:700, letterSpacing:1.8, color:'#dde7ff' }}>{mod.label}</div>
                <div style={{ fontSize:10, color:'#7a9fdc', marginTop:2, letterSpacing:0.3 }}>{mod.desc}</div>
              </div>
              <div style={{ color:'#5a7ab5', fontSize:14 }}>›</div>
            </div>
          ))}
          <button onClick={handleLogout} style={{ marginTop:12, background:'transparent', border:'none', color:'#5a7ab5', fontFamily:'Space Mono, monospace', fontSize:10, letterSpacing:2.5, cursor:'pointer', padding:'10px', alignSelf:'center' }}>LOGOUT</button>
        </div>
      </div>

      <style>{`
        @media (max-width: 1100px) {
          .oren-grid { grid-template-columns: 1fr !important; gap: 20px !important; padding: 70px 20px 40px !important; }
          .oren-grid > div:nth-child(1) { order: 2; }
          .oren-grid > div:nth-child(2) { order: 1; }
          .oren-grid > div:nth-child(3) { order: 3; }
        }
        @media (max-width: 600px) {
          .oren-grid { padding: 60px 14px 30px !important; }
        }
      `}</style>
    </div>
  )
}
