'use client'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase'
import ModuleLayout from '@/components/ModuleLayout'
import type { User } from '@supabase/supabase-js'
import { useIsMobile } from '@/lib/useIsMobile'
import { useRole } from '@/lib/useRole'
import { TYPE_COLORS } from '@/components/secondbrain/KnowledgeGraph'
import NotePage, { checklistProgress, type PageNote } from '@/components/secondbrain/NotePage'

const KnowledgeGraph = dynamic(() => import('@/components/secondbrain/KnowledgeGraph'), { ssr: false })

interface Props { user: User; onBack: () => void }

type Status = 'inbox' | 'active' | 'reference' | 'done' | 'archived'
type Note = {
  id: string; type: string; title: string; body: string | null; url: string | null; summary: string | null
  tags: string[]; related: string[]; pinned: boolean; created_at: string
  status: Status; project: string | null; due: string | null; next_action: string | null; suggestion: string | null; seen_at: string | null
}
type Prio = { id: string; text: string; done: boolean; sort_order: number | null; created_at: string }
type Habit = { id: string; emoji: string; label: string; sort_order: number }
type DayRow = { day: string; nn_done: string[] | null }
type Briefing = { focus?: string; briefing?: string; flags?: string[] }
type Tab = 'flow' | 'map' | 'stream'

const MONO = 'Space Mono, monospace'
const BLUE = '#80c0ff', GOLD = '#fbbf24', MINT = '#34d399', RED = '#f87171'
const DIM = 'rgba(120,180,230,0.5)'
const TYPES = ['idea', 'note', 'link', 'task', 'goal', 'person', 'quote']
const TYPE_ICON: Record<string, string> = { idea: '✦', note: '▤', link: '↗', task: '◉', goal: '◎', person: '☺', quote: '❝' }
const SUGGEST_LABEL: Record<string, string> = { today: 'DO TODAY', project: 'TO PROJECT', reference: 'KEEP', drop: 'DROP' }
const PROJECT_HUES = ['#64c8ff', '#ffd73c', '#34d399', '#b47cff', '#ff9f43', '#ff6fae', '#7ef0e0', '#a3e635']

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'now'; if (m < 60) return `${m}m`; const h = Math.round(m / 60); if (h < 24) return `${h}h`
  const d = Math.round(h / 24); return d < 30 ? `${d}d` : new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
const projectColor = (p: string) => PROJECT_HUES[hash(p) % PROJECT_HUES.length]
const HUD: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(8,20,46,0.66), rgba(6,14,34,0.52))', padding: 15, borderRadius: 14,
  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', boxShadow: '0 8px 30px rgba(0,0,0,0.35)', flexShrink: 0,
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
  const recRef = useRef<any>(null)
  const today = dayKey(new Date())

  const [tab, setTab] = useState<Tab>('flow')
  const [heroH, setHeroH] = useState(760)
  useEffect(() => {
    const fit = () => setHeroH(Math.max(620, window.innerHeight - 230))
    fit(); window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  const [notes, setNotes] = useState<Note[]>([])
  const [loaded, setLoaded] = useState(false)
  const [mode, setMode] = useState<'capture' | 'ask'>('capture')
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [burstId, setBurstId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [openProject, setOpenProject] = useState<string | null>(null)
  const [answer, setAnswer] = useState<{ q: string; answer: string; cited: string[] } | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  // stream / map filters
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all')
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  // today
  const [prios, setPrios] = useState<Prio[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [days, setDays] = useState<Record<string, DayRow>>({})
  const [newPrio, setNewPrio] = useState('')
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [briefingBusy, setBriefingBusy] = useState(false)

  useEffect(() => { loadAll() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (isAdmin) loadBriefing(false) // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t) }, [toast])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus() }
      if (e.key === 'Escape' && !processing) { setSelectedId(null); setAnswer(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [processing])

  async function token() {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token
  }

  async function loadAll() {
    const since = dayKey(addDays(new Date(), -60))
    const [n, p, h, d] = await Promise.all([
      supabase.from('brain_notes').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(800),
      supabase.from('priorities').select('*').eq('user_id', user.id).order('sort_order', { ascending: true }).order('created_at'),
      supabase.from('non_negotiables').select('*').eq('user_id', user.id).order('sort_order'),
      supabase.from('brain_days').select('day,nn_done').eq('user_id', user.id).gte('day', since),
    ])
    setNotes(((n.data as Note[]) || []).map(x => ({ ...x, tags: x.tags || [], related: x.related || [], status: (x.status || 'active') as Status })))
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
        body: JSON.stringify({ day: today, localTime: new Date().toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' }), force }),
      })
      const j = await r.json(); if (j.briefing) setBriefing(j.briefing)
    } catch { /* noop */ } finally { setBriefingBusy(false) }
  }

  // ─── capture / ask ───
  const submit = useCallback(async (override?: string) => {
    const text = (override ?? input).trim(); if (!text || busy) return
    setBusy(true)
    try {
      const t = await token()
      const headers = { 'content-type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }
      if (mode === 'ask') {
        const j = await (await fetch('/api/brain/ask', { method: 'POST', headers, body: JSON.stringify({ question: text }) })).json()
        if (j.error) setToast(j.error.includes('not set') ? 'ANTHROPIC_API_KEY missing' : 'OREN could not answer')
        else { setAnswer({ q: text, answer: j.answer, cited: j.cited || [] }); setInput('') }
      } else {
        const j = await (await fetch('/api/brain/capture', { method: 'POST', headers, body: JSON.stringify({ text, today }) })).json()
        if (j.error) setToast(/column|brain_notes/.test(j.error) ? 'Run lib/sql/brain_v4.sql in Supabase first' : `Error: ${j.error}`)
        else if (j.note) {
          const note: Note = { ...j.note, tags: j.note.tags || [], related: j.note.related || [], status: j.note.status || 'inbox' }
          setNotes(prev => [note, ...prev.map(n => note.related.includes(n.id) ? { ...n, related: Array.from(new Set([...n.related, note.id])) } : n)])
          setBurstId(note.id); setInput('')
          setToast(`→ Inbox · ${note.type.toUpperCase()}${note.project ? ' · ' + note.project : ''}${note.due ? ' · due ' + fmtDue(note.due) : ''}${note.suggestion ? ' · OREN: ' + SUGGEST_LABEL[note.suggestion] : ''}`)
        }
      }
    } catch (e) { setToast(String(e)) } finally { setBusy(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, busy, mode, today])

  // ─── voice ───
  function toggleVoice() {
    if (listening) { recRef.current?.stop(); return }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { setToast('Voice capture needs Chrome or Safari'); return }
    const rec = new SR()
    rec.lang = 'de-DE'; rec.interimResults = true; rec.continuous = true
    let finalText = ''
    rec.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript + ' '; else interim += r[0].transcript
      }
      setInput((finalText + interim).trim())
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => { setListening(false); if (finalText.trim()) submit(finalText.trim()) }
    recRef.current = rec
    setMode('capture'); setListening(true); setInput('')
    rec.start()
  }

  // ─── note mutations ───
  async function patchNote(id: string, patch: Partial<Note>) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n))
    await supabase.from('brain_notes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  }
  async function deleteNote(id: string) {
    setNotes(prev => prev.filter(x => x.id !== id).map(x => ({ ...x, related: x.related.filter(r => r !== id) })))
    setSelectedId(null)
    await supabase.from('brain_notes').delete().eq('id', id)
  }
  async function sendToToday(n: Note) {
    const text = n.next_action || n.title
    const { data } = await supabase.from('priorities').insert({ user_id: user.id, text, done: false, sort_order: prios.filter(p => !p.done).length }).select().single()
    if (data) setPrios(prev => [...prev, data as Prio])
    await patchNote(n.id, { status: 'active' })
    setToast(`Added to today: ${text}`)
  }

  // ─── today mutations ───
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
  const live = useMemo(() => notes.filter(n => n.status !== 'archived'), [notes])
  const inbox = useMemo(() => notes.filter(n => n.status === 'inbox').sort((a, b) => a.created_at.localeCompare(b.created_at)), [notes])
  const projects = useMemo(() => {
    const m = new Map<string, Note[]>()
    live.forEach(n => { if (n.project && n.status !== 'inbox') m.set(n.project, [...(m.get(n.project) || []), n]) })
    return Array.from(m.entries()).map(([name, list]) => {
      const open = list.filter(n => (n.type === 'task' || n.type === 'goal') && n.status !== 'done')
      const last = list.reduce((a, n) => n.created_at > a ? n.created_at : a, '')
      const next = list.filter(n => n.next_action && n.status !== 'done').sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))[0]
      return { name, list, open: open.length, done: list.filter(n => n.status === 'done').length, last, next: next?.next_action || null }
    }).sort((a, b) => b.last.localeCompare(a.last))
  }, [live])
  const projectNames = projects.map(p => p.name)
  const loops = useMemo(() => live
    .filter(n => n.status !== 'done' && n.status !== 'inbox' && (n.due || n.type === 'task'))
    .sort((a, b) => (a.due || '9999-99-99').localeCompare(b.due || '9999-99-99'))
    .slice(0, 6), [live])
  const rediscover = useMemo(() => {
    const cutoff = addDays(new Date(), -4).toISOString()
    const pool = live.filter(n => (n.status === 'active' || n.status === 'reference') && n.created_at < cutoff && !['task'].includes(n.type) && !dismissed.has(n.id) && !(n.seen_at && n.seen_at.slice(0, 10) === today))
    return pool.sort((a, b) => hash(today + a.id) - hash(today + b.id)).slice(0, 3)
  }, [live, dismissed, today])
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>(); live.forEach(n => n.tags.forEach(t => m.set(t, (m.get(t) || 0) + 1)))
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
  }, [live])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return notes.filter(n =>
      (statusFilter === 'all' ? n.status !== 'archived' : n.status === statusFilter) &&
      (!typeFilter || n.type === typeFilter) && (!tagFilter || n.tags.includes(tagFilter)) &&
      (!projectFilter || n.project === projectFilter) &&
      (!q || `${n.title} ${n.summary || ''} ${n.body || ''} ${n.tags.join(' ')} ${n.project || ''}`.toLowerCase().includes(q)))
  }, [notes, statusFilter, typeFilter, tagFilter, projectFilter, search])
  const highlight = useMemo(() => {
    if (answer?.cited.length) return new Set(answer.cited)
    if (typeFilter || tagFilter || projectFilter || search.trim()) return new Set(filtered.map(n => n.id).concat(tagFilter ? ['tag:' + tagFilter] : []))
    return null
  }, [answer, typeFilter, tagFilter, projectFilter, search, filtered])
  const graphNotes = useMemo(() => live.map(n => ({ id: n.id, type: n.type, title: n.title, tags: n.tags, related: n.related, pinned: n.pinned })), [live])
  const selected = notes.find(n => n.id === selectedId) || null
  const openPrios = prios.filter(p => !p.done)
  const doneToday = habits.filter(h => todayDone.includes(h.id)).length

  return (
    <ModuleLayout onBack={onBack} icon="🧠" title="SECONDBRAIN" titleColor={BLUE} sub="Capture · Process · Recall" maxWidth={1600}
      iconBg="linear-gradient(135deg, rgba(60,120,200,0.4), rgba(100,180,255,0.2))">

      {/* ═══ CAPTURE BAR ═══ */}
      <div style={{ marginBottom: 14 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: isMobile ? '8px 8px 8px 10px' : '10px 10px 10px 14px', borderRadius: 16,
          background: 'linear-gradient(180deg, rgba(12,30,66,0.7), rgba(6,16,38,0.6))',
          border: `1px solid ${listening ? 'rgba(248,113,113,0.55)' : mode === 'ask' ? 'rgba(52,211,153,0.4)' : 'rgba(120,200,255,0.3)'}`,
          boxShadow: `0 0 40px ${listening ? 'rgba(248,113,113,0.18)' : mode === 'ask' ? 'rgba(52,211,153,0.12)' : 'rgba(80,170,255,0.14)'}, inset 0 1px 0 rgba(160,220,255,0.08)`,
          backdropFilter: 'blur(16px)', transition: 'border-color .25s, box-shadow .25s',
        }}>
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.25)', borderRadius: 10, padding: 3, flexShrink: 0 }}>
            {(['capture', 'ask'] as const).map(m => (
              <button key={m} disabled={m === 'ask' && !isAdmin} onClick={() => { setMode(m); inputRef.current?.focus() }} style={{
                fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, fontWeight: 700, padding: isMobile ? '7px 8px' : '7px 13px', borderRadius: 8, border: 'none',
                cursor: m === 'ask' && !isAdmin ? 'not-allowed' : 'pointer', opacity: m === 'ask' && !isAdmin ? 0.35 : 1,
                background: mode === m ? (m === 'ask' ? 'rgba(52,211,153,0.2)' : 'rgba(80,180,255,0.22)') : 'transparent',
                color: mode === m ? (m === 'ask' ? MINT : '#cfe8ff') : DIM,
              }}>{m === 'capture' ? (isMobile ? '✚' : '✚ CAPTURE') : (isMobile ? '◎' : '◎ ASK')}</button>
            ))}
          </div>
          <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder={listening ? 'Listening… speak your thought' : mode === 'capture' ? 'Dump anything — "call Mikha Friday about villa", a link, an idea…' : 'Ask your brain — "what did I plan for Edgar?"'}
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#eef6ff', fontSize: isMobile ? 14 : 16, fontFamily: 'DM Sans, system-ui, sans-serif', padding: '8px 4px' }} />
          {!isMobile && <span style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(120,180,230,0.35)', letterSpacing: 1 }}>⌘K</span>}
          <button onClick={toggleVoice} title="Voice capture" style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0, cursor: 'pointer', fontSize: 16, position: 'relative',
            background: listening ? 'rgba(248,113,113,0.22)' : 'rgba(80,180,255,0.1)',
            border: `1px solid ${listening ? 'rgba(248,113,113,0.6)' : 'rgba(120,200,255,0.3)'}`, color: listening ? RED : '#cfe8ff',
            animation: listening ? 'sbPulse 1.2s ease-in-out infinite' : undefined,
          }}>{listening ? '■' : '🎙'}</button>
          <button onClick={() => submit()} disabled={busy || !input.trim()} style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0, cursor: busy ? 'wait' : 'pointer', fontSize: 16,
            background: mode === 'ask' ? 'rgba(52,211,153,0.2)' : 'rgba(80,180,255,0.22)',
            border: `1px solid ${mode === 'ask' ? 'rgba(52,211,153,0.5)' : 'rgba(120,200,255,0.45)'}`, color: '#eef6ff',
          }}>{busy ? <span style={{ display: 'inline-block', animation: 'sbSpin 1s linear infinite' }}>◌</span> : '↵'}</button>
        </div>
        <div style={{ minHeight: 18, marginTop: 6, paddingLeft: 6, fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: toast ? MINT : 'rgba(120,180,230,0.35)' }}>
          {busy ? (mode === 'ask' ? 'OREN is searching your brain…' : 'OREN is filing…') : toast || 'everything lands in your inbox · OREN suggests where it goes · dates like "Friday" become due dates'}
        </div>
      </div>

      {answer && (
        <Panel style={{ marginBottom: 16, borderColor: 'rgba(52,211,153,0.3)' }}>
          <Head color={MINT} right={<X onClick={() => setAnswer(null)} />}>OREN ANSWERS · “{answer.q}”</Head>
          <div style={{ fontSize: 14, color: '#e3f0ff', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{answer.answer}</div>
          {answer.cited.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {answer.cited.map(id => { const n = notes.find(x => x.id === id); return n && (
                <Chip key={id} active onClick={() => setSelectedId(id)} color={TYPE_COLORS[n.type]}>{TYPE_ICON[n.type]} {n.title.slice(0, 32)}</Chip>
              ) })}
            </div>
          )}
        </Panel>
      )}

      {/* ═══ TABS ═══ */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, alignItems: 'center' }}>
        {([['flow', '◈ FLOW'], ['map', '✺ MAP'], ['stream', '≋ STREAM']] as [Tab, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            fontFamily: MONO, fontSize: 10.5, letterSpacing: 2, fontWeight: 700, padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
            background: tab === k ? 'rgba(80,180,255,0.16)' : 'transparent', color: tab === k ? '#dff0ff' : DIM,
            border: `1px solid ${tab === k ? 'rgba(120,200,255,0.4)' : 'rgba(80,180,255,0.1)'}`,
            boxShadow: tab === k ? '0 0 20px rgba(80,170,255,0.15)' : 'none',
          }}>{l}</button>
        ))}
        <div style={{ flex: 1 }} />
        {!isMobile && <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5, color: DIM }}>
          <b style={{ color: '#cfe8ff' }}>{live.length}</b> NOTES · <b style={{ color: '#cfe8ff' }}>{projects.length}</b> PROJECTS · <b style={{ color: inbox.length ? GOLD : '#cfe8ff' }}>{inbox.length}</b> INBOX
        </div>}
      </div>

      {/* ═══ FLOW · BRAIN HERO ═══ */}
      {tab === 'flow' && (
        <div style={{ position: 'relative', height: isMobile ? 'auto' : heroH, borderRadius: 22, overflow: 'hidden', border: '1px solid rgba(80,180,255,0.1)', background: 'radial-gradient(ellipse at center, rgba(16,44,96,0.32), rgba(2,8,20,0.15) 70%)', boxShadow: 'inset 0 0 80px rgba(0,0,0,0.4)' }}>
          <div style={{ position: isMobile ? 'relative' : 'absolute', inset: 0 }}>
            <KnowledgeGraph
              notes={graphNotes} selectedId={selectedId} highlight={highlight} burstId={burstId}
              height={isMobile ? 380 : heroH}
              onSelect={id => setSelectedId(id)}
              onTag={t => { setTagFilter(t); setTab('map') }}
            />
          </div>
          {!isMobile && (
            <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 14, alignItems: 'center', zIndex: 4, fontFamily: MONO, fontSize: 9.5, letterSpacing: 2, color: DIM, whiteSpace: 'nowrap' }}>
              <span><b style={{ color: '#cfe8ff' }}>{live.length}</b> NEURONS</span>
              <span><b style={{ color: '#cfe8ff' }}>{tagCounts.length}</b> TOPICS</span>
              <button onClick={() => setTab('map')} style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5, padding: '6px 12px', borderRadius: 9, cursor: 'pointer', color: '#cfe8ff', background: 'rgba(6,16,38,0.6)', border: '1px solid rgba(120,200,255,0.25)' }}>FULLSCREEN ↗</button>
            </div>
          )}
          {loaded && live.length === 0 && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: '58%', textAlign: 'center', pointerEvents: 'none', fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, color: DIM, zIndex: 3 }}>
              EVERY THOUGHT BECOMES A NEURON · CAPTURE ABOVE
            </div>
          )}

          {/* left HUD */}
          <div className="sb-hud" style={{ position: isMobile ? 'static' : 'absolute', top: 16, left: 16, bottom: 16, width: isMobile ? 'auto' : 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, zIndex: 5, padding: isMobile ? '14px 0 0' : 0 }}>
            <Panel style={{ ...HUD, borderColor: inbox.length ? 'rgba(251,191,36,0.28)' : undefined }}>
              <Head color={inbox.length ? GOLD : MINT} right={`${inbox.length}`}>INBOX</Head>
              {inbox.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4px 0 2px' }}>
                  <div style={{ fontSize: 20, filter: 'drop-shadow(0 0 12px rgba(52,211,153,0.6))' }}>✓</div>
                  <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: MINT, marginTop: 6 }}>INBOX ZERO</div>
                  <div style={{ fontSize: 12, color: DIM, marginTop: 4 }}>Mind like water. Capture the next thought above.</div>
                </div>
              ) : (
                <>
                  <button onClick={() => setProcessing(true)} style={{
                    width: '100%', padding: '13px 14px', borderRadius: 12, cursor: 'pointer', marginBottom: 12,
                    background: 'linear-gradient(90deg, rgba(251,191,36,0.2), rgba(251,191,36,0.06))', border: '1px solid rgba(251,191,36,0.45)',
                    color: '#fff3d0', fontFamily: MONO, fontSize: 11, letterSpacing: 2, fontWeight: 700, boxShadow: '0 0 24px rgba(251,191,36,0.12)',
                  }}>▶ PROCESS {inbox.length} {inbox.length === 1 ? 'ITEM' : 'ITEMS'} · ~{Math.max(1, Math.round(inbox.length * 0.25))} MIN</button>
                  {inbox.slice(0, 6).map(n => (
                    <Row key={n.id} onClick={() => setSelectedId(n.id)}>
                      <span style={{ color: TYPE_COLORS[n.type], width: 14, fontSize: 11 }}>{TYPE_ICON[n.type]}</span>
                      <span style={{ flex: 1, fontSize: 12.5, color: '#dcecff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</span>
                      {n.suggestion && <span style={{ fontFamily: MONO, fontSize: 8.5, color: DIM }}>{SUGGEST_LABEL[n.suggestion]}</span>}
                      <span style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(120,180,230,0.4)' }}>{ago(n.created_at)}</span>
                    </Row>
                  ))}
                  {inbox.length > 6 && <div style={{ fontFamily: MONO, fontSize: 9, color: DIM, paddingTop: 6 }}>+{inbox.length - 6} MORE</div>}
                </>
              )}
            </Panel>

            {loops.length > 0 && <Panel style={HUD}>
              <Head color={RED} right={`${loops.length}`}>OPEN LOOPS</Head>
              {loops.length === 0 && <Empty>No open commitments. Captures with a date or a task land here.</Empty>}
              {loops.map(n => {
                const d = dueState(n.due, today)
                return (
                  <div key={n.id} className="sb-row" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 0', borderTop: '1px solid rgba(80,180,255,0.05)' }}>
                    <Check done={false} color={d.color} onClick={() => patchNote(n.id, { status: 'done' })} />
                    <span onClick={() => setSelectedId(n.id)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                      <span style={{ display: 'block', fontSize: 12.5, color: '#e3f0ff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.next_action || n.title}</span>
                      {n.project && <span style={{ fontFamily: MONO, fontSize: 8.5, color: projectColor(n.project) }}>{n.project}</span>}
                    </span>
                    {n.due && <span style={{ fontFamily: MONO, fontSize: 9, color: d.color, padding: '2px 7px', borderRadius: 10, border: `1px solid ${d.color}44`, background: `${d.color}12`, whiteSpace: 'nowrap' }}>{d.label}</span>}
                  </div>
                )
              })}
            </Panel>}
            {(projects.length > 0 || openProject) && <Panel style={HUD}>
              {openProject ? (() => {
                const p = projects.find(x => x.name === openProject)
                const list = (p?.list || []).slice().sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || (a.due || '9999').localeCompare(b.due || '9999'))
                const c = projectColor(openProject)
                return (
                  <>
                    <Head color={c} right={<span onClick={() => setOpenProject(null)} style={{ cursor: 'pointer' }}>‹ ALL PROJECTS</span>}>{openProject.toUpperCase()}</Head>
                    {p?.next && <div style={{ padding: '10px 12px', borderRadius: 10, background: `${c}10`, border: `1px solid ${c}33`, marginBottom: 12 }}>
                      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: c }}>NEXT ACTION</div>
                      <div style={{ fontSize: 14, color: '#f0f7ff', marginTop: 4 }}>{p.next}</div>
                    </div>}
                    {list.map(n => (
                      <Row key={n.id} onClick={() => setSelectedId(n.id)}>
                        <span style={{ color: TYPE_COLORS[n.type], width: 14, fontSize: 11 }}>{TYPE_ICON[n.type]}</span>
                        <span style={{ flex: 1, fontSize: 12.5, color: n.status === 'done' ? 'rgba(120,180,230,0.4)' : '#dcecff', textDecoration: n.status === 'done' ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</span>
                        {n.due && <span style={{ fontFamily: MONO, fontSize: 9, color: dueState(n.due, today).color }}>{dueState(n.due, today).label}</span>}
                      </Row>
                    ))}
                    <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                      <Btn onClick={() => { setProjectFilter(openProject); setTab('map') }}>✺ SHOW ON MAP</Btn>
                      <Btn onClick={() => { setProjectFilter(openProject); setTab('stream') }}>≋ ALL NOTES</Btn>
                    </div>
                  </>
                )
              })() : (
                <>
                  <Head color={BLUE} right={`${projects.length}`}>PROJECTS</Head>
                  {projects.length === 0 && <Empty>OREN groups your captures into projects automatically — just start capturing.</Empty>}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                    {projects.slice(0, 8).map(p => {
                      const c = projectColor(p.name)
                      const total = p.open + p.done
                      return (
                        <div key={p.name} onClick={() => setOpenProject(p.name)} className="sb-card" style={{
                          position: 'relative', padding: '13px 14px', borderRadius: 13, cursor: 'pointer', overflow: 'hidden',
                          background: `linear-gradient(150deg, ${c}18, rgba(6,16,38,0.45) 60%)`, border: `1px solid ${c}33`, transition: 'transform .2s',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: '#f0f7ff' }}>{p.name}</span>
                            <span style={{ fontFamily: MONO, fontSize: 9, color: DIM }}>{ago(p.last)}</span>
                          </div>
                          <div style={{ fontSize: 11.5, color: 'rgba(200,225,250,0.65)', marginTop: 6, minHeight: 32, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {p.next ? <>→ {p.next}</> : <span style={{ color: DIM }}>no next action yet</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                            <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(80,180,255,0.1)', overflow: 'hidden' }}>
                              <div style={{ width: `${total ? (p.done / total) * 100 : 0}%`, height: '100%', background: c, boxShadow: `0 0 6px ${c}` }} />
                            </div>
                            <span style={{ fontFamily: MONO, fontSize: 9, color: c }}>{p.list.length} · {p.open} OPEN</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </Panel>}

            {rediscover.length > 0 && <Panel style={HUD}>
              <Head color="#b47cff" right="DAILY">REDISCOVER</Head>
              {rediscover.length === 0 && <Empty>Older ideas resurface here every day — so nothing you captured gets forgotten.</Empty>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                {rediscover.map(n => {
                  const c = TYPE_COLORS[n.type] || BLUE
                  const hide = () => setDismissed(prev => new Set(prev).add(n.id))
                  return (
                    <div key={n.id} style={{ padding: '12px 13px', borderRadius: 12, background: `linear-gradient(160deg, ${c}12, rgba(6,16,38,0.4))`, border: `1px solid ${c}2a`, display: 'flex', flexDirection: 'column' }}>
                      <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 1.5, color: c }}>{TYPE_ICON[n.type]} {n.type.toUpperCase()} · {ago(n.created_at)} AGO</div>
                      <div onClick={() => setSelectedId(n.id)} style={{ fontSize: 13, fontWeight: 600, color: '#eef6ff', marginTop: 6, lineHeight: 1.35, cursor: 'pointer', flex: 1 }}>{n.title}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
                        <MiniBtn color={GOLD} onClick={() => { sendToToday(n); hide() }}>TODAY</MiniBtn>
                        <MiniBtn color={MINT} onClick={() => { patchNote(n.id, { seen_at: new Date().toISOString() }); hide() }}>KEEP</MiniBtn>
                        <MiniBtn color={DIM} onClick={() => { patchNote(n.id, { status: 'archived' }); hide() }}>ARCHIVE</MiniBtn>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Panel>}
          </div>

          {/* right HUD */}
          <div className="sb-hud" style={{ position: isMobile ? 'static' : 'absolute', top: 16, right: 16, width: isMobile ? 'auto' : 340, maxHeight: isMobile ? undefined : heroH - 32, overflowY: 'auto', zIndex: 5, marginTop: isMobile ? 12 : 0 }}>
          <Panel style={HUD}>
            <Head color={BLUE} right={new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase()}>TODAY</Head>
            {isAdmin && (
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.16)', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: MINT }}>● OREN FOCUS</span>
                  <span onClick={() => !briefingBusy && loadBriefing(true)} style={{ fontFamily: MONO, fontSize: 10, color: DIM, cursor: 'pointer' }}>{briefingBusy ? '…' : '↻'}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#eef6ff', marginTop: 5, lineHeight: 1.35 }}>{briefing?.focus || (briefingBusy ? 'thinking…' : '—')}</div>
                {briefing?.briefing && <div style={{ fontSize: 12, color: 'rgba(200,225,250,0.7)', marginTop: 5, lineHeight: 1.5 }}>{briefing.briefing}</div>}
              </div>
            )}
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: GOLD, marginBottom: 6 }}>PRIORITIES · {prios.filter(p => p.done).length}/{prios.length}</div>
            {openPrios.slice(0, 6).map((p, i) => (
              <div key={p.id} className="sb-row" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0' }}>
                <span style={{ fontFamily: MONO, fontSize: 9.5, color: i < 3 ? GOLD : DIM, width: 16 }}>{String(i + 1).padStart(2, '0')}</span>
                <Check onClick={() => togglePrio(p)} done={false} color={i < 3 ? GOLD : BLUE} />
                <span style={{ flex: 1, fontSize: 13, color: i < 3 ? '#eef6ff' : 'rgba(200,225,250,0.7)', lineHeight: 1.35 }}>{p.text}</span>
                <span className="sb-x" onClick={() => deletePrio(p.id)} style={{ cursor: 'pointer', color: DIM, fontSize: 14 }}>×</span>
              </div>
            ))}
            {openPrios.length > 6 && <div style={{ fontFamily: MONO, fontSize: 9, color: DIM, padding: '2px 0 4px 25px' }}>+{openPrios.length - 6} MORE</div>}
            {prios.filter(p => p.done).slice(0, 3).map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 0 4px 25px' }}>
                <Check onClick={() => togglePrio(p)} done color={MINT} />
                <span style={{ flex: 1, fontSize: 12, color: 'rgba(120,180,230,0.4)', textDecoration: 'line-through' }}>{p.text}</span>
              </div>
            ))}
            <input value={newPrio} onChange={e => setNewPrio(e.target.value)} onKeyDown={e => e.key === 'Enter' && addPrio()} placeholder="Add priority…" style={{ ...field, padding: '7px 10px', marginTop: 8 }} />

            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: MINT, margin: '16px 0 8px' }}>NON-NEGOTIABLES · {doneToday}/{habits.length}</div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(Math.max(habits.length, 1), 5)}, 1fr)`, gap: 6 }}>
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
          </div>
        </div>
      )}

      {/* ═══ MAP ═══ */}
      {tab === 'map' && (
        <Panel style={{ padding: 0 }}>
          <KnowledgeGraph
            notes={graphNotes} selectedId={selectedId} highlight={highlight} burstId={burstId}
            height={isMobile ? 460 : 720}
            onSelect={id => setSelectedId(id)}
            onTag={t => setTagFilter(prev => prev === t ? null : t)}
          />
          <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', justifyContent: 'space-between', gap: 10, pointerEvents: 'none', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', pointerEvents: 'auto', maxWidth: isMobile ? '100%' : '72%' }}>
              <Chip active={!typeFilter} onClick={() => setTypeFilter(null)} color={BLUE}>ALL {live.length}</Chip>
              {TYPES.filter(t => live.some(n => n.type === t)).map(t => (
                <Chip key={t} active={typeFilter === t} onClick={() => setTypeFilter(typeFilter === t ? null : t)} color={TYPE_COLORS[t]}>{TYPE_ICON[t]} {t.toUpperCase()}</Chip>
              ))}
              {projectFilter && <Chip active onClick={() => setProjectFilter(null)} color={projectColor(projectFilter)}>▣ {projectFilter} ×</Chip>}
              {tagFilter && <Chip active onClick={() => setTagFilter(null)} color="#bfe0ff">#{tagFilter} ×</Chip>}
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="⌕ filter…" style={{ ...field, width: 170, pointerEvents: 'auto', background: 'rgba(6,16,38,0.65)' }} />
          </div>
          {loaded && live.length === 0 && (
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 50, textAlign: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: 18, color: '#e8f3ff' }}>Every note becomes a neuron</div>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, color: DIM, marginTop: 6 }}>CAPTURE A FEW THOUGHTS AND WATCH YOUR BRAIN GROW</div>
            </div>
          )}
        </Panel>
      )}

      {/* ═══ STREAM ═══ */}
      {tab === 'stream' && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            {(['all', 'inbox', 'active', 'reference', 'done', 'archived'] as const).map(s => (
              <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} color={BLUE}>{s.toUpperCase()}</Chip>
            ))}
            <span style={{ width: 1, height: 18, background: 'rgba(80,180,255,0.15)', margin: '0 4px' }} />
            {TYPES.filter(t => notes.some(n => n.type === t)).map(t => (
              <Chip key={t} active={typeFilter === t} onClick={() => setTypeFilter(typeFilter === t ? null : t)} color={TYPE_COLORS[t]}>{TYPE_ICON[t]} {t.toUpperCase()}</Chip>
            ))}
            {projectFilter && <Chip active onClick={() => setProjectFilter(null)} color={projectColor(projectFilter)}>▣ {projectFilter} ×</Chip>}
            {tagFilter && <Chip active onClick={() => setTagFilter(null)} color="#bfe0ff">#{tagFilter} ×</Chip>}
            <div style={{ flex: 1 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="⌕ search…" style={{ ...field, width: 200 }} />
          </div>
          {tagCounts.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {tagCounts.slice(0, 20).map(([t, c]) => <Chip key={t} active={tagFilter === t} onClick={() => setTagFilter(tagFilter === t ? null : t)} color="#bfe0ff">#{t} <span style={{ opacity: 0.5 }}>{c}</span></Chip>)}
            </div>
          )}
          {filtered.length === 0 && <Empty>Nothing here yet.</Empty>}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(270px, 1fr))', gap: 12 }}>
            {[...filtered].sort((a, b) => Number(b.pinned) - Number(a.pinned)).slice(0, 120).map(n => <NoteCard key={n.id} n={n} selected={n.id === selectedId} onClick={() => setSelectedId(n.id)} />)}
          </div>
        </>
      )}

      {/* ═══ NOTE PAGE ═══ */}
      {selected && (
        <NotePage
          n={selected as PageNote} notes={notes as PageNote[]} projectNames={projectNames} isAdmin={isAdmin} isMobile={isMobile}
          getToken={token}
          onClose={() => setSelectedId(null)} onPatch={p => patchNote(selected.id, p as Partial<Note>)} onDelete={() => deleteNote(selected.id)}
          onToday={() => sendToToday(selected)} onOpen={id => setSelectedId(id)}
          onTag={t => { setTagFilter(t); setTab('stream'); setSelectedId(null) }}
        />
      )}

      {/* ═══ PROCESS MODE ═══ */}
      {processing && (
        <ProcessInbox
          items={inbox} projectNames={projectNames}
          onClose={() => setProcessing(false)}
          onToday={n => sendToToday(n)}
          onProject={(n, project) => patchNote(n.id, { status: 'active', project: project || n.project })}
          onKeep={n => patchNote(n.id, { status: 'reference' })}
          onDrop={n => patchNote(n.id, { status: 'archived' })}
        />
      )}

      <style>{`
        @keyframes sbSpin { to { transform: rotate(360deg) } }
        @keyframes sbPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(248,113,113,0.5) } 50% { box-shadow: 0 0 0 8px rgba(248,113,113,0) } }
        @keyframes sbSlide { from { transform: translateX(30px); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes sbCardIn { from { transform: translateY(18px) scale(.97); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes sbFade { from { opacity: 0 } to { opacity: 1 } }
        .sb-row .sb-x { opacity: 0; transition: opacity .15s }
        .sb-row:hover .sb-x { opacity: 1 }
        .sb-card:hover { transform: translateY(-2px) }
        .sb-hover:hover { background: rgba(80,180,255,0.06) }
        .sb-hud { scrollbar-width: none }
        .sb-hud::-webkit-scrollbar { display: none }
        @media (hover: none) { .sb-row .sb-x { opacity: .6 } }
      `}</style>
    </ModuleLayout>
  )
}

// ─── helpers ───
function fmtDue(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
}
function dueState(due: string | null, today: string): { label: string; color: string } {
  if (!due) return { label: 'TASK', color: BLUE }
  const diff = Math.round((new Date(due + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86400000)
  if (diff < 0) return { label: `${-diff}D LATE`, color: RED }
  if (diff === 0) return { label: 'TODAY', color: GOLD }
  if (diff === 1) return { label: 'TOMORROW', color: GOLD }
  if (diff < 7) return { label: new Date(due + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase(), color: BLUE }
  return { label: new Date(due + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase(), color: DIM }
}

// ─── process inbox (focus mode) ───
function ProcessInbox({ items, projectNames, onClose, onToday, onProject, onKeep, onDrop }: {
  items: Note[]; projectNames: string[]; onClose: () => void
  onToday: (n: Note) => void; onProject: (n: Note, p: string) => void; onKeep: (n: Note) => void; onDrop: (n: Note) => void
}) {
  const [queue] = useState(() => items.slice())
  const [i, setI] = useState(0)
  const [project, setProject] = useState('')
  const [done, setDone] = useState(0)
  const n = queue[i]
  useEffect(() => { setProject(n?.project || '') }, [n])

  const act = useCallback((k: 'today' | 'project' | 'keep' | 'drop' | 'skip') => {
    if (!n) return
    if (k === 'today') onToday(n)
    if (k === 'project') onProject(n, project.trim())
    if (k === 'keep') onKeep(n)
    if (k === 'drop') onDrop(n)
    if (k !== 'skip') setDone(d => d + 1)
    setI(x => x + 1)
  }, [n, project, onToday, onProject, onKeep, onDrop])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') { if (e.key === 'Enter') act('project'); return }
      if (e.key === 'Escape') onClose()
      if (e.key === '1') act('today'); if (e.key === '2') act('project'); if (e.key === '3') act('keep'); if (e.key === '4') act('drop')
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 's') act('skip')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [act, onClose])

  const c = n ? TYPE_COLORS[n.type] || BLUE : MINT
  const actions: { k: 'today' | 'project' | 'keep' | 'drop'; key: string; label: string; sub: string; color: string }[] = [
    { k: 'today', key: '1', label: 'DO TODAY', sub: '→ priorities', color: GOLD },
    { k: 'project', key: '2', label: 'PROJECT', sub: project || 'file it', color: BLUE },
    { k: 'keep', key: '3', label: 'KEEP', sub: 'reference', color: MINT },
    { k: 'drop', key: '4', label: 'DROP', sub: 'archive', color: RED },
  ]
  const suggestedKey = n?.suggestion === 'reference' ? 'keep' : n?.suggestion

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'radial-gradient(ellipse at center, rgba(4,14,34,0.88), rgba(0,0,0,0.94))', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, animation: 'sbFade .2s' }}>
      <div style={{ position: 'absolute', top: 20, left: 24, right: 24, display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: GOLD }}>PROCESS INBOX</span>
        <div style={{ flex: 1, height: 3, borderRadius: 2, background: 'rgba(80,180,255,0.1)', overflow: 'hidden' }}>
          <div style={{ width: `${(Math.min(i, queue.length) / Math.max(queue.length, 1)) * 100}%`, height: '100%', background: GOLD, boxShadow: `0 0 8px ${GOLD}`, transition: 'width .3s' }} />
        </div>
        <span style={{ fontFamily: MONO, fontSize: 10, color: DIM }}>{Math.min(i + 1, queue.length)}/{queue.length}</span>
        <span onClick={onClose} style={{ cursor: 'pointer', color: DIM, fontSize: 20 }}>×</span>
      </div>

      {n ? (
        <div key={n.id} style={{ width: '100%', maxWidth: 600, animation: 'sbCardIn .3s ease' }}>
          <div style={{
            padding: '24px 26px', borderRadius: 20, position: 'relative', overflow: 'hidden',
            background: `linear-gradient(160deg, ${c}1c, rgba(8,20,46,0.92) 50%)`, border: `1px solid ${c}55`,
            boxShadow: `0 30px 80px rgba(0,0,0,0.5), 0 0 60px ${c}22`,
          }}>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: c }}>{TYPE_ICON[n.type]} {n.type.toUpperCase()} · {ago(n.created_at)} AGO{n.due ? ` · DUE ${fmtDue(n.due).toUpperCase()}` : ''}</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#f4f9ff', marginTop: 10, lineHeight: 1.25 }}>{n.title}</div>
            {n.summary && <div style={{ fontSize: 14, color: 'rgba(205,228,250,0.78)', marginTop: 10, lineHeight: 1.55 }}>{n.summary}</div>}
            {n.body && n.body !== n.title && <div style={{ fontSize: 12.5, color: 'rgba(200,225,250,0.5)', marginTop: 10, lineHeight: 1.5, maxHeight: 90, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{n.body}</div>}
            {n.next_action && <div style={{ marginTop: 14, fontSize: 13, color: '#fff3d0' }}><span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: GOLD, marginRight: 8 }}>NEXT</span>{n.next_action}</div>}
            {n.tags.length > 0 && <div style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(190,225,255,0.55)', marginTop: 12 }}>{n.tags.map(t => '#' + t).join('  ')}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: DIM }}>PROJECT</span>
              <input list="sb-projects" value={project} onChange={e => setProject(e.target.value)} placeholder="none" style={{ ...field, flex: 1, padding: '6px 10px' }} />
              <datalist id="sb-projects">{projectNames.map(p => <option key={p} value={p} />)}</datalist>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 14 }}>
            {actions.map(a => {
              const sug = suggestedKey === a.k
              return (
                <button key={a.k} onClick={() => act(a.k)} style={{
                  padding: '12px 6px', borderRadius: 14, cursor: 'pointer', position: 'relative',
                  background: sug ? `${a.color}26` : 'rgba(8,20,46,0.7)', border: `1px solid ${sug ? a.color : a.color + '40'}`,
                  boxShadow: sug ? `0 0 26px ${a.color}33` : 'none', color: '#eef6ff',
                }}>
                  {sug && <span style={{ position: 'absolute', top: -9, left: '50%', transform: 'translateX(-50%)', fontFamily: MONO, fontSize: 8, letterSpacing: 1.5, color: '#04101f', background: a.color, padding: '1px 7px', borderRadius: 8, whiteSpace: 'nowrap' }}>OREN</span>}
                  <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: 1.5, fontWeight: 700, color: a.color }}>{a.label}</div>
                  <div style={{ fontSize: 10.5, color: DIM, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.sub}</div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(120,180,230,0.35)', marginTop: 4 }}>{a.key}</div>
                </button>
              )
            })}
          </div>
          <div style={{ textAlign: 'center', marginTop: 12, fontFamily: MONO, fontSize: 9, letterSpacing: 1.5, color: 'rgba(120,180,230,0.35)' }}>
            KEYS 1–4 · → SKIP · ESC CLOSE
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', animation: 'sbCardIn .4s ease' }}>
          <div style={{ fontSize: 64, filter: 'drop-shadow(0 0 30px rgba(52,211,153,0.8))' }}>✓</div>
          <div style={{ fontFamily: MONO, fontSize: 14, letterSpacing: 4, color: MINT, marginTop: 10 }}>INBOX ZERO</div>
          <div style={{ fontSize: 14, color: 'rgba(200,225,250,0.7)', marginTop: 8 }}>{done} items processed. Your head is clear.</div>
          <button onClick={onClose} style={{ marginTop: 22, padding: '10px 26px', borderRadius: 12, cursor: 'pointer', background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.5)', color: MINT, fontFamily: MONO, fontSize: 11, letterSpacing: 2 }}>BACK TO FLOW</button>
        </div>
      )}
    </div>
  )
}

function NoteCard({ n, selected, onClick }: { n: Note; selected: boolean; onClick: () => void }) {
  const c = TYPE_COLORS[n.type] || BLUE
  return (
    <div onClick={onClick} className="sb-card" style={{
      position: 'relative', padding: '14px 15px 12px', borderRadius: 14, cursor: 'pointer', overflow: 'hidden',
      background: `linear-gradient(160deg, ${c}14, rgba(6,16,38,0.5) 55%)`, opacity: n.status === 'archived' || n.status === 'done' ? 0.6 : 1,
      border: `1px solid ${selected ? c : c + '30'}`, boxShadow: selected ? `0 0 24px ${c}30` : 'none', transition: 'transform .2s',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, width: 3, bottom: 0, background: c, boxShadow: `0 0 12px ${c}`, opacity: 0.8 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 9, letterSpacing: 1.5, color: c }}>
        <span>{TYPE_ICON[n.type]} {n.type.toUpperCase()}{n.pinned ? '  ★' : ''}{n.status === 'inbox' ? '  · INBOX' : ''}</span>
        <span style={{ color: DIM }}>{ago(n.created_at)}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#eef6ff', marginTop: 7, lineHeight: 1.35, textDecoration: n.status === 'done' ? 'line-through' : 'none' }}>{n.title}</div>
      {(() => {
        const snippet = (n.body || '').split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#') && !/^- \[( |x|X)\] ?$/.test(l) && l !== n.title)
        const text = snippet ? snippet.replace(/^[-*>] (\[( |x|X)\] )?/, '') : n.summary
        return text ? <div style={{ fontSize: 12, color: 'rgba(200,225,250,0.6)', marginTop: 5, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{text}</div> : null
      })()}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, fontFamily: MONO, fontSize: 9.5, flexWrap: 'wrap' }}>
        {(() => { const pr = checklistProgress(n.body); return pr.total ? <span style={{ color: pr.done === pr.total ? MINT : GOLD }}>☑ {pr.done}/{pr.total}</span> : null })()}
        {n.project && <span style={{ color: projectColor(n.project) }}>▣ {n.project}</span>}
        {n.tags.length > 0 && <span style={{ color: 'rgba(190,225,255,0.5)' }}>{n.tags.map(t => '#' + t).join(' ')}</span>}
      </div>
    </div>
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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 10 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: 2.5, color, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}`, flexShrink: 0 }} />{children}
      </div>
      {right && <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5, color: DIM, flexShrink: 0 }}>{right}</div>}
    </div>
  )
}
function Row({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return <div onClick={onClick} className="sb-hover" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 6px', margin: '0 -6px', borderRadius: 8, cursor: onClick ? 'pointer' : 'default', borderTop: '1px solid rgba(80,180,255,0.05)' }}>{children}</div>
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ color: 'rgba(120,180,230,0.45)', fontSize: 12.5, padding: '4px 0 8px', lineHeight: 1.5 }}>{children}</div>
}
function Chip({ children, active, onClick, color }: { children: React.ReactNode; active?: boolean; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: MONO, fontSize: 9.5, letterSpacing: 1, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap',
      color: active ? color : 'rgba(170,205,240,0.6)', background: active ? `${color}1f` : 'rgba(6,16,38,0.55)',
      border: `1px solid ${active ? color + '66' : 'rgba(80,180,255,0.15)'}`, backdropFilter: 'blur(8px)',
    }}>{children}</button>
  )
}
function Btn({ children, onClick, color }: { children: React.ReactNode; onClick: () => void; color?: string }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5, padding: '7px 11px', borderRadius: 9, cursor: 'pointer',
      color: color || 'rgba(190,220,250,0.8)', background: color ? `${color}14` : 'rgba(80,180,255,0.06)',
      border: `1px solid ${color ? color + '44' : 'rgba(80,180,255,0.2)'}`,
    }}>{children}</button>
  )
}
function MiniBtn({ children, onClick, color }: { children: React.ReactNode; onClick: () => void; color: string }) {
  return <button onClick={onClick} style={{ flex: 1, fontFamily: MONO, fontSize: 8.5, letterSpacing: 1, padding: '5px 2px', borderRadius: 7, cursor: 'pointer', color, background: 'rgba(0,0,0,0.2)', border: `1px solid ${color}40` }}>{children}</button>
}
function X({ onClick }: { onClick: () => void }) {
  return <span onClick={onClick} style={{ cursor: 'pointer', fontSize: 16, color: DIM, lineHeight: 1 }}>×</span>
}
function Check({ done, onClick, color }: { done: boolean; onClick: () => void; color: string }) {
  return (
    <div onClick={onClick} style={{
      width: 16, height: 16, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
      border: `1.5px solid ${done ? color : color + '88'}`, background: done ? `${color}30` : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center', color, fontSize: 9,
    }}>{done ? '✓' : ''}</div>
  )
}
const field: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'rgba(6,16,38,0.6)', border: '1px solid rgba(80,180,255,0.16)', borderRadius: 9,
  padding: '9px 12px', color: '#d8eaff', fontSize: 12.5, outline: 'none', fontFamily: 'DM Sans, system-ui, sans-serif',
}
