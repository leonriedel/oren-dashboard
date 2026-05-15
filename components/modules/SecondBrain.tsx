'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import ModuleLayout from '@/components/ModuleLayout'
import { Card, SectionTitle, ItemRow } from '@/components/UI'
import type { User } from '@supabase/supabase-js'

interface Props { user: User; onBack: () => void }

export default function SecondBrain({ user, onBack }: Props) {
  const supabase = createClient()
  const [prios, setPrios] = useState<any[]>([])
  const [goals, setGoals] = useState<any[]>([])
  const [nn, setNn] = useState<any[]>([])
  const [newPrio, setNewPrio] = useState('')
  const [newGoal, setNewGoal] = useState('')
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<any[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)

  const defaultNN = [
    { emoji:'💪', label:'SPORT', done:false, sort_order:0 },
    { emoji:'🧘', label:'MEDITATION', done:false, sort_order:1 },
    { emoji:'📧', label:'MAILS', done:false, sort_order:2 },
    { emoji:'📸', label:'INSTA-POST', done:false, sort_order:3 },
    { emoji:'⚡', label:'OREN', done:false, sort_order:4 },
  ]

  useEffect(() => {
    load()
    fetch('/api/calendar')
      .then(r => r.json())
      .then(d => { setEvents(d.events || []); setEventsLoading(false) })
      .catch(() => setEventsLoading(false))
  }, [])

  function formatEventDate(dateStr: string) {
    const d = new Date(dateStr)
    const today = new Date()
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    if (d.toDateString() === today.toDateString()) return 'Heute'
    if (d.toDateString() === tomorrow.toDateString()) return 'Morgen'
    return d.toLocaleDateString('de', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  function formatEventTime(dateStr: string) {
    if (!dateStr.includes('T')) return null
    return new Date(dateStr).toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit' })
  }

  async function load() {
    setLoading(true)
    const [p, g, n] = await Promise.all([
      supabase.from('priorities').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('goals').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('non_negotiables').select('*').eq('user_id', user.id).order('sort_order'),
    ])
    setPrios(p.data || [])
    setGoals(g.data || [])
    if (!n.data?.length) {
      const { data } = await supabase.from('non_negotiables').insert(defaultNN.map(d => ({ ...d, user_id: user.id }))).select()
      setNn(data || [])
    } else setNn(n.data)
    setLoading(false)
  }

  async function addPrio() {
    if (!newPrio.trim()) return
    const { data } = await supabase.from('priorities').insert({ user_id: user.id, text: newPrio.trim(), done: false }).select().single()
    if (data) setPrios(prev => [...prev, data])
    setNewPrio('')
  }
  async function togglePrio(id: string, done: boolean) {
    await supabase.from('priorities').update({ done: !done }).eq('id', id)
    setPrios(prev => prev.map(p => p.id === id ? { ...p, done: !done } : p))
  }
  async function deletePrio(id: string) {
    await supabase.from('priorities').delete().eq('id', id)
    setPrios(prev => prev.filter(p => p.id !== id))
  }
  async function addGoal() {
    if (!newGoal.trim()) return
    const { data } = await supabase.from('goals').insert({ user_id: user.id, text: newGoal.trim(), done: false }).select().single()
    if (data) setGoals(prev => [...prev, data])
    setNewGoal('')
  }
  async function toggleGoal(id: string, done: boolean) {
    await supabase.from('goals').update({ done: !done }).eq('id', id)
    setGoals(prev => prev.map(g => g.id === id ? { ...g, done: !done } : g))
  }
  async function deleteGoal(id: string) {
    await supabase.from('goals').delete().eq('id', id)
    setGoals(prev => prev.filter(g => g.id !== id))
  }
  async function toggleNN(id: string, done: boolean) {
    await supabase.from('non_negotiables').update({ done: !done }).eq('id', id)
    setNn(prev => prev.map(n => n.id === id ? { ...n, done: !done } : n))
  }

  const donePrios = prios.filter(p => p.done).length
  const doneGoals = goals.filter(g => g.done).length
  const doneNN = nn.filter(n => n.done).length
  const total = prios.length + goals.length + nn.length
  const done = donePrios + doneGoals + doneNN
  const pct = total ? Math.round(done / total * 100) : 0

  const recs = ['Deep Work Block: Ablenkungen minimieren.','Top Prio zuerst — alles andere ist zweitrangig.','Energie hoch? Jetzt die härteste Aufgabe.','Review: Was hat heute funktioniert?','Wochenende nutzen: Planen, reflektieren, aufladen.']
  const rec = recs[new Date().getDay() % recs.length]

  const todayEvents = events.filter(e => new Date(e.date).toDateString() === new Date().toDateString())
  const upcomingEvents = events.filter(e => new Date(e.date).toDateString() !== new Date().toDateString())

  return (
    <ModuleLayout onBack={onBack} icon="🧠" title="SECONDBRAIN" titleColor="#80c0ff" sub="Daily Operations & Execution" iconBg="linear-gradient(135deg, rgba(60,120,200,0.4), rgba(100,180,255,0.2))">

      {/* MISSION BANNER FULL WIDTH */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(80,160,255,0.06), rgba(40,100,200,0.10))',
        border: '1px solid rgba(80,180,255,0.20)',
        borderLeft: '2px solid #80c0ff',
        borderRadius: 4, padding: 24, marginBottom: 18, position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: 3, left: 3, width: 8, height: 8, borderTop: '1px solid rgba(120,200,255,0.5)', borderLeft: '1px solid rgba(120,200,255,0.5)' }} />
        <div style={{ position: 'absolute', top: 3, right: 3, width: 8, height: 8, borderTop: '1px solid rgba(120,200,255,0.5)', borderRight: '1px solid rgba(120,200,255,0.5)' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, letterSpacing: 3, color: '#80c0ff', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#80c0ff', boxShadow: '0 0 8px #80c0ff' }} />
              MISSION HEUTE
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.4, marginBottom: 14, color: '#e0eeff' }}>
              System aufbauen. Prozesse automatisieren. Fokus halten.
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[['#fbbf24','ENERGIE: Hoch'],['#80c0ff','FOKUS: Deep Work'],['#34d399','MODUS: Builder']].map(([c,l]) => (
                <div key={l} style={{
                  fontSize: 11, padding: '5px 13px', borderRadius: 2,
                  background: `${c}15`, color: c as string,
                  border: `1px solid ${c}30`,
                  fontFamily: 'Space Mono, monospace', letterSpacing: 1.5,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: c as string, boxShadow: `0 0 6px ${c}` }} />
                  {l}
                </div>
              ))}
            </div>
          </div>

          {/* Momentum gauge inline */}
          <div style={{ minWidth: 220 }}>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, letterSpacing: 3, color: 'rgba(120,180,230,0.55)', marginBottom: 8 }}>MOMENTUM</div>
            <div style={{ height: 8, background: 'rgba(80,180,255,0.08)', borderRadius: 2, overflow: 'hidden', marginBottom: 10 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg, #60a5fa, #80c0ff)', boxShadow: '0 0 12px #80c0ff', transition: 'width 0.6s ease' }} />
            </div>
            <div style={{ display: 'flex', gap: 18, fontFamily: 'Space Mono, monospace', fontSize: 11 }}>
              <div><span style={{ color: '#80c0ff', fontWeight: 700 }}>{pct}%</span> <span style={{ color: 'rgba(120,180,230,0.5)', fontSize: 9 }}>TAG</span></div>
              <div><span style={{ color: '#80c0ff', fontWeight: 700 }}>{prios.length ? Math.round(donePrios/prios.length*100) : 0}%</span> <span style={{ color: 'rgba(120,180,230,0.5)', fontSize: 9 }}>PRIOS</span></div>
              <div><span style={{ color: '#80c0ff', fontWeight: 700 }}>{goals.length ? Math.round(doneGoals/goals.length*100) : 0}%</span> <span style={{ color: 'rgba(120,180,230,0.5)', fontSize: 9 }}>GOALS</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* OREN RECOMMENDATION FULL WIDTH */}
      <div style={{
        display: 'flex', gap: 14, padding: '14px 18px',
        background: 'rgba(8,20,48,0.55)',
        border: '1px solid rgba(80,180,255,0.18)',
        borderLeft: '2px solid #34d399',
        borderRadius: 4, marginBottom: 18, alignItems: 'center',
      }}>
        <span style={{ fontSize: 20 }}>🤖</span>
        <div>
          <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, letterSpacing: 2.5, color: '#34d399', marginBottom: 4 }}>OREN EMPFIEHLT</div>
          <div style={{ fontSize: 14, color: '#d0e5ff', lineHeight: 1.4 }}>{rec}</div>
        </div>
      </div>

      {/* 3-COLUMN GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: 18 }}>

        {/* COL 1 — TAGESPLAN */}
        <Card>
          <SectionTitle color="#80c0ff" action={<span style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: 'rgba(120,180,230,0.55)' }}>{new Date().toLocaleTimeString('de',{hour:'2-digit',minute:'2-digit'})}</span>}>
            TAGESPLAN
          </SectionTitle>
          {eventsLoading ? (
            <div style={{ color: 'rgba(120,180,230,0.5)', fontSize: 13 }}>Lade Kalender...</div>
          ) : todayEvents.length === 0 ? (
            <div style={{ color: 'rgba(120,180,230,0.5)', fontSize: 13 }}>Keine Termine heute</div>
          ) : (
            todayEvents.map(e => (
              <div key={e.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(80,180,255,0.06)', alignItems: 'flex-start' }}>
                <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, color: '#80c0ff', minWidth: 44, marginTop: 1, letterSpacing: 0.5 }}>
                  {formatEventTime(e.date) || '--:--'}
                </div>
                <div style={{ flex: 1, fontSize: 13, color: '#d0e5ff', lineHeight: 1.4 }}>{e.title}</div>
              </div>
            ))
          )}
          {upcomingEvents.length > 0 && (
            <>
              <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, letterSpacing: 2.5, color: 'rgba(120,180,230,0.5)', margin: '16px 0 8px' }}>UPCOMING</div>
              {upcomingEvents.slice(0,6).map(e => (
                <div key={e.id} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid rgba(80,180,255,0.05)', alignItems: 'flex-start' }}>
                  <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: 'rgba(120,180,230,0.6)', minWidth: 60, marginTop: 1 }}>{formatEventDate(e.date)}</div>
                  <div style={{ flex: 1, fontSize: 12.5, color: '#c5e0ff' }}>{e.title}</div>
                </div>
              ))}
            </>
          )}
        </Card>

        {/* COL 2 — PRIOS */}
        <Card>
          <SectionTitle color="#fbbf24" action={<span style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: 'rgba(120,180,230,0.55)' }}>{donePrios}/{prios.length}</span>}>
            TOP PRIO
          </SectionTitle>
          {!prios.length && <div style={{ color: 'rgba(120,180,230,0.5)', fontSize: 13, padding: '8px 0' }}>Keine Prioritäten</div>}
          {prios.map(p => (
            <ItemRow key={p.id}>
              <div onClick={() => togglePrio(p.id, p.done)} style={{
                width: 18, height: 18, borderRadius: 2,
                border: `1px solid ${p.done ? '#34d399' : 'rgba(80,180,255,0.35)'}`,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, background: p.done ? 'rgba(52,211,153,0.2)' : 'transparent',
                color: '#34d399', flexShrink: 0,
              }}>{p.done ? '✓' : ''}</div>
              <div style={{ flex: 1, fontSize: 13, textDecoration: p.done ? 'line-through' : 'none', color: p.done ? 'rgba(120,180,230,0.5)' : '#d0e5ff', lineHeight: 1.4 }}>{p.text}</div>
              <div onClick={() => deletePrio(p.id)} style={{ cursor: 'pointer', color: 'rgba(120,180,230,0.4)', fontSize: 16, padding: '0 4px' }}>×</div>
            </ItemRow>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input value={newPrio} onChange={e => setNewPrio(e.target.value)} onKeyDown={e => e.key==='Enter'&&addPrio()} placeholder="Aufgabe..." style={inputStyle} />
            <button onClick={addPrio} style={plusBtn}>+</button>
          </div>
        </Card>

        {/* COL 3 — GOALS */}
        <Card>
          <SectionTitle color="#34d399" action={<span style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: 'rgba(120,180,230,0.55)' }}>{doneGoals}/{goals.length}</span>}>
            WEEKLY GOALS
          </SectionTitle>
          {!goals.length && <div style={{ color: 'rgba(120,180,230,0.5)', fontSize: 13, padding: '8px 0' }}>Keine Goals</div>}
          {goals.map(g => (
            <ItemRow key={g.id}>
              <div onClick={() => toggleGoal(g.id, g.done)} style={{
                width: 18, height: 18, borderRadius: 2,
                border: `1px solid ${g.done ? '#34d399' : 'rgba(80,180,255,0.35)'}`,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, background: g.done ? 'rgba(52,211,153,0.2)' : 'transparent',
                color: '#34d399', flexShrink: 0,
              }}>{g.done ? '✓' : ''}</div>
              <div style={{ flex: 1, fontSize: 13, textDecoration: g.done ? 'line-through' : 'none', color: g.done ? 'rgba(120,180,230,0.5)' : '#d0e5ff', lineHeight: 1.4 }}>{g.text}</div>
              <div onClick={() => deleteGoal(g.id)} style={{ cursor: 'pointer', color: 'rgba(120,180,230,0.4)', fontSize: 16, padding: '0 4px' }}>×</div>
            </ItemRow>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input value={newGoal} onChange={e => setNewGoal(e.target.value)} onKeyDown={e => e.key==='Enter'&&addGoal()} placeholder="Goal..." style={inputStyle} />
            <button onClick={addGoal} style={plusBtn}>+</button>
          </div>
        </Card>
      </div>

      {/* NON-NEGOTIABLES FULL WIDTH */}
      <Card style={{ marginTop: 18 }}>
        <SectionTitle color="#fbbf24" action={<span style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, color: 'rgba(120,180,230,0.55)' }}>{doneNN}/{nn.length}</span>}>
          NON-NEGOTIABLES
        </SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10 }}>
          {nn.map(n => (
            <div key={n.id} onClick={() => toggleNN(n.id, n.done)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              padding: '18px 8px', borderRadius: 3,
              border: `1px solid ${n.done ? 'rgba(52,211,153,0.45)' : 'rgba(80,180,255,0.14)'}`,
              background: n.done ? 'rgba(52,211,153,0.10)' : 'rgba(8,20,48,0.45)',
              cursor: 'pointer', transition: 'all 0.2s ease',
              boxShadow: n.done ? '0 0 18px rgba(52,211,153,0.20)' : 'none',
            }}>
              <span style={{ fontSize: 26 }}>{n.emoji}</span>
              <span style={{
                fontFamily: 'Space Mono, monospace', fontSize: 9, letterSpacing: 1.5,
                color: n.done ? '#34d399' : 'rgba(120,180,230,0.6)', textAlign: 'center', fontWeight: 700,
              }}>{n.label}</span>
            </div>
          ))}
        </div>
      </Card>

    </ModuleLayout>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'rgba(8,20,48,0.7)',
  border: '1px solid rgba(80,180,255,0.20)',
  borderRadius: 3,
  padding: '9px 12px',
  color: '#d8eaff',
  fontSize: 12.5,
  outline: 'none',
  fontFamily: 'DM Sans, system-ui, sans-serif',
}

const plusBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 3,
  background: 'rgba(80,180,255,0.25)',
  border: '1px solid rgba(120,200,255,0.45)',
  cursor: 'pointer',
  color: '#fff',
  fontSize: 18,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}
