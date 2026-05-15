'use client'
import { useEffect, useState, useCallback } from 'react'
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
import HUDBackground from '@/components/HUDBackground'
import HUDCore from '@/components/HUDCore'

type Screen = 'home' | 'brain' | 'finance' | 'invest' | 'news' | 'think' | 'sport' | 'social' | 'talk'
type OrbState = 'idle' | 'thinking' | 'speaking' | 'listening'

type Priority = { id: string; text: string; done: boolean }
type CalEvent = { id: string; title: string; date?: string; time?: string }
type Goal = { id: string; text: string; done: boolean }

// ─── helper: extract time from ISO date string ─────────────────
function getTimeFromEvent(e: CalEvent): string {
  if (e.time && e.time.length > 0) return e.time
  if (e.date && e.date.includes('T')) {
    return e.date.split('T')[1].slice(0, 5)
  }
  return ''
}

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [screen, setScreen] = useState<Screen>('home')
  const [time, setTime] = useState({ bali: '', de: '', date: '', mode: '' })
  const [quickInput, setQuickInput] = useState('')
  const [orbState, setOrbState] = useState<OrbState>('idle')
  const [quickResponse, setQuickResponse] = useState<string>('')
  const [priorities, setPriorities] = useState<Priority[]>([])
  const [events, setEvents] = useState<CalEvent[]>([])
  const [goals, setGoals] = useState<Goal[]>([])

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
    supabase.from('goals').select('id, text, done').eq('user_id', user.id).eq('done', false).limit(3).then(({ data }: any) => {
      if (data) setGoals(data)
    })
    fetch('/api/calendar').then(r => r.json()).then(d => { if (d.events) setEvents(d.events) }).catch(() => {})
  }, [user])

  useEffect(() => {
    const tick = () => {
      const n = new Date()
      const b = new Date(n.toLocaleString('en-US', { timeZone: 'Asia/Makassar' }))
      const d = new Date(n.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
      const days = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag']
      const months = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
      const fmt = (x: Date) => String(x.getHours()).padStart(2,'0') + ':' + String(x.getMinutes()).padStart(2,'0') + ':' + String(x.getSeconds()).padStart(2,'0')
      const h = d.getHours()
      const mode = h >= 22 || h < 6 ? 'NIGHT' : h < 12 ? 'MORNING' : h < 18 ? 'WORK' : 'EVENING'
      setTime({
        bali: fmt(b),
        de: fmt(d),
        date: days[n.getDay()] + ', ' + n.getDate() + '. ' + months[n.getMonth()] + ' ' + n.getFullYear(),
        mode,
      })
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  const sendQuick = useCallback(async () => {
    if (!quickInput.trim()) return
    setOrbState('thinking')
    setQuickResponse('')
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: quickInput }] }),
      })
      const d = await r.json()
      setQuickResponse(d.content || '...')
      setOrbState('speaking')
      setTimeout(() => setOrbState('idle'), 4500)
    } catch {
      setOrbState('idle')
    }
    setQuickInput('')
  }, [quickInput])

  const logout = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }, [router])

  if (!user) return null

  if (screen === 'brain')   return <SecondBrain  user={user} onBack={() => setScreen('home')} />
  if (screen === 'finance') return <Finances     user={user} onBack={() => setScreen('home')} />
  if (screen === 'invest')  return <Investments  user={user} onBack={() => setScreen('home')} />
  if (screen === 'news')    return <News         user={user} onBack={() => setScreen('home')} />
  if (screen === 'think')   return <ThinkSpace   user={user} onBack={() => setScreen('home')} />
  if (screen === 'sport')   return <Sport        user={user} onBack={() => setScreen('home')} />
  if (screen === 'social')  return <SocialMedia  user={user} onBack={() => setScreen('home')} />
  if (screen === 'talk')    return <TalkToOren   user={user} onBack={() => setScreen('home')} />

  const stateLabel = orbState === 'thinking' ? 'PROCESSING'
                   : orbState === 'speaking' ? 'TRANSMITTING'
                   : orbState === 'listening' ? 'LISTENING'
                   : 'STANDBY'

  const modules = [
    { id: 'brain',   key: '01', label: 'SECONDBRAIN', sub: 'Daily Command Center' },
    { id: 'finance', key: '02', label: 'FINANCES',    sub: 'Wealth & Liquidity' },
    { id: 'invest',  key: '03', label: 'INVESTMENTS', sub: 'Portfolio & Returns' },
    { id: 'news',    key: '04', label: 'NEWS',        sub: 'Intel & Headlines' },
    { id: 'think',   key: '05', label: 'THINKSPACE',  sub: 'Strategy & Deep Think' },
    { id: 'sport',   key: '06', label: 'SPORT',       sub: 'Body & Performance' },
    { id: 'social',  key: '07', label: 'SOCIAL MEDIA', sub: 'Content & Growth' },
  ]

  // System status — Leon, OREN, Edgar
  const systems = [
    { name: 'LEON',  status: 'ONLINE', uptime: 100, color: '#34d399' },
    { name: 'OREN',  status: 'ACTIVE', uptime: 99,  color: '#34d399' },
    { name: 'EDGAR', status: 'STANDBY', uptime: 80, color: '#fbbf24' },
  ]

  return (
    <>
      <HUDBackground />

      <div style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at center, #051022 0%, #020610 60%, #000 100%)',
        color: '#bfdbfe',
        fontFamily: 'DM Sans, system-ui, sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1, opacity: 0.4,
          backgroundImage: `linear-gradient(rgba(80,180,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(80,180,255,0.035) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }} />

        <CornerBracket pos="tl" />
        <CornerBracket pos="tr" />
        <CornerBracket pos="bl" />
        <CornerBracket pos="br" />

        {/* ═══ TOP BAR ═══ */}
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          padding: '14px 56px 14px 28px',
          display: 'grid', gridTemplateColumns: '1fr auto 1fr',
          gap: 24, alignItems: 'center', zIndex: 20,
          fontFamily: 'Space Mono, monospace', fontSize: 10, letterSpacing: 2.5,
          color: '#7ea6d5',
          backdropFilter: 'blur(12px)',
          background: 'linear-gradient(180deg, rgba(0,8,24,0.9) 0%, rgba(0,8,24,0) 100%)',
          borderBottom: '1px solid rgba(80,180,255,0.10)',
        }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <PulseDot color="#34d399" />
              <span style={{ color: '#a0d0ff' }}>SYS ONLINE</span>
            </div>
            <span style={{ opacity: 0.55 }}>OREN v4.0</span>
            <span style={{ opacity: 0.55 }}>{time.mode}</span>
            <span style={{ color: '#7ea6d5' }}>{time.date}</span>
          </div>
          <div style={{
            textAlign: 'center', color: '#80c0ff', fontSize: 12, letterSpacing: 6, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center',
          }}>
            <span style={{ color: 'rgba(120,180,230,0.5)', fontSize: 10 }}>◆</span>
            <span>WILLKOMMEN LEON RIEDEL</span>
            <span style={{ color: 'rgba(120,180,230,0.5)', fontSize: 10 }}>◆</span>
          </div>
          <div style={{ textAlign: 'right', display: 'flex', gap: 24, justifyContent: 'flex-end', alignItems: 'center' }}>
            <TimeDisplay label="BALI" value={time.bali} />
            <TimeDisplay label="BERLIN" value={time.de} />
            <button onClick={logout} style={btnExit}>EXIT</button>
          </div>
        </div>

        {/* ═══ MAIN GRID ═══ */}
        <div style={{
          paddingTop: 64,
          paddingBottom: 24,
          paddingLeft: 24,
          paddingRight: 24,
          display: 'grid',
          gridTemplateColumns: '300px 1fr 320px',
          gap: 18,
          minHeight: '100vh',
          position: 'relative',
          zIndex: 5,
        }}>

          {/* LEFT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <HUDPanel title="◉ TERMINE" subtitle={events.length ? `${String(events.length).padStart(2,'0')} TODAY` : '00'}>
              {events.length === 0 ? (
                <Empty text="Keine Termine heute" />
              ) : (
                events.slice(0, 8).map((e, i) => (
                  <DataRow key={e.id || i} idx={getTimeFromEvent(e) || '--:--'} text={e.title} idxColor="#80c0ff" />
                ))
              )}
            </HUDPanel>

            <HUDPanel title="◈ PRIORITIES" subtitle={`${String(priorities.length).padStart(2,'0')} OPEN`}>
              {priorities.length === 0 ? (
                <Empty text="Sag OREN was wichtig ist" />
              ) : (
                priorities.map((p, i) => (
                  <DataRow key={p.id} idx={String(i + 1).padStart(2, '0')} text={p.text} idxColor="#ffd060" />
                ))
              )}
              <button onClick={() => setScreen('brain')} style={btnSecondary}>OPEN SECONDBRAIN →</button>
            </HUDPanel>

            <HUDPanel title="▲ GOALS" subtitle="WEEKLY">
              {goals.length === 0 ? (
                <Empty text="Keine Goals diese Woche" />
              ) : (
                goals.map((g, i) => (
                  <div key={g.id} style={{
                    display: 'flex', gap: 10, padding: '7px 0',
                    borderBottom: i < goals.length - 1 ? '1px solid rgba(80,180,255,0.05)' : 'none',
                    alignItems: 'flex-start',
                  }}>
                    <div style={{
                      width: 12, height: 12, borderRadius: 2,
                      border: '1px solid rgba(80,220,180,0.5)',
                      flexShrink: 0, marginTop: 1,
                    }} />
                    <div style={{ fontSize: 11.5, color: '#c5e0ff', lineHeight: 1.4 }}>{g.text}</div>
                  </div>
                ))
              )}
            </HUDPanel>

            {/* SYSTEM STATUS panel — Leon / OREN / Edgar */}
            <HUDPanel title="◇ SYSTEMS" subtitle="LIVE STATUS">
              {systems.map((s, i) => (
                <div key={s.name} style={{
                  padding: '10px 0',
                  borderBottom: i < systems.length - 1 ? '1px solid rgba(80,180,255,0.05)' : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <PulseDot color={s.color} />
                      <span style={{
                        fontFamily: 'Space Mono, monospace', fontSize: 10.5, fontWeight: 700,
                        color: '#d0e5ff', letterSpacing: 2,
                      }}>{s.name}</span>
                    </div>
                    <span style={{
                      fontFamily: 'Space Mono, monospace', fontSize: 9,
                      color: s.color, letterSpacing: 1.5,
                    }}>{s.status}</span>
                  </div>
                  <div style={{
                    width: '100%', height: 5, background: 'rgba(80,180,255,0.06)',
                    borderRadius: 1, overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${s.uptime}%`, height: '100%',
                      background: `linear-gradient(90deg, ${s.color}, ${s.color}aa)`,
                      boxShadow: `0 0 8px ${s.color}`,
                      transition: 'width 1s ease',
                    }} />
                  </div>
                </div>
              ))}
            </HUDPanel>
          </div>

          {/* CENTER */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'flex-start', paddingTop: 0, position: 'relative',
          }}>

            <div style={{ display: 'flex', gap: 7, marginBottom: 8, fontFamily: 'Space Mono, monospace', fontSize: 9, letterSpacing: 1.5 }}>
              <StatusPill label="CORE" value="OPS" color="#34d399" />
              <StatusPill label="API" value="LIVE" color="#34d399" />
              <StatusPill label="MEM" value="OK" color="#34d399" />
              <StatusPill label="CRON" value="ARMED" color="#fbbf24" />
              <StatusPill label="NEURAL" value="SYNC" color="#80c0ff" />
            </div>

            <div style={{ position: 'relative', width: 540, height: 540, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <HUDCore orbState={orbState} size={540} />

              <div style={{
                position: 'absolute', top: 18, left: 16,
                fontFamily: 'Space Mono, monospace', fontSize: 8.5, letterSpacing: 2,
                color: 'rgba(120,180,230,0.6)', pointerEvents: 'none',
              }}>
                <div style={{ color: '#80c0ff' }}>◇ ID-OREN-001</div>
                <div style={{ opacity: 0.6, marginTop: 2 }}>NEURAL CORE</div>
              </div>
              <div style={{
                position: 'absolute', top: 18, right: 16,
                fontFamily: 'Space Mono, monospace', fontSize: 8.5, letterSpacing: 2,
                color: 'rgba(120,180,230,0.6)', textAlign: 'right', pointerEvents: 'none',
              }}>
                <div style={{ color: '#34d399' }}>● OPERATIONAL</div>
                <div style={{ opacity: 0.6, marginTop: 2 }}>{stateLabel}</div>
              </div>
              <div style={{
                position: 'absolute', bottom: 14, left: 16,
                fontFamily: 'Space Mono, monospace', fontSize: 8.5, letterSpacing: 2,
                color: 'rgba(120,180,230,0.6)', pointerEvents: 'none',
              }}>
                <div>LAT 8.7°S</div>
                <div style={{ marginTop: 2 }}>LON 115.2°E</div>
              </div>
              <div style={{
                position: 'absolute', bottom: 14, right: 16,
                fontFamily: 'Space Mono, monospace', fontSize: 8.5, letterSpacing: 2,
                color: 'rgba(120,180,230,0.6)', textAlign: 'right', pointerEvents: 'none',
              }}>
                <div>FREQ 440.0Hz</div>
                <div style={{ marginTop: 2 }}>AMP 0.85</div>
              </div>
            </div>

            <div style={{ textAlign: 'center', marginTop: -8, marginBottom: 20 }}>
              <div style={{
                fontFamily: 'Space Mono, monospace', fontSize: 28, fontWeight: 700,
                letterSpacing: 16, color: 'rgba(220,240,255,0.98)',
                textShadow: '0 0 35px rgba(120,200,255,0.7), 0 0 70px rgba(80,160,255,0.4)',
                paddingLeft: 16,
              }}>OREN</div>
              <div style={{
                fontFamily: 'Space Mono, monospace', fontSize: 9, letterSpacing: 6,
                color: 'rgba(120,180,230,0.65)', marginTop: 4,
              }}>● {stateLabel}</div>
            </div>

            <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{
                display: 'flex', gap: 6, alignItems: 'center',
                background: 'rgba(8,20,48,0.7)',
                border: '1px solid rgba(80,180,255,0.30)',
                borderRadius: 4, padding: '8px 8px 8px 18px',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 0 28px rgba(60,140,255,0.18), inset 0 0 0 1px rgba(80,180,255,0.05)',
              }}>
                <span style={{ color: 'rgba(120,200,255,0.7)', fontFamily: 'Space Mono, monospace', fontSize: 11, letterSpacing: 2 }}>›</span>
                <input
                  value={quickInput}
                  onChange={e => setQuickInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') sendQuick() }}
                  placeholder="INPUT COMMAND..."
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    color: '#d8eaff', fontSize: 13, fontFamily: 'Space Mono, monospace', letterSpacing: 0.5,
                  }}
                />
                <button onClick={() => setScreen('talk')} title="Full chat" style={iconBtn}>⛶</button>
                <button onClick={sendQuick} style={{ ...iconBtn, background: 'rgba(80,180,255,0.30)', borderColor: 'rgba(120,200,255,0.7)', color: '#fff' }}>→</button>
              </div>
              {quickResponse && (
                <div style={{
                  background: 'rgba(8,20,48,0.78)',
                  border: '1px solid rgba(80,180,255,0.25)',
                  borderLeft: '2px solid rgba(120,200,255,0.75)',
                  borderRadius: 4, padding: '12px 14px',
                  fontSize: 12.5, color: '#d0e5ff', lineHeight: 1.55,
                  fontFamily: 'DM Sans, system-ui, sans-serif',
                  backdropFilter: 'blur(8px)',
                }}>{quickResponse}</div>
              )}
            </div>
          </div>

          {/* RIGHT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              fontFamily: 'Space Mono, monospace', fontSize: 9, letterSpacing: 2.5,
              color: '#5a80b5', padding: '4px 2px', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>◇ MODULES</span>
              <span style={{ color: '#34d399' }}>● 7/7 ACTIVE</span>
            </div>

            {modules.map(m => (
              <HexButton key={m.id} onClick={() => setScreen(m.id as Screen)} k={m.key} label={m.label} sub={m.sub} />
            ))}

            <HUDPanel title="◇ TELEMETRY" subtitle="LIVE">
              <Tele label="HEARTBEAT" value="30M" />
              <Tele label="MODEL" value="HAIKU 4.5" />
              <Tele label="LATENCY" value="42MS" green />
              <Tele label="UPTIME" value="99.4%" green />
              <Tele label="TOKENS" value="2.4K" />
            </HUDPanel>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── helpers ────────────────────────────────────────────────────

function HUDPanel({ title, subtitle, children }: any) {
  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(8,20,48,0.6) 0%, rgba(8,20,48,0.4) 100%)',
      border: '1px solid rgba(80,180,255,0.16)',
      borderRadius: 4, padding: 12,
      backdropFilter: 'blur(10px)',
      position: 'relative',
      boxShadow: 'inset 0 1px 0 rgba(120,200,255,0.06)',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(120,200,255,0.55), transparent)',
      }} />
      <div style={{ position: 'absolute', top: 3, left: 3, width: 6, height: 6, borderTop: '1px solid rgba(120,200,255,0.45)', borderLeft: '1px solid rgba(120,200,255,0.45)' }} />
      <div style={{ position: 'absolute', top: 3, right: 3, width: 6, height: 6, borderTop: '1px solid rgba(120,200,255,0.45)', borderRight: '1px solid rgba(120,200,255,0.45)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, letterSpacing: 2, color: '#80c0ff', fontWeight: 700 }}>{title}</div>
        <div style={{
          fontFamily: 'Space Mono, monospace', fontSize: 8.5, letterSpacing: 1.5,
          color: 'rgba(120,180,230,0.55)', padding: '1px 6px',
          border: '1px solid rgba(80,180,255,0.18)', borderRadius: 2,
        }}>{subtitle}</div>
      </div>
      {children}
    </div>
  )
}

function DataRow({ idx, text, idxColor = '#80c0ff' }: any) {
  return (
    <div style={{
      display: 'flex', gap: 10, padding: '7px 0',
      borderBottom: '1px solid rgba(80,180,255,0.05)',
      alignItems: 'flex-start',
    }}>
      <div style={{
        fontFamily: 'Space Mono, monospace', fontSize: 10,
        color: idxColor, minWidth: 38, paddingTop: 1, fontWeight: 700, letterSpacing: 0.5,
      }}>{idx}</div>
      <div style={{ fontSize: 11.5, color: '#d0e5ff', lineHeight: 1.4 }}>{text}</div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 11, color: 'rgba(120,180,230,0.4)', fontStyle: 'italic', padding: '4px 0' }}>{text}</div>
}

function PulseDot({ color }: { color: string }) {
  return <div style={{ width: 5, height: 5, borderRadius: 50, background: color, boxShadow: `0 0 10px ${color}` }} />
}

function StatusPill({ label, value, color }: any) {
  return (
    <div style={{
      padding: '3px 9px', borderRadius: 2,
      background: hexA(color, 0.08),
      border: `1px solid ${hexA(color, 0.25)}`,
      display: 'flex', gap: 5, alignItems: 'center',
    }}>
      <div style={{ width: 4, height: 4, borderRadius: 50, background: color, boxShadow: `0 0 5px ${color}` }} />
      <span style={{ color: 'rgba(160,210,255,0.55)' }}>{label}</span>
      <span style={{ color }}>{value}</span>
    </div>
  )
}

function TimeDisplay({ label, value }: any) {
  return (
    <div>
      <div style={{ fontSize: 8, opacity: 0.5, lineHeight: 1, letterSpacing: 1.5 }}>{label}</div>
      <div style={{ color: '#a0d0ff', fontSize: 12.5, fontWeight: 700, fontFamily: 'Space Mono, monospace', letterSpacing: 0.5 }}>{value}</div>
    </div>
  )
}

function Tele({ label, value, green }: any) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      padding: '5px 0',
      borderBottom: '1px solid rgba(80,180,255,0.05)',
      fontFamily: 'Space Mono, monospace', fontSize: 9.5,
    }}>
      <span style={{ color: 'rgba(120,180,230,0.5)', letterSpacing: 1 }}>{label}</span>
      <span style={{ color: green ? '#34d399' : '#a0d0ff', letterSpacing: 1 }}>{value}</span>
    </div>
  )
}

function HexButton({ k, label, sub, onClick }: any) {
  return (
    <button onClick={onClick}
      onMouseEnter={(e: any) => {
        e.currentTarget.style.borderColor = 'rgba(120,200,255,0.45)'
        e.currentTarget.style.background = 'rgba(20,40,80,0.8)'
        e.currentTarget.style.transform = 'translateX(-3px)'
      }}
      onMouseLeave={(e: any) => {
        e.currentTarget.style.borderColor = 'rgba(80,180,255,0.15)'
        e.currentTarget.style.background = 'rgba(8,20,48,0.55)'
        e.currentTarget.style.transform = 'translateX(0)'
      }}
      style={{
        background: 'rgba(8,20,48,0.55)',
        border: '1px solid rgba(80,180,255,0.15)',
        borderLeft: '2px solid rgba(120,200,255,0.5)',
        borderRadius: 2, padding: '11px 14px',
        cursor: 'pointer', width: '100%', textAlign: 'left',
        transition: 'all 0.2s ease',
        backdropFilter: 'blur(8px)', position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: '#80c0ff', opacity: 0.7, fontWeight: 700, minWidth: 18 }}>{k}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 11.5, letterSpacing: 2.5, fontWeight: 700, color: '#bfdbfe' }}>{label}</div>
          <div style={{ fontSize: 9.5, color: 'rgba(150,190,230,0.55)', marginTop: 1, letterSpacing: 0.5 }}>{sub}</div>
        </div>
        <div style={{ color: '#80c0ff', fontSize: 13, opacity: 0.5 }}>›</div>
      </div>
    </button>
  )
}

function CornerBracket({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const s = 28, t = 16
  const styles: any = {
    tl: { top: t, left: t, borderLeft: '1px solid #80c0ff', borderTop: '1px solid #80c0ff' },
    tr: { top: t, right: t, borderRight: '1px solid #80c0ff', borderTop: '1px solid #80c0ff' },
    bl: { bottom: t, left: t, borderLeft: '1px solid #80c0ff', borderBottom: '1px solid #80c0ff' },
    br: { bottom: t, right: t, borderRight: '1px solid #80c0ff', borderBottom: '1px solid #80c0ff' },
  }
  return <div style={{ position: 'fixed', width: s, height: s, zIndex: 30, opacity: 0.35, pointerEvents: 'none', ...styles[pos] }} />
}

function hexA(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16)
  return `rgba(${r},${g},${b},${alpha})`
}

const iconBtn = {
  width: 32, height: 32, borderRadius: 2,
  background: 'rgba(20,40,80,0.55)',
  border: '1px solid rgba(80,180,255,0.28)',
  color: 'rgba(160,210,255,0.8)',
  cursor: 'pointer', fontSize: 13,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
} as const

const btnSecondary = {
  marginTop: 10, width: '100%',
  padding: '7px 12px',
  background: 'rgba(20,40,80,0.4)',
  border: '1px solid rgba(80,180,255,0.22)',
  borderRadius: 2,
  color: 'rgba(160,210,255,0.78)',
  fontFamily: 'Space Mono, monospace', fontSize: 9.5, letterSpacing: 2,
  cursor: 'pointer',
} as const

const btnExit = {
  background: 'rgba(255,80,80,0.05)',
  border: '1px solid rgba(255,80,80,0.18)',
  color: 'rgba(255,120,120,0.7)',
  padding: '6px 14px',
  borderRadius: 2,
  cursor: 'pointer',
  fontFamily: 'Space Mono, monospace',
  fontSize: 9,
  letterSpacing: 2,
} as const
