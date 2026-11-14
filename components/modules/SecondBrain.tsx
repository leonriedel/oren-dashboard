'use client'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase'
import ModuleLayout from '@/components/ModuleLayout'
import type { User } from '@supabase/supabase-js'
import { useIsMobile } from '@/lib/useIsMobile'
import { useRole } from '@/lib/useRole'
import { TYPE_COLORS } from '@/components/secondbrain/KnowledgeGraph'

const KnowledgeGraph = dynamic(() => import('@/components/secondbrain/KnowledgeGraph'), { ssr: false })

interface Props { user: User; onBack: () => void }

type Note = {
  id: string; type: string; title: string; body: string | null; url: string | null; summary: string | null
  tags: string[]; related: string[]; pinned: boolean; created_at: string
}
type Prio = { id: string; text: string; done: boolean; sort_order: number | null; created_at: string }
type Habit = { id: string; emoji: string; label: string; sort_order: number }
type DayRow = { day: string; nn_done: string[] | null }
type Briefing = { focus?: string; briefing?: string; flags?: string[] }

const MONO = 'Space Mono, monospace'
const BLUE = '#80c0ff', GOLD = '#fbbf24', MINT = '#34d399'
const DIM = 'rgba(120,180,230,0.5)'
const TYPES = ['idea', 'note', 'link', 'task', 'goal', 'person', 'quote']
const TYPE_ICON: Record<string, string> = { idea: '✦', note: '▤', link: '↗', task: '◉', goal: '◎', person: '☺', quote: '❝' }

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'now'; if (m < 60) return `${m}m`; const h = Math.round(m / 60); if (h < 24) return `${h}h`
  const d = Math.round(h / 24); return d < 30 ? `${d}d` : new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}
const DEFAULT_NN = [
  { emoji: '💪', label: 'SPORT' }, { emoji: '🧘', label: 'MEDITATION' }, { emoji: '📧', label: 'MAILS' },
  { emoji: '🤖', label: 'AI DEV' }, { emoji: '⚡', label: 'OREN' },
]

export default function SecondBrain({ user, onBack }: Props) {
  const isMobile = useIsMobile()
  const { role } = useRole()
  const isAdmin = role === 'admin'
  const supabase = useMemo(() => createClient(), [])
  const inputRef = useRef<HTMLInputElement>(null)
  const topRef = useRef<HTMLDivElement>(null)

  // knowledge
  const [notes, setNotes] = useState<Note[]>([])
  const [loaded, setLoaded] = useState(false)
  const [mode, setMode] = useState<'capture' | 'ask'>('capture')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [burstId, setBurstId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [answer, setAnswer] = useState<{ q: string; answer: string; cited: string[] } | null>(null)
  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')

  // today
  const [prios, setPrios] = useState<Prio[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [days, setDays] = useState<Record<string, DayRow>>({})
  const [newPrio, setNewPrio] = useState('')
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [briefingBusy, setBriefingBusy] = useState(false)
  const today = dayKey(new Date())

  useEffect(() => { loadAll() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (isAdmin) loadBriefing(false) // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus() }
      if (e.key === 'Escape') { setSelectedId(null); setAnswer(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t) }, [toast])

  async function token() {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token
  }

  async function loadAll() {
    const since = dayKey(addDays(new Date(), -60))
    const [n, p, h, d] = await Promise.all([
      supabase.from('brain_notes').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(600),
      supabase.from('priorities').select('*').eq('user_id', user.id).order('sort_order', { ascending: true }).order('created_at'),
      supabase.from('non_negotiables').select('*').eq('user_id', user.id).order('sort_order'),
      supabase.from('brain_days').select('day,nn_done').eq('user_id', user.id).gte('day', since),
    ])
    setNotes(((n.data as Note[]) || []).map(x => ({ ...x, tags: x.tags || [], related: x.related || [] })))
    setPrios((p.data as Prio[]) || [])
    if (!h.data?.length) {
      const { data } = await supabase.from('non_negotiables').insert(DEFAULT_NN.map((x, i) => ({ ...x, done: false, sort_order: i, user_id: user.id }))).select()
      setHabits((data as Habit[]) || [])
    } else setHabits(h.data as Habit[])
    const map: Record<string, DayRow> = {}; for (const r of (d.data as DayRow[]) || []) map[r.day] = r
    setDays(map)
    setLoaded(true)
  }

  async function loadBriefing(force: boolean) {
    setBriefingBusy(true)
    try {
      const t = await token()
      const r = await fetch('/api/brain/briefing', {
        method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ day: dayKey(new Date()), localTime: new Date().toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' }), force }),
      })
      const j = await r.json(); if (j.briefing) setBriefing(j.briefing)
    } catch { /* noop */ } finally { setBriefingBusy(false) }
  }

  // ─── capture / ask ───
  async function submit() {
    const text = input.trim(); if (!text || busy) return
    setBusy(true)
    try {
      const t = await token()
      if (mode === 'ask') {
        const r = await fetch('/api/brain/ask', { method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify({ question: text }) })
        const j = await r.json()
        if (j.error) setToast(j.error.includes('not set') ? 'ANTHROPIC_API_KEY missing' : 'OREN could not answer')
        else { setAnswer({ q: text, answer: j.answer, cited: j.cited || [] }); setSelectedId(null); setInput('') }
      } else {
        const r = await fetch('/api/brain/capture', { method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify({ text }) })
        const j = await r.json()
        if (j.error) setToast(j.error.includes('brain_notes') ? 'Run lib/sql/brain_notes.sql in Supabase first' : `Error: ${j.error}`)
        else if (j.note) {
          const note: Note = { ...j.note, tags: j.note.tags || [], related: j.note.related || [] }
          setNotes(prev => [note, ...prev.map(n => note.related.includes(n.id) ? { ...n, related: Array.from(new Set([...n.related, note.id])) } : n)])
          setBurstId(note.id); setInput('')
          const extra = j.alsoCreated === 'task' ? ' · added to priorities' : j.alsoCreated === 'goal' ? ' · added to goals' : ''
          setToast(`Filed as ${note.type.toUpperCase()}${note.tags.length ? ' · ' + note.tags.map(x => '#' + x).join(' ') : ''}${note.related.length ? ` · linked to ${note.related.length}` : ''}${extra}`)
          if (j.alsoCreated === 'task') {
            const p = await supabase.from('priorities').select('*').eq('user_id', user.id).order('sort_order', { ascending: true }).order('created_at')
            setPrios((p.data as Prio[]) || [])
          }
        }
      }
    } catch (e) { setToast(String(e)) } finally { setBusy(false) }
  }

  // ─── note actions ───
  const selected = notes.find(n => n.id === selectedId) || null
  useEffect(() => { setEditing(false) }, [selectedId])

  async function togglePin(n: Note) {
    setNotes(prev => prev.map(x => x.id === n.id ? { ...x, pinned: !n.pinned } : x))
    await supabase.from('brain_notes').update({ pinned: !n.pinned }).eq('id', n.id)
  }
  async function deleteNote(n: Note) {
    setNotes(prev => prev.filter(x => x.id !== n.id).map(x => ({ ...x, related: x.related.filter(r => r !== n.id) })))
    setSelectedId(null)
    await supabase.from('brain_notes').delete().eq('id', n.id)
  }
  async function saveEdit(n: Note) {
    const patch = { title: editTitle.trim() || n.title, body: editBody, updated_at: new Date().toISOString() }
    setNotes(prev => prev.map(x => x.id === n.id ? { ...x, ...patch } : x))
    setEditing(false)
    await supabase.from('brain_notes').update(patch).eq('id', n.id)
  }
  async function toPriority(n: Note) {
    const { data } = await supabase.from('priorities').insert({ user_id: user.id, text: n.title, done: false, sort_order: prios.length }).select().single()
    if (data) { setPrios(prev => [...prev, data as Prio]); setToast('Added to priorities') }
  }
  function select(id: string) {
    setSelectedId(id); setAnswer(null)
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ─── today actions ───
  const todayDone = days[today]?.nn_done || []
  async function toggleHabit(id: string) {
    const next = todayDone.includes(id) ? todayDone.filter(x => x !== id) : [...todayDone, id]
    setDays(prev => ({ ...prev, [today]: { day: today, nn_done: next } }))
    await supabase.from('brain_days').upsert({ user_id: user.id, day: today, nn_done: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id,day' })
  }
  function streak(id: string) {
    let d = new Date(); if (!(days[dayKey(d)]?.nn_done || []).includes(id)) d = addDays(d, -1)
    let s = 0; while ((days[dayKey(d)]?.nn_done || []).includes(id)) { s++; d = addDays(d, -1) }
    return s
  }
  async function togglePrio(p: Prio) {
    setPrios(prev => prev.map(x => x.id === p.id ? { ...x, done: !p.done } : x))
    await supabase.from('priorities').update({ done: !p.done }).eq('id', p.id)
  }
  async function deletePrio(id: string) {
    setPrios(prev => prev.filter(p => p.id !== id))
    await supabase.from('priorities').delete().eq('id', id)
  }
  async function addPrio() {
    if (!newPrio.trim()) return
    const { data } = await supabase.from('priorities').insert({ user_id: user.id, text: newPrio.trim(), done: false, sort_order: prios.length }).select().single()
    if (data) setPrios(prev => [...prev, data as Prio]); setNewPrio('')
  }

  // ─── derived ───
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>(); notes.forEach(n => n.tags.forEach(t => m.set(t, (m.get(t) || 0) + 1)))
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [notes])
  const linkCount = useMemo(() => notes.reduce((a, n) => a + n.related.length, 0) / 2, [notes])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return notes.filter(n =>
      (!typeFilter || n.type === typeFilter) &&
      (!tagFilter || n.tags.includes(tagFilter)) &&
      (!q || `${n.title} ${n.summary || ''} ${n.body || ''} ${n.tags.join(' ')}`.toLowerCase().includes(q)))
  }, [notes, typeFilter, tagFilter, search])
  const highlight = useMemo(() => {
    if (answer?.cited.length) return new Set(answer.cited)
    if (typeFilter || tagFilter || search.trim()) return new Set(filtered.map(n => n.id).concat(tagFilter ? ['tag:' + tagFilter] : []))
    return null
  }, [answer, typeFilter, tagFilter, search, filtered])
  const stream = useMemo(() => [...filtered].sort((a, b) => Number(b.pinned) - Number(a.pinned)), [filtered])
  const graphNotes = useMemo(() => notes.map(n => ({ id: n.id, type: n.type, title: n.title, tags: n.tags, related: n.related, pinned: n.pinned })), [notes])
  const openPrios = prios.filter(p => !p.done)
  const doneToday = habits.filter(h => todayDone.includes(h.id)).length

  return (
    <ModuleLayout onBack={onBack} icon="🧠" title="SECONDBRAIN" titleColor={BLUE} sub="Capture · Connect · Recall" maxWidth={1600}
      iconBg="linear-gradient(135deg, rgba(60,120,200,0.4), rgba(100,180,255,0.2))">
      <div ref={topRef} style={{ scrollMarginTop: 90 }} />

      {/* ═══ CAPTURE BAR ═══ */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '8px 8px 8px 10px' : '10px 10px 10px 14px', borderRadius: 16,
          background: 'linear-gradient(180deg, rgba(12,30,66,0.7), rgba(6,16,38,0.6))',
          border: `1px solid ${mode === 'ask' ? 'rgba(52,211,153,0.4)' : 'rgba(120,200,255,0.3)'}`,
          boxShadow: `0 0 40px ${mode === 'ask' ? 'rgba(52,211,153,0.12)' : 'rgba(80,170,255,0.14)'}, inset 0 1px 0 rgba(160,220,255,0.08)`,
          backdropFilter: 'blur(16px)', transition: 'border-color .25s, box-shadow .25s',
        }}>
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: 3, flexShrink: 0 }}>
            {(['capture', 'ask'] as const).map(m => (
              <button key={m} disabled={m === 'ask' && !isAdmin} onClick={() => { setMode(m); inputRef.current?.focus() }} style={{
                fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, fontWeight: 700, padding: isMobile ? '7px 9px' : '7px 13px', borderRadius: 8, border: 'none',
                cursor: m === 'ask' && !isAdmin ? 'not-allowed' : 'pointer', opacity: m === 'ask' && !isAdmin ? 0.35 : 1,
                background: mode === m ? (m === 'ask' ? 'rgba(52,211,153,0.2)' : 'rgba(80,180,255,0.22)') : 'transparent',
                color: mode === m ? (m === 'ask' ? MINT : '#cfe8ff') : DIM,
              }}>{m === 'capture' ? '✚ CAPTURE' : '◎ ASK'}</button>
            ))}
          </div>
          <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder={mode === 'capture' ? 'Drop a thought, idea, link, task… OREN files and connects it' : 'Ask your brain anything…'}
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#eef6ff', fontSize: isMobile ? 14 : 16, fontFamily: 'DM Sans, system-ui, sans-serif', padding: '8px 4px' }} />
          {!isMobile && <span style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(120,180,230,0.35)', letterSpacing: 1 }}>⌘K</span>}
          <button onClick={submit} disabled={busy || !input.trim()} style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0, cursor: busy ? 'wait' : 'pointer', fontSize: 16,
            background: mode === 'ask' ? 'rgba(52,211,153,0.2)' : 'rgba(80,180,255,0.22)',
            border: `1px solid ${mode === 'ask' ? 'rgba(52,211,153,0.5)' : 'rgba(120,200,255,0.45)'}`, color: '#eef6ff',
          }}>{busy ? <span style={{ display: 'inline-block', animation: 'sbSpin 1s linear infinite' }}>◌</span> : '↵'}</button>
        </div>
        <div style={{ height: 18, marginTop: 6, paddingLeft: 6, fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: toast ? MINT : 'rgba(120,180,230,0.35)', transition: 'color .3s' }}>
          {busy ? (mode === 'ask' ? 'OREN is searching your brain…' : 'OREN is filing & connecting…') : toast || (isAdmin ? 'tip: #tags work · tasks land in your priorities automatically' : 'tip: use #tags to organise')}
        </div>
      </div>

      {/* ═══ MAIN GRID ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 380px', gap: 16 }}>

        {/* GRAPH */}
        <Panel style={{ padding: 0 }}>
          <KnowledgeGraph
            notes={graphNotes} selectedId={selectedId} highlight={highlight} burstId={burstId}
            height={isMobile ? 420 : 660}
            onSelect={id => { setSelectedId(id); if (id) setAnswer(null) }}
            onTag={t => setTagFilter(prev => prev === t ? null : t)}
          />
          {/* overlay: filters */}
          <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', gap: 10, pointerEvents: 'none', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', pointerEvents: 'auto', maxWidth: isMobile ? '100%' : '70%' }}>
              <Chip active={!typeFilter} onClick={() => setTypeFilter(null)} color={BLUE}>ALL {notes.length}</Chip>
              {TYPES.filter(t => notes.some(n => n.type === t)).map(t => (
                <Chip key={t} active={typeFilter === t} onClick={() => setTypeFilter(typeFilter === t ? null : t)} color={TYPE_COLORS[t]}>
                  {TYPE_ICON[t]} {t.toUpperCase()} {notes.filter(n => n.type === t).length}
                </Chip>
              ))}
              {tagFilter && <Chip active onClick={() => setTagFilter(null)} color="#bfe0ff">#{tagFilter} ×</Chip>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, pointerEvents: 'auto' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="⌕ filter…" style={{
                width: 170, background: 'rgba(6,16,38,0.65)', border: '1px solid rgba(120,200,255,0.2)', borderRadius: 10,
                padding: '7px 11px', color: '#d8eaff', fontSize: 12, outline: 'none', fontFamily: 'DM Sans, system-ui, sans-serif', backdropFilter: 'blur(8px)',
              }} />
              {!isMobile && (
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1.5, color: DIM, textAlign: 'right', lineHeight: 1.8 }}>
                  <div><b style={{ color: '#cfe8ff' }}>{notes.length}</b> NODES · <b style={{ color: '#cfe8ff' }}>{Math.round(linkCount)}</b> LINKS · <b style={{ color: '#cfe8ff' }}>{tagCounts.length}</b> TAGS</div>
                  <div style={{ color: 'rgba(120,180,230,0.35)' }}>DRAG TO ROTATE · CLICK TO OPEN</div>
                </div>
              )}
            </div>
          </div>
          {loaded && notes.length === 0 && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 40, textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: 18, color: '#e8f3ff', fontWeight: 500 }}>Your second brain is empty</div>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, color: DIM, marginTop: 6 }}>CAPTURE YOUR FIRST THOUGHT ABOVE — EVERY NOTE BECOMES A NEURON</div>
            </div>
          )}
        </Panel>

        {/* SIDE */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {answer && (
            <Panel style={{ borderColor: 'rgba(52,211,153,0.3)' }}>
              <Head color={MINT} right={<X onClick={() => setAnswer(null)} />}>OREN ANSWERS</Head>
              <div style={{ fontSize: 12, color: DIM, marginBottom: 8, fontStyle: 'italic' }}>“{answer.q}”</div>
              <div style={{ fontSize: 13.5, color: '#e3f0ff', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{answer.answer}</div>
              {answer.cited.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  {answer.cited.map(id => { const n = notes.find(x => x.id === id); return n && (
                    <Chip key={id} active onClick={() => select(id)} color={TYPE_COLORS[n.type]}>{TYPE_ICON[n.type]} {n.title.slice(0, 28)}</Chip>
                  ) })}
                </div>
              )}
            </Panel>
          )}

          {selected && (
            <Panel style={{ borderColor: `${TYPE_COLORS[selected.type]}55` }}>
              <Head color={TYPE_COLORS[selected.type]} right={<X onClick={() => setSelectedId(null)} />}>
                {TYPE_ICON[selected.type]} {selected.type.toUpperCase()} · {ago(selected.created_at)}
              </Head>
              {editing ? (
                <>
                  <input value={editTitle} onChange={e => setEditTitle(e.target.value)} style={{ ...field, fontSize: 15, fontWeight: 600, marginBottom: 8 }} />
                  <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={6} style={{ ...field, resize: 'vertical', lineHeight: 1.5 }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <Btn onClick={() => saveEdit(selected)} color={MINT}>SAVE</Btn>
                    <Btn onClick={() => setEditing(false)}>CANCEL</Btn>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 18, fontWeight: 600, color: '#f0f7ff', lineHeight: 1.3 }}>{selected.title}</div>
                  {selected.summary && <div style={{ fontSize: 13, color: 'rgba(200,225,250,0.75)', lineHeight: 1.55, marginTop: 8 }}>{selected.summary}</div>}
                  {selected.body && selected.body !== selected.title && (
                    <div style={{ fontSize: 12.5, color: 'rgba(200,225,250,0.6)', lineHeight: 1.55, marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.2)', whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' }}>
                      {selected.body}
                    </div>
                  )}
                  {selected.url && (
                    <a href={selected.url} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 10, fontFamily: MONO, fontSize: 10.5, color: TYPE_COLORS.link, wordBreak: 'break-all', textDecoration: 'none' }}>↗ {selected.url}</a>
                  )}
                </>
              )}
              {selected.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                  {selected.tags.map(t => <Chip key={t} active={tagFilter === t} onClick={() => setTagFilter(tagFilter === t ? null : t)} color="#bfe0ff">#{t}</Chip>)}
                </div>
              )}
              {selected.related.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: DIM, marginBottom: 6 }}>CONNECTED</div>
                  {selected.related.map(id => { const n = notes.find(x => x.id === id); return n && (
                    <div key={id} onClick={() => setSelectedId(id)} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', cursor: 'pointer', borderTop: '1px solid rgba(80,180,255,0.06)' }}>
                      <span style={{ color: TYPE_COLORS[n.type], fontSize: 11, width: 14 }}>{TYPE_ICON[n.type]}</span>
                      <span style={{ fontSize: 12.5, color: '#cfe4fa', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</span>
                    </div>
                  ) })}
                </div>
              )}
              {!editing && (
                <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
                  <Btn onClick={() => togglePin(selected)} color={selected.pinned ? GOLD : undefined}>{selected.pinned ? '★ PINNED' : '☆ PIN'}</Btn>
                  <Btn onClick={() => { setEditing(true); setEditTitle(selected.title); setEditBody(selected.body || '') }}>EDIT</Btn>
                  <Btn onClick={() => toPriority(selected)} color={GOLD}>→ PRIORITY</Btn>
                  <Btn onClick={() => deleteNote(selected)} color="#f87171">DELETE</Btn>
                </div>
              )}
            </Panel>
          )}

          {/* TODAY */}
          <Panel>
            <Head color={BLUE} right={<span>{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase()}</span>}>TODAY</Head>
            {isAdmin && (
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.16)', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: MINT }}>● OREN FOCUS</span>
                  <span onClick={() => !briefingBusy && loadBriefing(true)} style={{ fontFamily: MONO, fontSize: 9, color: DIM, cursor: 'pointer' }}>{briefingBusy ? '…' : '↻'}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#eef6ff', marginTop: 5, lineHeight: 1.35 }}>{briefing?.focus || (briefingBusy ? 'thinking…' : '—')}</div>
                {briefing?.briefing && <div style={{ fontSize: 12, color: 'rgba(200,225,250,0.7)', marginTop: 5, lineHeight: 1.5 }}>{briefing.briefing}</div>}
              </div>
            )}

            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: GOLD, marginBottom: 6 }}>PRIORITIES · {prios.filter(p => p.done).length}/{prios.length}</div>
            {openPrios.slice(0, 5).map((p, i) => (
              <div key={p.id} className="sb-row" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0' }}>
                <span style={{ fontFamily: MONO, fontSize: 9.5, color: i < 3 ? GOLD : DIM, width: 16 }}>{String(i + 1).padStart(2, '0')}</span>
                <Check onClick={() => togglePrio(p)} done={false} color={i < 3 ? GOLD : BLUE} />
                <span style={{ flex: 1, fontSize: 13, color: i < 3 ? '#eef6ff' : 'rgba(200,225,250,0.7)', lineHeight: 1.35 }}>{p.text}</span>
                <span className="sb-x" onClick={() => deletePrio(p.id)} style={{ cursor: 'pointer', color: DIM, fontSize: 14 }}>×</span>
              </div>
            ))}
            {openPrios.length > 5 && <div style={{ fontFamily: MONO, fontSize: 9, color: DIM, padding: '2px 0 4px 25px' }}>+{openPrios.length - 5} MORE</div>}
            {prios.filter(p => p.done).slice(0, 3).map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 0 4px 25px' }}>
                <Check onClick={() => togglePrio(p)} done color={MINT} />
                <span style={{ flex: 1, fontSize: 12, color: 'rgba(120,180,230,0.4)', textDecoration: 'line-through' }}>{p.text}</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input value={newPrio} onChange={e => setNewPrio(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPrio()} placeholder="Add priority…" style={{ ...field, padding: '7px 10px' }} />
            </div>

            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: MINT, margin: '16px 0 8px' }}>NON-NEGOTIABLES · {doneToday}/{habits.length}</div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(habits.length, 5)}, 1fr)`, gap: 6 }}>
              {habits.map(h => {
                const done = todayDone.includes(h.id), s = streak(h.id)
                return (
                  <div key={h.id} onClick={() => toggleHabit(h.id)} title={h.label} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '9px 2px 7px', borderRadius: 10, cursor: 'pointer',
                    border: `1px solid ${done ? 'rgba(52,211,153,0.5)' : 'rgba(80,180,255,0.12)'}`,
                    background: done ? 'radial-gradient(circle at 50% 0%, rgba(52,211,153,0.22), rgba(52,211,153,0.04))' : 'rgba(0,0,0,0.15)',
                    boxShadow: done ? '0 0 16px rgba(52,211,153,0.18)' : 'none', transition: 'all .2s',
                  }}>
                    <span style={{ fontSize: 17, opacity: done ? 1 : 0.7 }}>{h.emoji}</span>
                    <span style={{ fontFamily: MONO, fontSize: 7.5, letterSpacing: 0.5, color: done ? MINT : DIM, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%' }}>{h.label}</span>
                    <span style={{ fontFamily: MONO, fontSize: 8.5, color: s ? GOLD : 'rgba(120,180,230,0.25)' }}>{s ? `🔥${s}` : '·'}</span>
                  </div>
                )
              })}
            </div>
          </Panel>

          {/* TAG CLOUD */}
          {tagCounts.length > 0 && (
            <Panel>
              <Head color="#bfe0ff" right={`${tagCounts.length}`}>TOPICS</Head>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {tagCounts.slice(0, 24).map(([t, c]) => (
                  <Chip key={t} active={tagFilter === t} onClick={() => setTagFilter(tagFilter === t ? null : t)} color="#bfe0ff">#{t} <span style={{ opacity: 0.5 }}>{c}</span></Chip>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>

      {/* ═══ STREAM ═══ */}
      {stream.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '0 4px' }}>
            <div style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, letterSpacing: 2.5, color: BLUE }}>STREAM</div>
            <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5, color: DIM }}>{stream.length}{stream.length !== notes.length ? ` / ${notes.length}` : ''} NOTES</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {stream.slice(0, 60).map(n => {
              const c = TYPE_COLORS[n.type] || BLUE
              const sel = n.id === selectedId
              return (
                <div key={n.id} onClick={() => select(n.id)} className="sb-card" style={{
                  position: 'relative', padding: '14px 15px 12px', borderRadius: 14, cursor: 'pointer', overflow: 'hidden',
                  background: `linear-gradient(160deg, ${c}14, rgba(6,16,38,0.5) 55%)`,
                  border: `1px solid ${sel ? c : c + '30'}`, boxShadow: sel ? `0 0 24px ${c}30` : 'none',
                  transition: 'transform .2s, border-color .2s, box-shadow .2s',
                }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 3, bottom: 0, background: c, boxShadow: `0 0 12px ${c}`, opacity: 0.8 }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 9, letterSpacing: 1.5, color: c }}>
                    <span>{TYPE_ICON[n.type]} {n.type.toUpperCase()}{n.pinned ? '  ★' : ''}</span>
                    <span style={{ color: DIM }}>{ago(n.created_at)}{n.related.length ? ` · ⟷${n.related.length}` : ''}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#eef6ff', marginTop: 7, lineHeight: 1.35 }}>{n.title}</div>
                  {n.summary && <div style={{ fontSize: 12, color: 'rgba(200,225,250,0.6)', marginTop: 5, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.summary}</div>}
                  {n.tags.length > 0 && <div style={{ fontFamily: MONO, fontSize: 9.5, color: 'rgba(190,225,255,0.55)', marginTop: 8 }}>{n.tags.map(t => '#' + t).join('  ')}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <style>{`
        @keyframes sbSpin { to { transform: rotate(360deg) } }
        .sb-row .sb-x { opacity: 0; transition: opacity .15s }
        .sb-row:hover .sb-x { opacity: 1 }
        .sb-card:hover { transform: translateY(-2px) }
        @media (hover: none) { .sb-row .sb-x { opacity: .6 } }
      `}</style>
    </ModuleLayout>
  )
}

// ─── pieces ───
function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      position: 'relative', borderRadius: 16, padding: 18, overflow: 'hidden',
      background: 'linear-gradient(180deg, rgba(10,24,54,0.55) 0%, rgba(6,16,38,0.42) 100%)',
      border: '1px solid rgba(80,180,255,0.12)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      boxShadow: '0 10px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(140,210,255,0.07)', ...style,
    }}>
      <div style={{ position: 'absolute', top: 0, left: '10%', right: '10%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(140,210,255,0.45), transparent)', pointerEvents: 'none' }} />
      {children}
    </div>
  )
}
function Head({ children, color, right }: { children: React.ReactNode; color: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 2.5, color, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />{children}
      </div>
      {right && <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5, color: DIM }}>{right}</div>}
    </div>
  )
}
function Chip({ children, active, onClick, color }: { children: React.ReactNode; active?: boolean; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: MONO, fontSize: 9.5, letterSpacing: 1, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap',
      color: active ? color : 'rgba(170,205,240,0.6)',
      background: active ? `${color}1f` : 'rgba(6,16,38,0.55)',
      border: `1px solid ${active ? color + '66' : 'rgba(80,180,255,0.15)'}`, backdropFilter: 'blur(8px)',
    }}>{children}</button>
  )
}
function Btn({ children, onClick, color }: { children: React.ReactNode; onClick: () => void; color?: string }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5, padding: '6px 11px', borderRadius: 8, cursor: 'pointer',
      color: color || 'rgba(190,220,250,0.8)', background: color ? `${color}14` : 'rgba(80,180,255,0.06)',
      border: `1px solid ${color ? color + '44' : 'rgba(80,180,255,0.2)'}`,
    }}>{children}</button>
  )
}
function X({ onClick }: { onClick: () => void }) {
  return <span onClick={onClick} style={{ cursor: 'pointer', fontSize: 15, color: DIM, lineHeight: 1 }}>×</span>
}
function Check({ done, onClick, color }: { done: boolean; onClick: () => void; color: string }) {
  return (
    <div onClick={onClick} style={{
      width: 16, height: 16, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
      border: `1.5px solid ${done ? color : 'rgba(128,192,255,0.35)'}`, background: done ? `${color}30` : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center', color, fontSize: 9,
    }}>{done ? '✓' : ''}</div>
  )
}
const field: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'rgba(6,16,38,0.6)', border: '1px solid rgba(80,180,255,0.16)', borderRadius: 9,
  padding: '9px 12px', color: '#d8eaff', fontSize: 12.5, outline: 'none', fontFamily: 'DM Sans, system-ui, sans-serif',
}
