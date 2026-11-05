'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

import SecondBrain from '@/components/modules/SecondBrain'
import Edgar from '@/components/modules/Edgar'
import Investments from '@/components/modules/Investments'
import News from '@/components/modules/News'
import ThinkSpace from '@/components/modules/ThinkSpace'
import Sport from '@/components/modules/Sport'
import RealEstate from '@/components/modules/RealEstate'
import Weather from '@/components/modules/Weather'
import HUDBackground from '@/components/HUDBackground'
import HUDCore from '@/components/HUDCore'
import { useIsMobile } from '@/lib/useIsMobile'
import { useRole } from '@/lib/useRole'

type Screen = 'home' | 'brain' | 'edgar' | 'invest' | 'news' | 'think' | 'sport' | 'estate'
type OrbState = 'idle' | 'thinking' | 'speaking' | 'listening'

type Priority = { id: string; text: string; done: boolean }
type CalEvent = { id: string; title: string; date?: string; dateEnd?: string | null; time?: string; location?: string | null }
type Goal = { id: string; text: string; done: boolean }

// ─── helper: extract time from ISO date string ─────────────────
function getTimeFromEvent(e: CalEvent): string {
  if (e.time && e.time.length > 0) return e.time
  if (!e.date) return ''
  // All-day events come as midnight UTC → show "ganztägig"
  // Timed events get formatted in Bali timezone
  const d = new Date(e.date)
  const baliTime = d.toLocaleTimeString('de-DE', {
    timeZone: 'Asia/Makassar',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  // All-day heuristic: if it hits midnight exactly in Bali, treat as all-day
  if (baliTime === '00:00' && e.dateEnd) {
    const end = new Date(e.dateEnd)
    const durationMs = end.getTime() - d.getTime()
    // All-day events are typically 24h or multiples
    if (durationMs >= 20 * 60 * 60 * 1000) return 'all-day'
  }
  return baliTime
}

export default function Dashboard() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { role, name: userName } = useRole()
  const isAdmin = role === 'admin'
  const [user, setUser] = useState<User | null>(null)
  const [screen, setScreen] = useState<Screen>('home')
  const [time, setTime] = useState({ bali: '', de: '', date: '', mode: '' })
  const [orbState, setOrbState] = useState<OrbState>('idle')
  const [priorities, setPriorities] = useState<Priority[]>([])
  const [events, setEvents] = useState<CalEvent[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [sysStatus, setSysStatus] = useState<any>(null)

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
    fetch('/api/systems').then(r => r.json()).then(setSysStatus).catch(() => {});
    const loadCalendar = () => {
      fetch('/api/calendar', { cache: 'no-store' })
        .then(r => r.json())
        .then(d => { if (d.events) setEvents(d.events) })
        .catch(() => {})
    }
    loadCalendar()
    // Auto-refresh: every 2 min, plus whenever the tab regains focus
    const interval = setInterval(loadCalendar, 2 * 60 * 1000)
    const onFocus = () => loadCalendar()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [user])

  useEffect(() => {
    const tick = () => {
      const n = new Date()
      const b = new Date(n.toLocaleString('en-US', { timeZone: 'Asia/Makassar' }))
      const d = new Date(n.toLocaleString('en-US', { timeZone: 'Europe/Berlin' }))
      const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
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

  const logout = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }, [router])

  if (!user) return null

  // Role guards: viewer may not open edgar/investments
  if ((screen === 'edgar' || screen === 'invest') && !isAdmin) {
    setScreen('home'); return null
  }

  if (screen === 'brain')   return <SecondBrain  user={user} onBack={() => setScreen('home')} />
  if (screen === 'edgar')   return <Edgar        user={user} onBack={() => setScreen('home')} />
  if (screen === 'invest')  return <Investments  user={user} onBack={() => setScreen('home')} />
  if (screen === 'news')    return <News         user={user} onBack={() => setScreen('home')} />
  if (screen === 'think')   return <ThinkSpace   user={user} onBack={() => setScreen('home')} />
  if (screen === 'sport')   return <Sport        user={user} onBack={() => setScreen('home')} />
  if (screen === 'estate')  return <RealEstate   user={user} onBack={() => setScreen('home')} />

  const stateLabel = orbState === 'thinking' ? 'PROCESSING'
                   : orbState === 'speaking' ? 'TRANSMITTING'
                   : orbState === 'listening' ? 'LISTENING'
                   : 'STANDBY'

  const modules = [
    { id: 'brain',   key: '01', label: 'SECONDBRAIN', sub: 'Daily Command Center', locked: false },
    { id: 'think',   key: '02', label: 'THINKSPACE',  sub: 'Shared Notes & Boards',locked: false },
    { id: 'edgar',   key: '03', label: 'EDGAR',       sub: 'Autonomous Trading',   locked: !isAdmin },
    { id: 'invest',  key: '04', label: 'INVESTMENTS', sub: 'Portfolio & Returns',  locked: !isAdmin },
    { id: 'news',    key: '05', label: 'NEWS',        sub: 'Intel & Headlines',    locked: false },
    { id: 'sport',   key: '06', label: 'SPORT',       sub: 'Body & Performance',   locked: false },
    { id: 'estate',  key: '07', label: 'REAL ESTATE', sub: 'Projects & Portfolio', locked: false },
    { id: 'calendar',key: '08', label: 'CALENDAR',    sub: 'Google Calendar Live', locked: false },
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
          display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto 1fr',
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
            <span>WELCOME {(userName || 'LEON').toUpperCase()}{role === 'viewer' ? ' · VIEWER' : ''}</span>
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
          paddingTop: isMobile ? 120 : 64,
          paddingBottom: 24,
          paddingLeft: isMobile ? 12 : 24,
          paddingRight: isMobile ? 12 : 24,
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '300px 1fr 320px',
          gap: 18,
          minHeight: '100vh',
          position: 'relative',
          zIndex: 5,
        }}>

          {/* LEFT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Weather />
            <HUDPanel title="◉ UPCOMING" subtitle="3 DAYS">
              {(() => {
                const today = new Date(); today.setHours(0,0,0,0)
                const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1)
                const dayAfter = new Date(today); dayAfter.setDate(today.getDate()+2)
                const horizon = new Date(today); horizon.setDate(today.getDate()+3)
                const inRange = events.filter(e => {
                  if (!e.date) return false
                  const d = new Date(e.date)
                  return d >= today && d < horizon
                })
                if (inRange.length === 0) return <Empty text="No events in the next 3 days" />
                const fmtDay = (d: Date) => {
                  const wd = ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()]
                  const dd = String(d.getDate()).padStart(2,'0')
                  const mm = String(d.getMonth()+1).padStart(2,'0')
                  return `${wd} ${dd}.${mm}`
                }
                const buckets: { label: string; dateLabel: string; items: typeof inRange }[] = [
                  { label: 'TODAY', dateLabel: fmtDay(today), items: inRange.filter(e => { const d = new Date(e.date!); return d >= today && d < tomorrow }) },
                  { label: 'TOMORROW', dateLabel: fmtDay(tomorrow), items: inRange.filter(e => { const d = new Date(e.date!); return d >= tomorrow && d < dayAfter }) },
                  { label: 'DAY AFTER', dateLabel: fmtDay(dayAfter), items: inRange.filter(e => { const d = new Date(e.date!); return d >= dayAfter && d < horizon }) },
                ]
                return (
                  <>
                    {buckets.map((b, bi) => (
                      <div key={b.label} style={{ marginTop: bi === 0 ? 0 : 10 }}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '6px 0 4px', borderBottom: '1px solid rgba(80,180,255,0.15)', marginBottom: 2,
                        }}>
                          <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, letterSpacing: 2, color: '#80c0ff', fontWeight: 700 }}>{b.label}</div>
                          <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, color: 'rgba(128,192,255,0.5)', letterSpacing: 1 }}>{b.dateLabel}</div>
                        </div>
                        {b.items.length === 0 ? (
                          <div style={{ fontSize: 10, color: 'rgba(120,180,230,0.3)', fontStyle: 'italic', padding: '4px 0' }}>free</div>
                        ) : (
                          b.items.map((e, i) => (
                            <DataRow key={e.id || `${b.label}-${i}`} idx={getTimeFromEvent(e) || '--:--'} text={e.title} idxColor="#80c0ff" />
                          ))
                        )}
                      </div>
                    ))}
                  </>
                )
              })()}
            </HUDPanel>

            <HUDPanel title="◈ PRIORITIES" subtitle={`${String(priorities.length).padStart(2,'0')} OPEN`}>
              {priorities.length === 0 ? (
                <Empty text="Tell OREN what matters" />
              ) : (
                priorities.map((p, i) => (
                  <DataRow key={p.id} idx={String(i + 1).padStart(2, '0')} text={p.text} idxColor="#ffd060" />
                ))
              )}
              <button onClick={() => setScreen('brain')} style={btnSecondary}>OPEN SECONDBRAIN →</button>
            </HUDPanel>

            <HUDPanel title="▲ GOALS" subtitle="WEEKLY">
              {goals.length === 0 ? (
                <Empty text="No goals this week" />
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

            {/* Oren input bar removed; access the full chat via the HexButton or /talk route */}
          </div>

          {/* RIGHT */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              fontFamily: 'Space Mono, monospace', fontSize: 9, letterSpacing: 2.5,
              color: '#5a80b5', padding: '4px 2px', display: 'flex',
              justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>◇ MODULES</span>
              <span style={{ color: '#34d399' }}>● 8/8 ACTIVE</span>
            </div>

            {modules.map(m => (
              <HexButton
                key={m.id}
                onClick={() => {
                  if (m.locked) return
                  if (m.id === 'calendar') router.push('/dashboard/calendar')
                  else setScreen(m.id as Screen)
                }}
                k={m.key}
                label={m.label}
                sub={m.sub}
                locked={m.locked}
              />
            ))}

            <HUDPanel title="◇ TELEMETRY" subtitle="LIVE">
              <Tele label="HEARTBEAT" value="30M" />
              <Tele label="MODEL" value="HAIKU 4.5" />
              <Tele label="LATENCY" value="42MS" green />
              <Tele label="UPTIME" value="99.4%" green />
              <Tele label="TOKENS" value="2.4K" />
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

function HexButton({ k, label, sub, onClick, locked }: any) {
  const [showLockHint, setShowLockHint] = useState(false)
  return (
    <button onClick={() => {
        if (locked) {
          setShowLockHint(true)
          setTimeout(() => setShowLockHint(false), 2200)
          return
        }
        onClick()
      }}
      onMouseEnter={(e: any) => {
        if (locked) return
        e.currentTarget.style.borderColor = 'rgba(120,200,255,0.45)'
        e.currentTarget.style.background = 'rgba(20,40,80,0.8)'
        e.currentTarget.style.transform = 'translateX(-3px)'
      }}
      onMouseLeave={(e: any) => {
        if (locked) return
        e.currentTarget.style.borderColor = 'rgba(80,180,255,0.15)'
        e.currentTarget.style.background = 'rgba(8,20,48,0.55)'
        e.currentTarget.style.transform = 'translateX(0)'
      }}
      style={{
        background: locked ? 'rgba(8,20,48,0.3)' : 'rgba(8,20,48,0.55)',
        border: '1px solid rgba(80,180,255,0.15)',
        borderLeft: locked ? '2px solid rgba(255,180,100,0.35)' : '2px solid rgba(120,200,255,0.5)',
        borderRadius: 2, padding: '11px 14px',
        cursor: locked ? 'not-allowed' : 'pointer', width: '100%', textAlign: 'left',
        transition: 'all 0.2s ease',
        backdropFilter: 'blur(8px)', position: 'relative',
        opacity: locked ? 0.55 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: locked ? 'rgba(255,180,100,0.7)' : '#80c0ff', opacity: 0.8, fontWeight: 700, minWidth: 18 }}>{k}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 11.5, letterSpacing: 2.5, fontWeight: 700, color: locked ? 'rgba(200,170,130,0.75)' : '#bfdbfe' }}>{label}</div>
          <div style={{ fontSize: 9.5, color: 'rgba(150,190,230,0.55)', marginTop: 1, letterSpacing: 0.5 }}>
            {showLockHint ? '🔒 Restricted — ask Leon' : sub}
          </div>
        </div>
        <div style={{ color: locked ? 'rgba(255,180,100,0.65)' : '#80c0ff', fontSize: 13, opacity: locked ? 0.9 : 0.5 }}>
          {locked ? '🔒' : '›'}
        </div>
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
