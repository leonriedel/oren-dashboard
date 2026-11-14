'use client'
import React, { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import ModuleLayout from '@/components/ModuleLayout'
import type { User } from '@supabase/supabase-js'
import { useIsMobile } from '@/lib/useIsMobile'
import { useRole } from '@/lib/useRole'
import dynamic from 'next/dynamic'
const DayCoreGL = dynamic(() => import('@/components/secondbrain/DayCoreGL'), { ssr: false })

interface Props { user: User; onBack: () => void }

type Prio = { id: string; text: string; done: boolean; sort_order: number | null; created_at: string }
type Goal = { id: string; text: string; done: boolean }
type Habit = { id: string; emoji: string; label: string; sort_order: number }
type DayRow = { day: string; nn_done: string[] | null; review_good?: string | null; review_bad?: string | null; review_tomorrow?: string | null; briefing?: any }
type Briefing = { focus?: string; briefing?: string; flags?: string[]; generatedAt?: string }

const MONO = 'Space Mono, monospace'
const BLUE = '#80c0ff'
const GOLD = '#fbbf24'
const MINT = '#34d399'
const DIM = 'rgba(120,180,230,0.5)'

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

const DEFAULT_NN = [
  { emoji: '💪', label: 'SPORT' },
  { emoji: '🧘', label: 'MEDITATION' },
  { emoji: '📧', label: 'MAILS' },
  { emoji: '🤖', label: 'AI DEV' },
  { emoji: '⚡', label: 'OREN' },
]

export default function SecondBrain({ user, onBack }: Props) {
  const isMobile = useIsMobile()
  const { role } = useRole()
  const isAdmin = role === 'admin'
  const supabase = useMemo(() => createClient(), [])

  const [now, setNow] = useState(new Date())
  const today = dayKey(now)

  const [prios, setPrios] = useState<Prio[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [days, setDays] = useState<Record<string, DayRow>>({})
  const [events, setEvents] = useState<any[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)

  const [newPrio, setNewPrio] = useState('')
  const [newGoal, setNewGoal] = useState('')
  const [editingPrio, setEditingPrio] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const [habitEdit, setHabitEdit] = useState(false)
  const [newHabitEmoji, setNewHabitEmoji] = useState('✨')
  const [newHabitLabel, setNewHabitLabel] = useState('')

  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [briefingError, setBriefingError] = useState<string | null>(null)


  // clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 20_000)
    return () => clearInterval(id)
  }, [])

  // initial load
  useEffect(() => {
    load()
    fetch('/api/calendar')
      .then(r => r.json())
      .then(d => { setEvents(d.events || []); setEventsLoading(false) })
      .catch(() => setEventsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // briefing (admin only, once role is known)
  useEffect(() => {
    if (isAdmin) loadBriefing(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  async function load() {
    const since = dayKey(addDays(new Date(), -90))
    const [p, g, n, d] = await Promise.all([
      supabase.from('priorities').select('*').eq('user_id', user.id).order('sort_order', { ascending: true }).order('created_at'),
      supabase.from('goals').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('non_negotiables').select('*').eq('user_id', user.id).order('sort_order'),
      supabase.from('brain_days').select('*').eq('user_id', user.id).gte('day', since).order('day', { ascending: false }),
    ])
    setPrios((p.data as Prio[]) || [])
    setGoals((g.data as Goal[]) || [])
    if (!n.data?.length) {
      const { data } = await supabase.from('non_negotiables')
        .insert(DEFAULT_NN.map((h, i) => ({ ...h, done: false, sort_order: i, user_id: user.id }))).select()
      setHabits((data as Habit[]) || [])
    } else setHabits(n.data as Habit[])
    const map: Record<string, DayRow> = {}
    for (const row of (d.data as DayRow[]) || []) map[row.day] = row
    setDays(map)
  }

  async function loadBriefing(force: boolean) {
    setBriefingLoading(true); setBriefingError(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      const r = await fetch('/api/brain/briefing', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          day: dayKey(new Date()),
          localTime: new Date().toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' }),
          force,
        }),
      })
      const j = await r.json()
      if (j.error) setBriefingError(j.error)
      if (j.briefing) setBriefing(j.briefing)
    } catch (e) {
      setBriefingError(String(e))
    } finally {
      setBriefingLoading(false)
    }
  }

  // ─── day rows ───
  async function upsertDay(patch: Partial<DayRow>) {
    const row = { user_id: user.id, day: today, ...patch, updated_at: new Date().toISOString() }
    setDays(prev => ({ ...prev, [today]: { ...(prev[today] || { day: today, nn_done: [] }), ...patch } }))
    await supabase.from('brain_days').upsert(row, { onConflict: 'user_id,day' })
  }

  const todayDone: string[] = days[today]?.nn_done || []

  async function toggleHabit(id: string) {
    const next = todayDone.includes(id) ? todayDone.filter(x => x !== id) : [...todayDone, id]
    await upsertDay({ nn_done: next })
  }

  function streak(id: string) {
    let d = new Date()
    if (!(days[dayKey(d)]?.nn_done || []).includes(id)) d = addDays(d, -1)
    let s = 0
    while ((days[dayKey(d)]?.nn_done || []).includes(id)) { s++; d = addDays(d, -1) }
    return s
  }

  async function addHabit() {
    if (!newHabitLabel.trim()) return
    const { data } = await supabase.from('non_negotiables').insert({
      user_id: user.id, emoji: newHabitEmoji || '✨', label: newHabitLabel.trim().toUpperCase(),
      done: false, sort_order: habits.length,
    }).select().single()
    if (data) setHabits(prev => [...prev, data as Habit])
    setNewHabitLabel(''); setNewHabitEmoji('✨')
  }
  async function removeHabit(id: string) {
    await supabase.from('non_negotiables').delete().eq('id', id)
    setHabits(prev => prev.filter(h => h.id !== id))
  }

  // ─── priorities ───
  async function addPrio() {
    if (!newPrio.trim()) return
    const order = prios.length ? Math.max(...prios.map(p => p.sort_order || 0)) + 1 : 0
    const { data } = await supabase.from('priorities').insert({ user_id: user.id, text: newPrio.trim(), done: false, sort_order: order }).select().single()
    if (data) setPrios(prev => [...prev, data as Prio])
    setNewPrio('')
  }
  async function togglePrio(p: Prio) {
    await supabase.from('priorities').update({ done: !p.done }).eq('id', p.id)
    setPrios(prev => prev.map(x => x.id === p.id ? { ...x, done: !p.done } : x))
  }
  async function deletePrio(id: string) {
    await supabase.from('priorities').delete().eq('id', id)
    setPrios(prev => prev.filter(p => p.id !== id))
  }
  async function saveEdit(id: string) {
    const text = editText.trim()
    setEditingPrio(null)
    if (!text) return
    setPrios(prev => prev.map(p => p.id === id ? { ...p, text } : p))
    await supabase.from('priorities').update({ text }).eq('id', id)
  }
  async function reorder(fromId: string, toId: string) {
    if (fromId === toId) return
    const list = [...openPrios]
    const from = list.findIndex(p => p.id === fromId)
    const to = list.findIndex(p => p.id === toId)
    if (from < 0 || to < 0) return
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)
    const updated = list.map((p, i) => ({ ...p, sort_order: i }))
    setPrios([...updated, ...donePrios.map((p, i) => ({ ...p, sort_order: updated.length + i }))])
    await Promise.all(updated.map(p => supabase.from('priorities').update({ sort_order: p.sort_order }).eq('id', p.id)))
  }
  async function move(id: string, dir: -1 | 1) {
    const i = openPrios.findIndex(p => p.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= openPrios.length) return
    await reorder(id, openPrios[j].id)
  }

  // ─── goals ───
  async function addGoal() {
    if (!newGoal.trim()) return
    const { data } = await supabase.from('goals').insert({ user_id: user.id, text: newGoal.trim(), done: false }).select().single()
    if (data) setGoals(prev => [...prev, data as Goal])
    setNewGoal('')
  }
  async function toggleGoal(g: Goal) {
    await supabase.from('goals').update({ done: !g.done }).eq('id', g.id)
    setGoals(prev => prev.map(x => x.id === g.id ? { ...x, done: !g.done } : x))
  }
  async function deleteGoal(id: string) {
    await supabase.from('goals').delete().eq('id', id)
    setGoals(prev => prev.filter(g => g.id !== id))
  }

  // ─── derived ───
  const openPrios = prios.filter(p => !p.done)
  const donePrios = prios.filter(p => p.done)
  const doneHabits = habits.filter(h => todayDone.includes(h.id)).length
  const scoreTotal = Math.min(prios.length, 3) + habits.length
  const scoreDone = Math.min(donePrios.length, 3) + doneHabits
  const score = scoreTotal ? Math.round((scoreDone / scoreTotal) * 100) : 0

  const minutes = now.getHours() * 60 + now.getMinutes()
  const dayProgress = Math.max(0, Math.min(1, (minutes - 6 * 60) / (18 * 60)))
  const isEvening = now.getHours() >= 18

  const todayEvents = events.filter(e => new Date(e.date).toDateString() === now.toDateString())
  const upcomingEvents = events.filter(e => new Date(e.date) > now && new Date(e.date).toDateString() !== now.toDateString())
  const nextEvent = todayEvents.find(e => new Date(e.date) > now && e.date.includes('T'))

  const week = isoWeek(now)
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(now, i - 6))

  return (
    <ModuleLayout onBack={onBack} icon="🧠" title="SECONDBRAIN" titleColor={BLUE} sub="Daily Operations & Execution" iconBg="linear-gradient(135deg, rgba(60,120,200,0.4), rgba(100,180,255,0.2))">

      {/* ═══ DAY BAR ═══ */}
      <Panel style={{ padding: 0, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (isAdmin ? '260px 170px 1fr' : '1fr 200px'), alignItems: 'stretch' }}>

          {/* date / time */}
          <div style={{ padding: isMobile ? 18 : 24, borderRight: isMobile ? 'none' : '1px solid rgba(80,180,255,0.08)', borderBottom: isMobile ? '1px solid rgba(80,180,255,0.08)' : 'none' }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: DIM }}>
              {now.toLocaleDateString('en-GB', { weekday: 'long' }).toUpperCase()} · WEEK {week}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 6 }}>
              <div style={{ fontSize: 40, fontWeight: 300, color: '#e8f3ff', letterSpacing: 1, lineHeight: 1 }}>
                {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 12, color: BLUE, letterSpacing: 2 }}>
                {now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase()}
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 8.5, letterSpacing: 2, color: DIM, marginBottom: 5 }}>
                <span>DAY ELAPSED</span><span>{Math.round(dayProgress * 100)}%</span>
              </div>
              <div style={{ height: 3, background: 'rgba(80,180,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${dayProgress * 100}%`, height: '100%', background: `linear-gradient(90deg, ${BLUE}, ${isEvening ? GOLD : BLUE})`, boxShadow: `0 0 8px ${BLUE}` }} />
              </div>
            </div>
            {nextEvent && (
              <div style={{ marginTop: 14, fontSize: 12, color: '#c5e0ff', display: 'flex', gap: 8 }}>
                <span style={{ fontFamily: MONO, color: GOLD, fontSize: 11 }}>NEXT {new Date(nextEvent.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nextEvent.title}</span>
              </div>
            )}
          </div>

          {/* day score */}
          <div style={{ padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: isMobile || !isAdmin ? 'none' : '1px solid rgba(80,180,255,0.08)', borderBottom: isMobile ? '1px solid rgba(80,180,255,0.08)' : 'none', order: isAdmin ? 0 : 1 }}>
            <ScoreRing value={score} />
            <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 2.5, color: DIM, marginTop: 8 }}>DAY SCORE</div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(160,200,240,0.7)', marginTop: 4 }}>
              {Math.min(donePrios.length, 3)}/{Math.min(prios.length, 3)} TOP · {doneHabits}/{habits.length} HABITS
            </div>
          </div>

          {/* OREN briefing */}
          {isAdmin && (
            <div style={{ padding: isMobile ? 18 : 24, position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: MINT, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: MINT, boxShadow: `0 0 10px ${MINT}`, animation: briefingLoading ? 'sbPulse 1s infinite' : undefined }} />
                  OREN BRIEFING
                </div>
                <button onClick={() => loadBriefing(true)} disabled={briefingLoading} style={ghostBtn}>
                  {briefingLoading ? 'THINKING…' : '↻ REFRESH'}
                </button>
              </div>

              {briefing?.focus && (
                <div style={{ fontSize: isMobile ? 18 : 21, fontWeight: 600, color: '#eef6ff', lineHeight: 1.3, marginBottom: 8 }}>
                  {briefing.focus}
                </div>
              )}
              {briefing?.briefing && (
                <div style={{ fontSize: 13.5, color: 'rgba(200,225,250,0.82)', lineHeight: 1.6 }}>{briefing.briefing}</div>
              )}
              {!!briefing?.flags?.length && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  {briefing.flags.map((f, i) => (
                    <span key={i} style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 0.5, color: GOLD, padding: '3px 9px', borderRadius: 20, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
                      {f}
                    </span>
                  ))}
                </div>
              )}
              {!briefing && briefingLoading && <div style={{ fontFamily: MONO, fontSize: 11, color: DIM }}>reading priorities, calendar & inbox…</div>}
              {!briefing && !briefingLoading && briefingError && (
                <div style={{ fontFamily: MONO, fontSize: 10.5, color: 'rgba(255,200,120,0.8)' }}>
                  {briefingError.includes('not set') ? 'ANTHROPIC_API_KEY missing in Vercel env' : briefingError.includes('brain_days') ? 'Run lib/sql/secondbrain.sql in Supabase' : 'Briefing unavailable — try refresh'}
                </div>
              )}
              {briefing?.generatedAt && (
                <div style={{ fontFamily: MONO, fontSize: 8.5, color: 'rgba(120,180,230,0.35)', marginTop: 12, letterSpacing: 1 }}>
                  GENERATED {new Date(briefing.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          )}
        </div>
      </Panel>

      {/* ═══ 3 COLUMNS ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.15fr 1fr', gap: 18 }}>

        {/* TODAY */}
        <Panel>
          <Title color={BLUE} right={`${todayEvents.length} EVENTS`}>TODAY</Title>
          {eventsLoading ? <Empty>loading calendar…</Empty>
            : todayEvents.length === 0 ? <Empty>Clear calendar — deep work day.</Empty>
            : todayEvents.map(e => {
              const past = e.dateEnd ? new Date(e.dateEnd) < now : new Date(e.date) < now && e.date.includes('T')
              return (
                <div key={e.id} style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: '1px solid rgba(80,180,255,0.06)', opacity: past ? 0.4 : 1 }}>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: BLUE, minWidth: 44 }}>{fmtTime(e.date) || 'ALL'}</div>
                  <div style={{ flex: 1, fontSize: 13, color: '#d0e5ff', lineHeight: 1.4 }}>{e.title}</div>
                </div>
              )
            })}
          {upcomingEvents.length > 0 && (
            <>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2.5, color: DIM, margin: '18px 0 6px' }}>UPCOMING</div>
              {upcomingEvents.slice(0, 5).map(e => (
                <div key={e.id} style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid rgba(80,180,255,0.04)' }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(120,180,230,0.6)', minWidth: 62 }}>{fmtDay(e.date, now)}</div>
                  <div style={{ flex: 1, fontSize: 12.5, color: '#b8d6f5' }}>{e.title}</div>
                </div>
              ))}
            </>
          )}
        </Panel>

        {/* PRIORITIES */}
        <Panel>
          <Title color={GOLD} right={`${donePrios.length}/${prios.length}`}>PRIORITIES</Title>
          {!prios.length && <Empty>Add what matters today.</Empty>}
          {openPrios.map((p, i) => {
            const top = i < 3
            return (
              <React.Fragment key={p.id}>
                {i === 3 && <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 2.5, color: 'rgba(120,180,230,0.35)', margin: '12px 0 4px' }}>BACKLOG</div>}
                <div
                  draggable={!isMobile && editingPrio !== p.id}
                  onDragStart={() => setDragId(p.id)}
                  onDragOver={e => { e.preventDefault(); setOverId(p.id) }}
                  onDragLeave={() => setOverId(o => (o === p.id ? null : o))}
                  onDrop={e => { e.preventDefault(); if (dragId) reorder(dragId, p.id); setDragId(null); setOverId(null) }}
                  onDragEnd={() => { setDragId(null); setOverId(null) }}
                  className="sb-row"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: top ? '11px 12px' : '8px 12px',
                    marginBottom: 6, borderRadius: 8,
                    background: top ? 'linear-gradient(90deg, rgba(251,191,36,0.07), rgba(251,191,36,0.01))' : 'transparent',
                    border: `1px solid ${overId === p.id ? 'rgba(128,192,255,0.5)' : top ? 'rgba(251,191,36,0.16)' : 'rgba(80,180,255,0.05)'}`,
                    opacity: dragId === p.id ? 0.4 : 1,
                    cursor: isMobile ? 'default' : 'grab',
                    transition: 'border-color .15s, background .15s',
                  }}
                >
                  {top && <span style={{ fontFamily: MONO, fontSize: 10, color: GOLD, fontWeight: 700, width: 16 }}>{String(i + 1).padStart(2, '0')}</span>}
                  <Check done={false} onClick={() => togglePrio(p)} color={top ? GOLD : BLUE} />
                  {editingPrio === p.id ? (
                    <input autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                      onBlur={() => saveEdit(p.id)} onKeyDown={e => { if (e.key === 'Enter') saveEdit(p.id); if (e.key === 'Escape') setEditingPrio(null) }}
                      style={{ ...inputStyle, padding: '4px 8px' }} />
                  ) : (
                    <div onDoubleClick={() => { setEditingPrio(p.id); setEditText(p.text) }}
                      style={{ flex: 1, fontSize: top ? 14 : 12.5, color: top ? '#f0f6ff' : 'rgba(200,225,250,0.7)', lineHeight: 1.4, fontWeight: top ? 500 : 400 }}>
                      {p.text}
                    </div>
                  )}
                  {isMobile && (
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span onClick={() => move(p.id, -1)} style={arrowStyle}>▲</span>
                      <span onClick={() => move(p.id, 1)} style={arrowStyle}>▼</span>
                    </div>
                  )}
                  <span className="sb-x" onClick={() => deletePrio(p.id)} style={xStyle}>×</span>
                </div>
              </React.Fragment>
            )
          })}
          {donePrios.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {donePrios.map(p => (
                <div key={p.id} className="sb-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px' }}>
                  <Check done onClick={() => togglePrio(p)} color={MINT} />
                  <div style={{ flex: 1, fontSize: 12, color: 'rgba(120,180,230,0.4)', textDecoration: 'line-through' }}>{p.text}</div>
                  <span className="sb-x" onClick={() => deletePrio(p.id)} style={xStyle}>×</span>
                </div>
              ))}
            </div>
          )}
          <AddRow value={newPrio} onChange={setNewPrio} onAdd={addPrio} placeholder="New priority…" />
          {!isMobile && prios.length > 1 && <div style={{ fontFamily: MONO, fontSize: 8.5, color: 'rgba(120,180,230,0.3)', marginTop: 8, letterSpacing: 1 }}>DRAG TO REORDER · DOUBLE-CLICK TO EDIT</div>}
        </Panel>

        {/* GOALS */}
        <Panel>
          <Title color={MINT} right={`${goals.filter(g => g.done).length}/${goals.length}`}>WEEKLY GOALS</Title>
          {goals.length > 0 && (
            <div style={{ height: 3, background: 'rgba(80,180,255,0.08)', borderRadius: 2, overflow: 'hidden', marginBottom: 12 }}>
              <div style={{ height: '100%', width: `${(goals.filter(g => g.done).length / goals.length) * 100}%`, background: MINT, boxShadow: `0 0 8px ${MINT}`, transition: 'width .5s' }} />
            </div>
          )}
          {!goals.length && <Empty>What must be true by Sunday?</Empty>}
          {goals.map(g => (
            <div key={g.id} className="sb-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(80,180,255,0.05)' }}>
              <Check done={g.done} onClick={() => toggleGoal(g)} color={MINT} />
              <div style={{ flex: 1, fontSize: 13, color: g.done ? 'rgba(120,180,230,0.4)' : '#d0e5ff', textDecoration: g.done ? 'line-through' : 'none', lineHeight: 1.4 }}>{g.text}</div>
              <span className="sb-x" onClick={() => deleteGoal(g.id)} style={xStyle}>×</span>
            </div>
          ))}
          <AddRow value={newGoal} onChange={setNewGoal} onAdd={addGoal} placeholder="New weekly goal…" />
        </Panel>
      </div>

      {/* ═══ NON-NEGOTIABLES ═══ */}
      <Panel style={{ marginTop: 18 }}>
        <Title color={GOLD} right={
          <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span>{doneHabits}/{habits.length} TODAY</span>
            <button onClick={() => setHabitEdit(v => !v)} style={ghostBtn}>{habitEdit ? 'DONE' : 'EDIT'}</button>
          </span>
        }>NON-NEGOTIABLES</Title>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : `repeat(${Math.max(habits.length, 1)},1fr)`, gap: 10 }}>
          {habits.map(h => {
            const done = todayDone.includes(h.id)
            const s = streak(h.id)
            return (
              <div key={h.id} onClick={() => !habitEdit && toggleHabit(h.id)} style={{
                position: 'relative',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                padding: '16px 8px 12px', borderRadius: 10,
                border: `1px solid ${done ? 'rgba(52,211,153,0.45)' : 'rgba(80,180,255,0.12)'}`,
                background: done ? 'radial-gradient(circle at 50% 0%, rgba(52,211,153,0.16), rgba(52,211,153,0.04))' : 'rgba(8,20,48,0.35)',
                cursor: habitEdit ? 'default' : 'pointer', transition: 'all .2s',
                boxShadow: done ? '0 0 22px rgba(52,211,153,0.15)' : 'none',
              }}>
                {habitEdit && <span onClick={() => removeHabit(h.id)} style={{ ...xStyle, opacity: 1, position: 'absolute', top: 4, right: 8 }}>×</span>}
                <span style={{ fontSize: 24, filter: done ? 'none' : 'grayscale(0.4)', opacity: done ? 1 : 0.8 }}>{h.emoji}</span>
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1.5, fontWeight: 700, color: done ? MINT : 'rgba(150,195,240,0.65)', textAlign: 'center' }}>{h.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 10, color: s > 0 ? GOLD : 'rgba(120,180,230,0.3)', minHeight: 14 }}>
                  {s > 0 ? `🔥 ${s}` : '—'}
                </span>
                <div style={{ display: 'flex', gap: 3 }}>
                  {last7.map(d => {
                    const k = dayKey(d)
                    const hit = (days[k]?.nn_done || []).includes(h.id)
                    const isToday = k === today
                    return <span key={k} title={k} style={{
                      width: 7, height: 7, borderRadius: 2,
                      background: hit ? MINT : 'rgba(80,180,255,0.1)',
                      boxShadow: hit ? `0 0 4px ${MINT}` : 'none',
                      outline: isToday ? '1px solid rgba(128,192,255,0.5)' : 'none', outlineOffset: 1,
                    }} />
                  })}
                </div>
              </div>
            )
          })}
        </div>
        {habitEdit && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input value={newHabitEmoji} onChange={e => setNewHabitEmoji(e.target.value)} style={{ ...inputStyle, flex: 'none', width: 52, textAlign: 'center' }} />
            <input value={newHabitLabel} onChange={e => setNewHabitLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && addHabit()} placeholder="New habit…" style={inputStyle} />
            <button onClick={addHabit} style={plusBtn}>+</button>
          </div>
        )}
      </Panel>

      {/* ═══ DAY CORE ═══ */}
      <Panel style={{ marginTop: 18, padding: 0 }}>
        <div style={{ position: 'absolute', top: 18, left: 20, zIndex: 2 }}>
          <Title color={MINT}>DAY CORE</Title>
        </div>
        <div style={{ position: 'absolute', top: 18, right: 20, zIndex: 2, fontFamily: MONO, fontSize: 9, letterSpacing: 1.5, color: DIM, textAlign: 'right', lineHeight: 1.8 }}>
          <div><span style={{ color: GOLD }}>◆</span> TOP 3 PRIORITIES</div>
          <div><span style={{ color: MINT }}>●</span> HABITS · CLICK TO CHECK</div>
        </div>
        <DayCoreGL
          height={isMobile ? 340 : 460}
          score={score}
          prios={openPrios.slice(0, 3).map(p => ({ id: p.id, text: p.text, done: false })).concat(donePrios.slice(0, Math.max(0, 3 - openPrios.length)).map(p => ({ id: p.id, text: p.text, done: true })))}
          habits={habits.map(h => ({ id: h.id, label: h.label, emoji: h.emoji, done: todayDone.includes(h.id), streak: streak(h.id) }))}
          onToggleHabit={toggleHabit}
        />
      </Panel>

      <style>{`
        @keyframes sbPulse { 0%,100% { opacity: 1 } 50% { opacity: .25 } }
        .sb-row .sb-x { opacity: 0; transition: opacity .15s }
        .sb-row:hover .sb-x { opacity: 1 }
        @media (hover: none) { .sb-row .sb-x { opacity: .6 } }
      `}</style>
    </ModuleLayout>
  )
}

// ─── small pieces ───

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      position: 'relative',
      background: 'linear-gradient(180deg, rgba(10,24,54,0.55) 0%, rgba(6,16,38,0.42) 100%)',
      border: '1px solid rgba(80,180,255,0.12)',
      borderRadius: 14, padding: 20,
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      boxShadow: '0 10px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(140,210,255,0.07)',
      overflow: 'hidden',
      ...style,
    }}>
      <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(140,210,255,0.45), transparent)', pointerEvents: 'none' }} />
      {children}
    </div>
  )
}

function Title({ children, color, right }: { children: React.ReactNode; color: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
      <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: 2.5, color, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
        {children}
      </div>
      {right && <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5, color: DIM }}>{right}</div>}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ color: 'rgba(120,180,230,0.45)', fontSize: 12.5, padding: '6px 0 10px' }}>{children}</div>
}

function Check({ done, onClick, color }: { done: boolean; onClick: () => void; color: string }) {
  return (
    <div onClick={e => { e.stopPropagation(); onClick() }} style={{
      width: 18, height: 18, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
      border: `1.5px solid ${done ? color : 'rgba(128,192,255,0.35)'}`,
      background: done ? `${color}30` : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color, fontSize: 10, transition: 'all .15s',
    }}>{done ? '✓' : ''}</div>
  )
}

function AddRow({ value, onChange, onAdd, placeholder }: { value: string; onChange: (v: string) => void; onAdd: () => void; placeholder: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <input value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => e.key === 'Enter' && onAdd()} placeholder={placeholder} style={inputStyle} />
      <button onClick={onAdd} style={plusBtn}>+</button>
    </div>
  )
}

function ScoreRing({ value }: { value: number }) {
  const r = 38, c = 2 * Math.PI * r
  const color = value >= 80 ? MINT : value >= 40 ? BLUE : GOLD
  return (
    <div style={{ position: 'relative', width: 96, height: 96 }}>
      <svg width={96} height={96} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={48} cy={48} r={r} fill="none" stroke="rgba(80,180,255,0.1)" strokeWidth={4} />
        <circle cx={48} cy={48} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)}
          style={{ transition: 'stroke-dashoffset .8s ease, stroke .3s', filter: `drop-shadow(0 0 6px ${color})` }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 300, color: '#eef6ff' }}>
        {value}<span style={{ fontSize: 11, color: DIM, marginLeft: 1 }}>%</span>
      </div>
    </div>
  )
}

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

function fmtTime(s: string) {
  if (!s.includes('T')) return null
  return new Date(s).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function fmtDay(s: string, now: Date) {
  const d = new Date(s)
  if (d.toDateString() === addDays(now, 1).toDateString()) return 'TOMORROW'
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'rgba(6,16,38,0.6)',
  border: '1px solid rgba(80,180,255,0.16)',
  borderRadius: 8,
  padding: '9px 12px',
  color: '#d8eaff',
  fontSize: 12.5,
  outline: 'none',
  fontFamily: 'DM Sans, system-ui, sans-serif',
}

const plusBtn: React.CSSProperties = {
  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
  background: 'rgba(80,180,255,0.14)',
  border: '1px solid rgba(120,200,255,0.3)',
  cursor: 'pointer', color: '#cfe8ff', fontSize: 18,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const ghostBtn: React.CSSProperties = {
  fontFamily: MONO, fontSize: 9, letterSpacing: 1.5,
  color: 'rgba(160,210,255,0.75)', background: 'transparent',
  border: '1px solid rgba(80,180,255,0.2)', borderRadius: 20,
  padding: '3px 10px', cursor: 'pointer',
}

const xStyle: React.CSSProperties = { cursor: 'pointer', color: 'rgba(160,200,240,0.5)', fontSize: 16, padding: '0 4px', lineHeight: 1 }
const arrowStyle: React.CSSProperties = { cursor: 'pointer', color: 'rgba(160,200,240,0.5)', fontSize: 8, padding: '1px 4px', lineHeight: 1 }
