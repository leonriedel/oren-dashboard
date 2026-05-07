'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

// Module screens
import SecondBrain from '@/components/modules/SecondBrain'
import Finances from '@/components/modules/Finances'
import Investments from '@/components/modules/Investments'
import News from '@/components/modules/News'
import ThinkSpace from '@/components/modules/ThinkSpace'
import Sport from '@/components/modules/Sport'
import SocialMedia from '@/components/modules/SocialMedia'
import TalkToOren from '@/components/modules/TalkToOren'

type Screen = 'home' | 'brain' | 'finance' | 'invest' | 'news' | 'think' | 'sport' | 'social' | 'talk'

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [screen, setScreen] = useState<Screen>('home')
  const [time, setTime] = useState({ bali: '', de: '', date: '', mode: '' })

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

  const go = useCallback((s: Screen) => setScreen(s), [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  if (!user) return <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}><div style={{ width:32, height:32, borderRadius:'50%', background:'radial-gradient(circle at 35% 35%, #00d4ff, #0044aa)' }} /></div>

  const modules: { id: Screen; icon: string; label: string; desc: string; color: string; bg: string }[] = [
    { id:'brain', icon:'🧠', label:'SECONDBRAIN', desc:'Priorities · Calendar · Notes · Goals', color:'#00aadd', bg:'linear-gradient(135deg, #005577, #0088bb)' },
    { id:'finance', icon:'💰', label:'FINANCES', desc:'Wealth & Liquidity', color:'var(--green)', bg:'linear-gradient(135deg, #1a5c2a, #2d9e48)' },
    { id:'invest', icon:'📈', label:'INVESTMENTS', desc:'Portfolio & Returns', color:'var(--amber)', bg:'linear-gradient(135deg, #5c4500, #c78800)' },
    { id:'news', icon:'📰', label:'NEWS', desc:'Intel & Headlines', color:'#4a9edd', bg:'linear-gradient(135deg, #0a3a5c, #1466a0)' },
    { id:'think', icon:'💡', label:'THINKSPACE', desc:'Strategy & Deep Thinking', color:'var(--purple)', bg:'linear-gradient(135deg, #3b1a6e, #7c3aed)' },
    { id:'sport', icon:'🏋️', label:'SPORT & ERNÄHRUNG', desc:'Body & Performance', color:'var(--orange)', bg:'linear-gradient(135deg, #5c2000, #c45200)' },
    { id:'social', icon:'📲', label:'SOCIAL MEDIA', desc:'Content & Growth', color:'var(--pink)', bg:'linear-gradient(135deg, #5c0030, #c0115e)' },
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

  return (
    <div style={{ minHeight:'100vh', background:'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(0,212,255,0.06) 0%, transparent 70%)', display:'flex', flexDirection:'column', alignItems:'center', padding:'48px 20px 40px' }}>
      <div style={{ width:64, height:64, borderRadius:'50%', background:'radial-gradient(circle at 35% 35%, #00d4ff, #0044aa)', boxShadow:'0 0 40px rgba(0,212,255,0.3)', marginBottom:16, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ width:18, height:18, borderRadius:'50%', background:'rgba(255,255,255,0.9)' }} />
      </div>
      <h1 style={{ fontFamily:'var(--mono)', fontSize:28, fontWeight:700, color:'var(--cyan)', letterSpacing:4, marginBottom:6 }}>OREN</h1>
      <p style={{ fontFamily:'var(--mono)', fontSize:10, letterSpacing:5, color:'var(--muted)', marginBottom:24 }}>PERSONAL AI OPERATING SYSTEM</p>

      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 20px', textAlign:'center', marginBottom:32, width:'100%', maxWidth:420 }}>
        <div style={{ fontSize:13, marginBottom:6 }}>{time.mode}</div>
        <div style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--muted2)', display:'flex', gap:12, justifyContent:'center' }}>
          <span style={{ color:'var(--muted)' }}>{time.date}</span>
          <span>•</span>
          <span>BALI <span style={{ color:'var(--text)' }}>{time.bali}</span></span>
          <span>•</span>
          <span>DE <span style={{ color:'var(--text)' }}>{time.de}</span></span>
        </div>
      </div>

      <div style={{ width:'100%', maxWidth:480, display:'flex', flexDirection:'column', gap:10 }}>
        {/* Talk to Oren — full width featured */}
        <div onClick={() => go('talk')} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'18px 20px', cursor:'pointer', display:'flex', alignItems:'center', gap:16, transition:'all 0.2s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border2)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--card2)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLDivElement).style.background = 'var(--card)' }}>
          <div style={{ width:44, height:44, borderRadius:12, background:'linear-gradient(135deg, #006688, #00aadd)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>🎙️</div>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:700, letterSpacing:1.5 }}>TALK TO OREN</div>
            <div style={{ fontSize:12, color:'var(--muted2)', marginTop:2 }}>Voice · AI · Real-time</div>
          </div>
          <div style={{ marginLeft:'auto', color:'var(--muted)' }}>›</div>
        </div>

        {/* SecondBrain — full width */}
        <div onClick={() => go('brain')} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'18px 20px', cursor:'pointer', display:'flex', alignItems:'center', gap:16 }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border2)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)' }}>
          <div style={{ width:44, height:44, borderRadius:12, background:'linear-gradient(135deg, #005577, #0088bb)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🧠</div>
          <div>
            <div style={{ fontFamily:'var(--mono)', fontSize:12, fontWeight:700, letterSpacing:1.5 }}>SECONDBRAIN</div>
            <div style={{ fontSize:12, color:'var(--muted2)', marginTop:2 }}>Priorities · Calendar · Notes · Goals</div>
          </div>
          <div style={{ marginLeft:'auto', color:'var(--muted)' }}>›</div>
        </div>

        {/* 2x2 grid for remaining modules */}
        {[modules.slice(1,3), modules.slice(3,5), modules.slice(5,7)].map((pair, i) => (
          <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {pair.map(mod => (
              <div key={mod.id} onClick={() => go(mod.id)} style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:16, padding:'18px 16px', cursor:'pointer', display:'flex', flexDirection:'column', gap:12 }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border2)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)' }}>
                <div style={{ width:36, height:36, borderRadius:10, background:mod.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>{mod.icon}</div>
                <div>
                  <div style={{ fontFamily:'var(--mono)', fontSize:11, fontWeight:700, letterSpacing:1.5, color:'var(--text)' }}>{mod.label}</div>
                  <div style={{ fontSize:11, color:'var(--muted2)', marginTop:2 }}>{mod.desc}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <button onClick={handleLogout} style={{ marginTop:32, background:'transparent', border:'none', color:'var(--muted)', fontFamily:'var(--mono)', fontSize:10, letterSpacing:2, cursor:'pointer', padding:'8px 16px' }}>
        LOGOUT
      </button>
    </div>
  )
}
