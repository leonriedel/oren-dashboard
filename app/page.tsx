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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login')
      else setUser(session.user)
    })
  }, [router])

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const bali = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Makassar' }))
      const de = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
      const days = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag']
      const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
      const fmt = (d: Date) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
      const h = de.getHours()
      const mode = h >= 22 || h < 6 ? '🌙 Night mode' : h < 12 ? '☀️ Morning mode' : h < 18 ? '⚡ Work mode' : '🌅 Evening mode'
      setTime({ bali: fmt(bali), de: fmt(de), date: `${days[now.getDay()]}, ${now.getDate()}. ${months[now.getMonth()]}`, mode })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Particle animation
  useEffect(() => {
    if (screen !== 'home') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const parent = canvas.parentElement
    const setSize = () => {
      const w = parent ? parent.clientWidth : window.innerWidth
      const h = parent ? parent.clientHeight : 400
      canvas.width = w
      canvas.height = h
    }
    setSize()
    window.addEventListener('resize', setSize)

    const cx = () => canvas.width / 2
    const cy = () => canvas.height / 2

    type Particle = { angle: number; radius: number; speed: number; size: number; opacity: number; ringIndex: number }
    const particles: Particle[] = []
    for (let i = 0; i < 180; i++) {
      const ringIndex = Math.floor(Math.random() * 4)
      particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: 70 + ringIndex * 28 + Math.random() * 20,
        speed: (0.0008 + Math.random() * 0.0015) * (Math.random() > 0.5 ? 1 : -1),
        size: Math.random() * 1.6 + 0.4,
        opacity: Math.random() * 0.6 + 0.2,
        ringIndex
      })
    }

    let animId: number
    let pulse = 0

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      pulse += 0.02
      const mult = orbState === 'thinking' ? 1.4 : orbState === 'speaking' ? 1.6 : orbState === 'listening' ? 1.8 : 1
      const boost = orbState !== 'idle' ? 1 : 0

      const orbR = 42 + Math.sin(pulse * 1.2) * 3.5 * mult

      const grad = ctx.createRadialGradient(cx(), cy(), 0, cx(), cy(), orbR * 3.5)
      grad.addColorStop(0, `rgba(120, 180, 255, ${0.4 + boost * 0.2})`)
      grad.addColorStop(0.3, `rgba(80, 140, 240, ${0.22 + boost * 0.15})`)
      grad.addColorStop(0.6, 'rgba(60, 100, 200, 0.07)')
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx(), cy(), orbR * 3.5, 0, Math.PI * 2)
      ctx.fill()

      const core = ctx.createRadialGradient(cx(), cy(), 0, cx(), cy(), orbR)
      core.addColorStop(0, `rgba(200, 230, 255, ${0.9 + boost * 0.1})`)
      core.addColorStop(0.5, `rgba(100, 160, 255, ${0.55 + boost * 0.2})`)
      core.addColorStop(1, 'rgba(40, 80, 180, 0.18)')
      ctx.fillStyle = core
      ctx.beginPath()
      ctx.arc(cx(), cy(), orbR, 0, Math.PI * 2)
      ctx.fill()

      for (const p of particles) {
        p.angle += p.speed * mult
        const wobble = Math.sin(pulse * 0.5 + p.ringIndex) * 2.5
        const r = p.radius + wobble
        const x = cx() + Math.cos(p.angle) * r
        const y = cy() + Math.sin(p.angle) * r * 0.55

        const a = p.opacity * (0.7 + Math.sin(pulse + p.angle) * 0.3) * (1 + boost * 0.3)
        ctx.fillStyle = `rgba(150, 200, 255, ${Math.min(1, a)})`
        ctx.beginPath()
        ctx.arc(x, y, p.size * (1 + boost * 0.4), 0, Math.PI * 2)
        ctx.fill()

        if (p.size > 1.3) {
          ctx.fillStyle = `rgba(180, 220, 255, ${a * 0.15})`
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
      window.removeEventListener('resize', setSize)
    }
  }, [orbState, screen])

  // Voice setup
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
    r.onend = () => { setListening(false); if (orbState === 'listening') setOrbState('idle') }
    recognitionRef.current = r
  }, [])

  function toggleListen() {
    if (!recognitionRef.current) { alert('Voice nicht unterstützt. Nimm Chrome/Safari.'); return }
    if (listening) { recognitionRef.current.stop(); setListening(false); setOrbState('idle') }
    else { try { recognitionRef.current.start(); setListening(true); setOrbState('listening') } catch (e) { console.error(e) } }
  }

  function speak(text: string) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const clean = text.replace(/```[\s\S]*?```/g, '').replace(/[*_#]/g, '').trim()
    if (!clean) return
    const u = new SpeechSynthesisUtterance(clean)
    u.lang = 'de-DE'
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
          results.push(`✓ Prio: ${a.text}`)
        } else if (a.type === 'add_goal' && a.text) {
          await supabase.from('goals').insert({ user_id: user.id, text: a.text, done: false })
          results.push(`✓ Goal: ${a.text}`)
        } else if (a.type === 'add_thinkspace' && a.text) {
          await supabase.from('thinkspace').insert({ user_id: user.id, type: a.category || 'idea', text: a.text })
          results.push(`✓ ThinkSpace: ${a.text}`)
        } else if (a.type === 'add_transaction' && a.description && a.amount) {
          await supabase.from('transactions').insert({
            user_id: user.id, type: a.kind || 'expense', description: a.description, amount: a.amount,
            category: a.category || (a.kind === 'expense' ? 'private' : 'business'),
            date: new Date().toISOString().split('T')[0]
          })
          results.push(`✓ ${a.kind === 'income' ? 'Einnahme' : 'Ausgabe'}: ${a.description} (${a.amount}€)`)
        } else if (a.type === 'add_food_note' && a.text) {
          await supabase.from('food_notes').insert({ user_id: user.id, text: a.text })
          results.push(`✓ Ernährung: ${a.text}`)
        } else if (a.type === 'add_brain_dump' && a.text) {
          await supabase.from('brain_dump').insert({ user_id: user.id, text: a.text })
          results.push(`✓ Brain Dump: ${a.text}`)
        }
      } catch (err) { results.push(`✗ Fehler bei ${a.type}`) }
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

  if (!user) return <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}><div style={{ width:32, height:32, borderRadius:'50%', background:'radial-gradient(circle at 35% 35%, #00d4ff, #0044aa)' }} /></div>

  const modules: { id: Screen; icon: string; label: string; desc: string; bg: string }[] = [
    { id:'brain', icon:'🧠', label:'SECONDBRAIN', desc:'Priorities · Calendar · Notes · Goals', bg:'linear-gradient(135deg, #005577, #0088bb)' },
    { id:'finance', icon:'💰', label:'FINANCES', desc:'Wealth & Liquidity', bg:'linear-gradient(135deg, #1a5c2a, #2d9e48)' },
    { id:'invest', icon:'📈', label:'INVESTMENTS', desc:'Portfolio & Returns', bg:'linear-gradient(135deg, #5c4500, #c78800)' },
    { id:'news', icon:'📰', label:'NEWS', desc:'Intel & Headlines', bg:'linear-gradient(135deg, #0a3a5c, #1466a0)' },
    { id:'think', icon:'💡', label:'THINKSPACE', desc:'Strategy & Deep Thinking', bg:'linear-gradient(135deg, #3b1a6e, #7c3aed)' },
    { id:'sport', icon:'🏋️', label:'SPORT & ERNÄHRUNG', desc:'Body & Performance', bg:'linear-gradient(135deg, #5c2000, #c45200)' },
    { id:'social', icon:'📲', label:'SOCIAL MEDIA', desc:'Content & Growth', bg:'linear-gradient(135deg, #5c0030, #c0115e)' },
  ]

  if (screen !== 'home') {
    const props = { user, onBack: () => go('home') }
    return (
      <div style={{ minHeight:'100vh', background:'var(--bg)' }}>
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
    <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse at top, #0a1530 0%, #050810 60%, #000 100%)', color:'#e0e8ff' }}>
      {/* Hero with orb */}
      <div style={{ position:'relative', height:'58vh', minHeight:'420px', maxHeight:'520px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
        <canvas ref={canvasRef} style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none' }} />

        <div style={{ position:'relative', zIndex:2, marginTop:'140px', textAlign:'center' }}>
          <h1 style={{ fontFamily:'var(--mono, Space Mono)', fontSize:24, fontWeight:700, color:'#a0c8ff', letterSpacing:6, margin:0 }}>OREN</h1>
          <div style={{ fontFamily:'var(--mono, Space Mono)', fontSize:9, letterSpacing:4, color:'#5a7ab5', marginTop:6 }}>{stateLabel}</div>
        </div>
      </div>

      {/* Quick chat input */}
      <div style={{ maxWidth:520, margin:'-40px auto 0', padding:'0 20px', position:'relative', zIndex:3 }}>
        <div style={{ display:'flex', gap:8, padding:8, background:'rgba(15,25,50,0.75)', border:'1px solid rgba(120,180,255,0.25)', borderRadius:999, backdropFilter:'blur(24px)', boxShadow:'0 12px 48px rgba(0,30,80,0.6)' }}>
          <input
            value={quickInput}
            onChange={e => setQuickInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') sendQuick(quickInput) }}
            placeholder={listening ? 'Listening...' : 'Sprich mit Oren...'}
            style={{ flex:1, background:'transparent', border:'none', outline:'none', color:'#e0e8ff', fontSize:15, padding:'8px 14px', fontFamily:'inherit' }}
          />
          <button onClick={toggleListen} style={{ background:listening?'rgba(255,100,100,0.25)':'rgba(120,180,255,0.15)', border:listening?'1px solid rgba(255,100,100,0.5)':'1px solid rgba(120,180,255,0.3)', color:listening?'#ff8080':'#a0c0ff', width:38, height:38, borderRadius:'50%', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0014 0v-2M12 19v3"/></svg>
          </button>
          <button onClick={() => sendQuick(quickInput)} disabled={!quickInput.trim()} style={{ background:!quickInput.trim()?'rgba(120,180,255,0.1)':'linear-gradient(135deg, #6090ff, #a060ff)', border:'none', color:'#fff', width:38, height:38, borderRadius:'50%', cursor:!quickInput.trim()?'not-allowed':'pointer', opacity:!quickInput.trim()?0.4:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
          </button>
        </div>

        {quickResponse && (
          <div style={{ marginTop:14, padding:'14px 18px', background:'rgba(20,30,60,0.6)', border:'1px solid rgba(120,180,255,0.18)', borderRadius:16, backdropFilter:'blur(20px)', fontSize:14, lineHeight:1.55, whiteSpace:'pre-wrap' }}>
            {quickResponse}
            {quickActions.length > 0 && (
              <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid rgba(120,180,255,0.2)', fontSize:12, color:'#7dd3a0', fontFamily:'var(--mono, Space Mono)' }}>
                {quickActions.map((a, j) => <div key={j}>{a}</div>)}
              </div>
            )}
            <button onClick={() => go('talk')} style={{ marginTop:12, background:'transparent', border:'1px solid rgba(120,180,255,0.3)', color:'#a0c0ff', padding:'6px 12px', borderRadius:999, fontSize:11, cursor:'pointer', fontFamily:'var(--mono, Space Mono)', letterSpacing:1 }}>OPEN FULL CHAT →</button>
          </div>
        )}
      </div>

      {/* Time card */}
      <div style={{ maxWidth:520, margin:'24px auto 0', padding:'0 20px' }}>
        <div style={{ background:'rgba(20,30,60,0.4)', border:'1px solid rgba(120,180,255,0.15)', borderRadius:12, padding:'12px 20px', textAlign:'center', backdropFilter:'blur(12px)' }}>
          <div style={{ fontSize:13, marginBottom:6, color:'#dde7ff' }}>{time.mode}</div>
          <div style={{ fontFamily:'var(--mono, Space Mono)', fontSize:11, color:'#7a9fdc', display:'flex', gap:12, justifyContent:'center' }}>
            <span style={{ color:'#a0c0ff' }}>{time.date}</span>
            <span>•</span>
            <span>BALI <span style={{ color:'#e0e8ff' }}>{time.bali}</span></span>
            <span>•</span>
            <span>DE <span style={{ color:'#e0e8ff' }}>{time.de}</span></span>
          </div>
        </div>
      </div>

      {/* Modules grid */}
      <div style={{ maxWidth:520, margin:'24px auto 0', padding:'0 20px 60px', display:'flex', flexDirection:'column', gap:10 }}>
        <div onClick={() => go('brain')} style={{ background:'rgba(20,30,60,0.5)', border:'1px solid rgba(120,180,255,0.15)', borderRadius:16, padding:'18px 20px', cursor:'pointer', display:'flex', alignItems:'center', gap:16, backdropFilter:'blur(12px)', transition:'all 0.2s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(120,180,255,0.4)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(120,180,255,0.15)' }}>
          <div style={{ width:44, height:44, borderRadius:12, background:'linear-gradient(135deg, #005577, #0088bb)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🧠</div>
          <div>
            <div style={{ fontFamily:'var(--mono, Space Mono)', fontSize:12, fontWeight:700, letterSpacing:1.5 }}>SECONDBRAIN</div>
            <div style={{ fontSize:12, color:'#7a9fdc', marginTop:2 }}>Priorities · Calendar · Notes · Goals</div>
          </div>
          <div style={{ marginLeft:'auto', color:'#5a7ab5' }}>›</div>
        </div>

        {[modules.slice(1,3), modules.slice(3,5), modules.slice(5,7)].map((pair, i) => (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {pair.map(mod => (
              <div key={mod.id} onClick={() => go(mod.id)} style={{ background:'rgba(20,30,60,0.5)', border:'1px solid rgba(120,180,255,0.15)', borderRadius:16, padding:'18px 16px', cursor:'pointer', display:'flex', flexDirection:'column', gap:12, backdropFilter:'blur(12px)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(120,180,255,0.4)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(120,180,255,0.15)' }}>
                <div style={{ width:36, height:36, borderRadius:10, background:mod.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>{mod.icon}</div>
                <div>
                  <div style={{ fontFamily:'var(--mono, Space Mono)', fontSize:11, fontWeight:700, letterSpacing:1.5 }}>{mod.label}</div>
                  <div style={{ fontSize:11, color:'#7a9fdc', marginTop:2 }}>{mod.desc}</div>
                </div>
              </div>
            ))}
          </div>
        ))}

        <div onClick={() => go('talk')} style={{ marginTop:6, background:'rgba(96,144,255,0.1)', border:'1px solid rgba(120,180,255,0.3)', borderRadius:16, padding:'18px 20px', cursor:'pointer', display:'flex', alignItems:'center', gap:16, backdropFilter:'blur(12px)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(120,180,255,0.6)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(120,180,255,0.3)' }}>
          <div style={{ width:44, height:44, borderRadius:12, background:'linear-gradient(135deg, #6090ff, #a060ff)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🎙️</div>
          <div>
            <div style={{ fontFamily:'var(--mono, Space Mono)', fontSize:12, fontWeight:700, letterSpacing:1.5 }}>FULL TALK MODE</div>
            <div style={{ fontSize:12, color:'#a0c0ff', marginTop:2 }}>Tiefes Gespräch mit Oren</div>
          </div>
          <div style={{ marginLeft:'auto', color:'#a0c0ff' }}>›</div>
        </div>

        <button onClick={handleLogout} style={{ marginTop:16, background:'transparent', border:'none', color:'#5a7ab5', fontFamily:'var(--mono, Space Mono)', fontSize:10, letterSpacing:2, cursor:'pointer', padding:'8px 16px', alignSelf:'center' }}>LOGOUT</button>
      </div>
    </div>
  )
}
