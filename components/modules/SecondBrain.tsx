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
import ProcessInbox from '@/components/secondbrain/ProcessInbox'
import TopicsBoard, { type TopicView } from '@/components/secondbrain/TopicsBoard'

const KnowledgeGraph = dynamic(() => import('@/components/secondbrain/KnowledgeGraph'), { ssr: false })
const OrenCoreGL = dynamic(() => import('@/components/OrenCoreGL'), { ssr: false })

/**
 * SECONDBRAIN v5 · MIND
 * Talk to your second brain. OREN files, answers or thinks along — and the
 * neural map reacts live. Today strip on top, library + note pages one click away.
 */

interface Props { user: User; onBack: () => void }

type Status = 'inbox' | 'active' | 'reference' | 'done' | 'archived'
type Note = {
  id: string; type: string; title: string; body: string | null; url: string | null; summary: string | null
  tags: string[]; related: string[]; pinned: boolean; created_at: string
  status: Status; project: string | null; due: string | null; next_action: string | null; suggestion: string | null; seen_at: string | null; board_day?: string | null
}
type Msg = { id: string; role: 'me' | 'oren'; content: string; intent?: string | null; note_id?: string | null; cited?: string[] | null; created_at: string; pending?: boolean }
type Prio = { id: string; text: string; done: boolean; sort_order: number | null; created_at: string }
type Habit = { id: string; emoji: string; label: string; sort_order: number }
type Plan = { reply: string; focus: string[]; tasks: { topic: string; text: string }[]; at?: string }
type DayRow = { day: string; nn_done: string[] | null; focus_topics?: string[] | null; plan?: Plan | null }
type TopicRow = { id: string; name: string; priority: number; status: string }
type Briefing = { focus?: string; briefing?: string }

const MONO = 'Space Mono, monospace'
const BLUE = '#80c0ff', GOLD = '#fbbf24', MINT = '#34d399'
const DIM = 'rgba(120,180,230,0.5)'
const TYPES = ['idea', 'note', 'link', 'task', 'goal', 'person', 'quote']
const TYPE_ICON: Record<string, string> = { idea: '✦', note: '▤', link: '↗', task: '◉', goal: '◎', person: '☺', quote: '❝' }
const INTENT: Record<string, { label: string; color: string }> = {
  plan: { label: 'DAY PLAN', color: GOLD }, capture: { label: 'FILED', color: GOLD }, ask: { label: 'FROM YOUR BRAIN', color: MINT }, reflect: { label: 'THINKING WITH YOU', color: '#b47cff' },
}
const DEFAULT_NN = [
  { emoji: '💪', label: 'SPORT' }, { emoji: '🧘', label: 'MEDITATION' }, { emoji: '📧', label: 'MAILS' },
  { emoji: '🤖', label: 'AI DEV' }, { emoji: '⚡', label: 'OREN' },
]
const PROMPTS = [
  'Was beschäftigt dich gerade?',
  'Idee: …',
  'Was hatte ich für Edgar geplant?',
  'Ich hänge bei … fest',
]

const HUES = ['#64c8ff', '#ffd73c', '#34d399', '#b47cff', '#ff9f43', '#ff6fae', '#7ef0e0', '#a3e635']
const hash = (x: string) => { let h = 2166136261; for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
const topicColor = (n: string) => HUES[hash(n.toLowerCase()) % HUES.length]
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'now'; if (m < 60) return `${m}m`; const h = Math.round(m / 60); if (h < 24) return `${h}h`
  const d = Math.round(h / 24); return d < 30 ? `${d}d` : new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export default function SecondBrain({ user, onBack }: Props) {
  const isMobile = useIsMobile()
  const { role, name } = useRole()
  const isAdmin = role === 'admin'
  const supabase = useMemo(() => createClient(), [])
  const today = dayKey(new Date())
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const streamRef = useRef<HTMLDivElement>(null)
  const recRef = useRef<any>(null)

  const [notes, setNotes] = useState<Note[]>([])
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [loaded, setLoaded] = useState(false)
  const [mindReady, setMindReady] = useState(true)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [burstId, setBurstId] = useState<string | null>(null)
  const [glow, setGlow] = useState<Set<string> | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [library, setLibrary] = useState(false)
  const [heroH, setHeroH] = useState(720)

  const [prios, setPrios] = useState<Prio[]>([])
  const [habits, setHabits] = useState<Habit[]>([])
  const [days, setDays] = useState<Record<string, DayRow>>({})
  const [briefing, setBriefing] = useState<Briefing | null>(null)
  const [topicRows, setTopicRows] = useState<TopicRow[]>([])
  const [planning, setPlanning] = useState(false)
  const [brainOpen, setBrainOpen] = useState(false)
  const [winH, setWinH] = useState(900)

  useEffect(() => {
    const fit = () => { setHeroH(Math.max(520, window.innerHeight - 400)); setWinH(window.innerHeight) }
    fit(); window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])
  useEffect(() => { loadAll() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (isAdmin) loadBriefing() // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])
  useEffect(() => { streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: 'smooth' }) }, [msgs.length, busy])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inputRef.current?.focus() }
      if (e.key === 'Escape') setBrainOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function token() {
    const { data } = await supabase.auth.getSession()
    return data?.session?.access_token
  }

  async function loadAll() {
    const since = dayKey(addDays(new Date(), -60))
    const t = await token()
    const [n, p, h, d, m, tp] = await Promise.all([
      supabase.from('brain_notes').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(800),
      supabase.from('priorities').select('*').eq('user_id', user.id).order('sort_order', { ascending: true }).order('created_at'),
      supabase.from('non_negotiables').select('*').eq('user_id', user.id).order('sort_order'),
      supabase.from('brain_days').select('*').eq('user_id', user.id).gte('day', since),
      fetch('/api/brain/mind', { headers: t ? { Authorization: `Bearer ${t}` } : {} }).then(r => r.json()).catch(() => ({ messages: [] })),
      supabase.from('brain_topics').select('*').eq('user_id', user.id),
    ])
    setTopicRows((tp.data as TopicRow[]) || [])
    setNotes(((n.data as Note[]) || []).map(x => ({ ...x, tags: x.tags || [], related: x.related || [], status: (x.status || 'active') as Status })))
    setPrios((p.data as Prio[]) || [])
    if (!h.data?.length) {
      const { data } = await supabase.from('non_negotiables').insert(DEFAULT_NN.map((x, i) => ({ ...x, done: false, sort_order: i, user_id: user.id }))).select()
      setHabits((data as Habit[]) || [])
    } else setHabits(h.data as Habit[])
    const map: Record<string, DayRow> = {}; for (const r of (d.data as DayRow[]) || []) map[r.day] = r
    setDays(map)
    setMsgs((m.messages as Msg[]) || [])
    if (m.error && /brain_mind/.test(m.error)) setMindReady(false)
    setLoaded(true)
  }

  async function loadBriefing() {
    try {
      const t = await token()
      const r = await fetch('/api/brain/briefing', {
        method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ day: today, localTime: new Date().toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' }), force: false }),
      })
      const j = await r.json(); if (j.briefing) setBriefing(j.briefing)
    } catch { /* noop */ }
  }

  // ─── talk ───
  const send = useCallback(async (override?: string) => {
    const text = (override ?? input).trim(); if (!text || busy) return
    const tmp: Msg = { id: 'tmp-' + Date.now(), role: 'me', content: text, created_at: new Date().toISOString(), pending: true }
    setMsgs(prev => [...prev, tmp]); setInput(''); setBusy(true)
    try {
      const t = await token()
      const j = await (await fetch('/api/brain/mind', {
        method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ text, today }),
      })).json()
      if (j.error) {
        setMsgs(prev => [...prev.filter(x => x.id !== tmp.id), { ...tmp, pending: false }, { id: 'err-' + Date.now(), role: 'oren', content: /brain_mind/.test(j.error) ? 'Mir fehlt noch meine Gesprächs-Tabelle — bitte lib/sql/brain_mind.sql in Supabase ausführen.' : `Da ging was schief: ${j.error}`, created_at: new Date().toISOString() }])
        return
      }
      setMsgs(prev => [...prev.filter(x => x.id !== tmp.id), j.me, j.oren].filter(Boolean))
      if (j.note) {
        const note: Note = { ...j.note, tags: j.note.tags || [], related: j.note.related || [], status: j.note.status || 'inbox' }
        setNotes(prev => [note, ...prev.map(n => note.related.includes(n.id) ? { ...n, related: Array.from(new Set([...n.related, note.id])) } : n)])
        setBurstId(note.id)
      }
      const cited: string[] = j.oren?.cited || []
      if (cited.length || j.note) { setGlow(new Set([...cited, ...(j.note ? [j.note.id] : [])])); setTimeout(() => setGlow(null), 9000) }
    } catch (e) {
      setMsgs(prev => [...prev.filter(x => x.id !== tmp.id), { ...tmp, pending: false }])
    } finally { setBusy(false); inputRef.current?.focus() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, busy, today])

  function toggleVoice() {
    if (listening) { recRef.current?.stop(); return }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const rec = new SR()
    rec.lang = 'de-DE'; rec.interimResults = true; rec.continuous = true
    let finalText = ''
    rec.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]; if (r.isFinal) finalText += r[0].transcript + ' '; else interim += r[0].transcript
      }
      setInput((finalText + interim).trim())
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => { setListening(false); if (finalText.trim()) send(finalText.trim()) }
    recRef.current = rec; setListening(true); setInput(''); rec.start()
  }

  // ─── note / today mutations ───
  async function patchNote(id: string, patch: Partial<Note>) {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n))
    await supabase.from('brain_notes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  }
  async function deleteNote(id: string) {
    setNotes(prev => prev.filter(x => x.id !== id).map(x => ({ ...x, related: x.related.filter(r => r !== id) })))
    setSelectedId(null)
    await supabase.from('brain_notes').delete().eq('id', id)
  }
  async function sendToToday(n: { id: string; title: string; next_action: string | null }) {
    const text = n.next_action || n.title
    const { data } = await supabase.from('priorities').insert({ user_id: user.id, text, done: false, sort_order: prios.filter(p => !p.done).length }).select().single()
    if (data) setPrios(prev => [...prev, data as Prio])
    await patchNote(n.id, { status: 'active' })
  }
  const todayDone = days[today]?.nn_done || []
  async function toggleHabit(id: string) {
    const next = todayDone.includes(id) ? todayDone.filter(x => x !== id) : [...todayDone, id]
    setDays(prev => ({ ...prev, [today]: { day: today, nn_done: next } }))
    await supabase.from('brain_days').upsert({ user_id: user.id, day: today, nn_done: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id,day' })
  }
  async function togglePrio(p: Prio) {
    setPrios(prev => prev.map(x => x.id === p.id ? { ...x, done: !p.done } : x))
    await supabase.from('priorities').update({ done: !p.done }).eq('id', p.id)
  }

  // ─── topics ───
  async function upsertTopic(name: string, patch: Partial<TopicRow>) {
    const ex = topicRows.find(t => t.name === name)
    const row = { name, priority: ex?.priority ?? 2, status: ex?.status ?? 'active', ...patch }
    setTopicRows(prev => ex ? prev.map(t => t.name === name ? { ...t, ...row } : t) : [...prev, { id: 'tmp-' + name, ...row } as TopicRow])
    await supabase.from('brain_topics').upsert({ user_id: user.id, ...row }, { onConflict: 'user_id,name' })
  }
  const cyclePrio = (name: string) => { const cur = topicRows.find(t => t.name === name)?.priority ?? 2; upsertTopic(name, { priority: cur === 1 ? 3 : cur === 2 ? 1 : 2 }) }
  const togglePause = (name: string) => { const cur = topicRows.find(t => t.name === name)?.status ?? 'active'; upsertTopic(name, { status: cur === 'paused' ? 'active' : 'paused' }) }
  const focusList: string[] = days[today]?.focus_topics || []
  async function setFocus(next: string[]) {
    setDays(prev => ({ ...prev, [today]: { ...(prev[today] || { day: today, nn_done: [] }), focus_topics: next } }))
    await supabase.from('brain_days').upsert({ user_id: user.id, day: today, focus_topics: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id,day' })
  }
  const toggleFocus = (name: string) => setFocus(focusList.includes(name) ? focusList.filter(x => x !== name) : [...focusList, name])

  function boardTemplate(topic: string, plan: Plan | null | undefined) {
    const planned = (plan?.tasks || []).filter(t => t.topic === topic).map(t => t.text)
    const open = notes.filter(n => n.project === topic && (n.type === 'task' || n.type === 'goal') && n.status !== 'done' && n.status !== 'archived').map(n => n.next_action || n.title)
    const tasks = Array.from(new Set([...planned, ...open])).slice(0, 7)
    return `## Focus\n${planned.length ? 'Plan von OREN für heute.' : ''}\n\n## Today\n${(tasks.length ? tasks : ['']).map(t => `- [ ] ${t}`).join('\n')}\n\n## Notes\n\n## Outcome\n`
  }
  async function ensureBoard(topic: string, plan?: Plan | null): Promise<string | null> {
    const ex = notes.find(n => n.project === topic && n.board_day === today && n.status !== 'archived')
    if (ex) return ex.id
    const title = `${topic} · ${new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })}`
    const { data } = await supabase.from('brain_notes').insert({
      user_id: user.id, type: 'note', title, body: boardTemplate(topic, plan ?? days[today]?.plan), project: topic, tags: ['daily'], status: 'active', board_day: today, related: [],
    }).select().single()
    if (!data) return null
    const note = { ...(data as Note), tags: (data as Note).tags || [], related: (data as Note).related || [] }
    setNotes(prev => [note, ...prev])
    return note.id
  }
  async function openBoard(topic: string) { const id = await ensureBoard(topic); if (id) setSelectedId(id) }

  async function planDay() {
    if (planning) return
    setPlanning(true); setBusy(true)
    try {
      const t = await token()
      const context = {
        topics: topicViews.filter(v => v.status !== 'paused').slice(0, 15).map(v => ({
          name: v.name, priority: `P${v.priority}`, heat: v.heat, overdue: v.overdue, dueToday: v.dueToday, next: v.next,
          open: v.open.slice(0, 6).map(o => ({ task: o.next_action || o.title, due: o.due })),
        })),
        priorities: prios.filter(p => !p.done).map(p => p.text),
      }
      const j = await (await fetch('/api/brain/mind', {
        method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ mode: 'plan', today, context }),
      })).json()
      if (j.error) { setMsgs(prev => [...prev, { id: 'err-' + Date.now(), role: 'oren', content: /brain_days|focus_topics|plan/.test(j.error) ? 'Für die Tagesplanung fehlen noch Spalten — bitte lib/sql/brain_v6.sql in Supabase ausführen.' : `Planung fehlgeschlagen: ${j.error}`, created_at: new Date().toISOString() }]); return }
      setMsgs(prev => [...prev, j.me, j.oren].filter(Boolean))
      if (j.plan) {
        const plan = j.plan as Plan
        setDays(prev => ({ ...prev, [today]: { ...(prev[today] || { day: today, nn_done: [] }), focus_topics: plan.focus, plan } }))
        for (const topic of plan.focus) await ensureBoard(topic, plan)
      }
    } finally { setPlanning(false); setBusy(false) }
  }

  // ─── derived ───
  const live = useMemo(() => notes.filter(n => n.status !== 'archived'), [notes])
  const topicViews: TopicView[] = useMemo(() => {
    const names = Array.from(new Set([...topicRows.map(t => t.name), ...(live.map(n => n.project).filter(Boolean) as string[])]))
    const soon = dayKey(addDays(new Date(), 3)), cutoff = new Date(Date.now() - 48 * 3600000).toISOString()
    const todayText = msgs.filter(m => m.role === 'me' && m.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10)).map(m => m.content.toLowerCase()).join(' ')
    const views = names.map(name => {
      const row = topicRows.find(t => t.name === name)
      const items = live.filter(n => n.project === name && !n.board_day)
      const open = items.filter(n => (n.type === 'task' || n.type === 'goal') && n.status !== 'done').sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))
      const overdue = open.filter(n => n.due && n.due < today).length
      const dueToday = open.filter(n => n.due === today).length
      const dueSoon = open.filter(n => n.due && n.due <= soon).length
      const recent = items.filter(n => n.created_at > cutoff).length
      const mentions = todayText ? todayText.split(name.toLowerCase()).length - 1 : 0
      const priority = row?.priority ?? 2
      const status = row?.status ?? 'active'
      const focus = focusList.includes(name)
      const heat = status === 'paused' ? 0 : (focus ? 60 : 0) + ({ 1: 35, 2: 15, 3: 0 } as Record<number, number>)[priority] + overdue * 14 + dueToday * 12 + dueSoon * 5 + Math.min(open.length, 6) * 3 + Math.min(recent, 5) * 4 + Math.min(mentions, 3) * 5
      const boardNote = live.find(n => n.project === name && n.board_day === today)
      const bp = boardNote ? checklistProgress(boardNote.body) : null
      const last = items.reduce<string | null>((a, n) => (!a || n.created_at > a ? n.created_at : a), null)
      const next = open[0] ? (open[0].next_action || open[0].title) : (items.find(n => n.next_action)?.next_action || null)
      return {
        name, priority, status, heat, focus, color: topicColor(name), overdue, dueToday, total: items.length, last, next,
        open: open.map(o => ({ id: o.id, type: o.type, title: o.title, status: o.status, due: o.due, next_action: o.next_action })),
        board: boardNote ? { id: boardNote.id, done: bp!.done, total: bp!.total } : null,
      } as TopicView
    })
    return views.sort((a, b) => b.heat - a.heat || a.name.localeCompare(b.name))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicRows, live, msgs, focusList.join('|'), today])
  const maxHeat = Math.max(1, ...topicViews.map(t => t.heat))
  const inbox = useMemo(() => notes.filter(n => n.status === 'inbox').sort((a, b) => a.created_at.localeCompare(b.created_at)), [notes])
  const projectNames = useMemo(() => Array.from(new Set([...topicRows.map(t => t.name), ...(live.map(n => n.project).filter(Boolean) as string[])])), [live, topicRows])
  const graphNotes = useMemo(() => live.filter(n => !n.board_day).map(n => ({ id: n.id, type: n.type, title: n.title, tags: n.tags, related: n.related, pinned: n.pinned })), [live])
  const tagCount = useMemo(() => new Set(live.flatMap(n => n.tags)).size, [live])
  const openPrios = prios.filter(p => !p.done)
  const dueSoon = useMemo(() => live.filter(n => n.due && n.status !== 'done' && n.due <= dayKey(addDays(new Date(), 1))).length, [live])
  const selected = notes.find(n => n.id === selectedId) || null
  const firstName = (name || 'Leon').split(/[ .]/)[0].replace(/^./, c => c.toUpperCase())
  const hour = new Date().getHours()
  const greeting = hour < 11 ? 'Guten Morgen' : hour < 17 ? 'Hey' : 'Guten Abend'
  const todaysMsgs = msgs.filter(m => m.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10))

  return (
    <ModuleLayout onBack={onBack} icon="🧠" title="SECONDBRAIN" titleColor={BLUE} sub="Talk · Think · Remember" maxWidth={1680}
      iconBg="linear-gradient(135deg, rgba(60,120,200,0.4), rgba(100,180,255,0.2))"
      rightAction={<button onClick={() => setLibrary(true)} style={topBtn}>▤ LIBRARY · {live.length}</button>}>

      {/* ═══ TODAY STRIP ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 22, flexWrap: isMobile ? 'wrap' : 'nowrap', marginBottom: 14,
        padding: isMobile ? '12px 14px' : '12px 20px', borderRadius: 16, background: 'linear-gradient(90deg, rgba(10,26,58,0.62), rgba(6,16,38,0.45))',
        border: '1px solid rgba(80,180,255,0.12)', backdropFilter: 'blur(14px)',
      }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: DIM }}>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short' }).toUpperCase()}</div>
          <div style={{ fontSize: 15, color: '#eef6ff', fontWeight: 600, marginTop: 2 }}>{greeting}, {firstName}</div>
        </div>
        {isAdmin && briefing?.focus && (
          <div style={{ flex: 1, minWidth: isMobile ? '100%' : 0, borderLeft: isMobile ? 'none' : '1px solid rgba(80,180,255,0.12)', paddingLeft: isMobile ? 0 : 20 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2, color: MINT }}>● FOCUS</div>
            <div style={{ fontSize: 13.5, color: '#e6f2ff', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{briefing.focus}</div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flex: isAdmin && briefing?.focus ? 'none' : 1, minWidth: 0, overflow: 'hidden' }}>
          {openPrios.slice(0, 3).map((p, i) => (
            <button key={p.id} onClick={() => togglePrio(p)} title="mark done" style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '6px 11px', borderRadius: 20, cursor: 'pointer', maxWidth: 200,
              background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.22)', color: '#fff3d0', fontSize: 12,
            }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: GOLD }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.text}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          {habits.map(h => {
            const done = todayDone.includes(h.id)
            return <button key={h.id} onClick={() => toggleHabit(h.id)} title={h.label} style={{
              width: 34, height: 34, borderRadius: 10, cursor: 'pointer', fontSize: 15,
              background: done ? 'rgba(52,211,153,0.2)' : 'rgba(0,0,0,0.2)', border: `1px solid ${done ? 'rgba(52,211,153,0.55)' : 'rgba(80,180,255,0.12)'}`,
              boxShadow: done ? '0 0 14px rgba(52,211,153,0.25)' : 'none', filter: done ? 'none' : 'grayscale(0.5)', opacity: done ? 1 : 0.75,
            }}>{h.emoji}</button>
          })}
        </div>
        {(inbox.length > 0 || dueSoon > 0) && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {inbox.length > 0 && <button onClick={() => setProcessing(true)} style={{ ...pill, color: GOLD, borderColor: 'rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.1)' }}>▶ {inbox.length} INBOX</button>}
            {dueSoon > 0 && <button onClick={() => setLibrary(true)} style={{ ...pill, color: '#f87171', borderColor: 'rgba(248,113,113,0.4)', background: 'rgba(248,113,113,0.08)' }}>◷ {dueSoon} DUE</button>}
          </div>
        )}
      </div>

      {/* ═══ TOPICS + MIND STREAM ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14, height: isMobile ? 'auto' : heroH }}>

        <TopicsBoard
          topics={topicViews} maxHeat={maxHeat} height={isMobile ? 'auto' : heroH}
          onCyclePrio={cyclePrio} onToggleFocus={toggleFocus} onTogglePause={togglePause}
          onOpenBoard={openBoard} onOpenNote={id => setSelectedId(id)}
          onDoneTask={id => patchNote(id, { status: 'done' })}
          onAddTopic={name => upsertTopic(name, {})}
        />

        {/* mind stream */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 22, overflow: 'hidden', border: '1px solid rgba(80,180,255,0.12)', background: 'linear-gradient(180deg, rgba(10,24,54,0.6), rgba(4,12,30,0.55))', backdropFilter: 'blur(14px)', height: isMobile ? 560 : heroH }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(80,180,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Orb busy={busy} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: 2.5, color: '#dff0ff', fontWeight: 700 }}>OREN · MIND</div>
              <div style={{ fontSize: 11, color: DIM, marginTop: 1 }}>{busy ? 'denkt nach…' : 'files · answers · thinks with you'}</div>
            </div>
            {isAdmin && <button onClick={planDay} disabled={planning} style={{ ...pill, color: GOLD, borderColor: 'rgba(251,191,36,0.45)', background: 'rgba(251,191,36,0.1)', cursor: planning ? 'wait' : 'pointer' }}>{planning ? 'PLANNING…' : '☀ PLAN MY DAY'}</button>}
          </div>

          <div ref={streamRef} className="sb-scroll" style={{ flex: 1, overflowY: 'auto', padding: '18px 18px 8px' }}>
            {!mindReady && <Note2>Run <b>lib/sql/brain_mind.sql</b> in Supabase to activate the conversation.</Note2>}
            {msgs.length > 0 && msgs.length > todaysMsgs.length && <div style={dayDivider}>EARLIER</div>}
            {msgs.map((m, i) => {
              const prev = msgs[i - 1]
              const newDay = prev && prev.created_at.slice(0, 10) !== m.created_at.slice(0, 10)
              return (
                <React.Fragment key={m.id}>
                  {newDay && <div style={dayDivider}>{new Date(m.created_at).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase()}</div>}
                  <Bubble m={m} notes={notes} onOpen={setSelectedId} onHover={ids => setGlow(ids ? new Set(ids) : null)} />
                </React.Fragment>
              )
            })}
            {todaysMsgs.length === 0 && loaded && (
              <div style={{ display: 'flex', gap: 10, margin: '6px 0 14px', animation: 'sbRise .4s ease' }}>
                <Orb small />
                <div style={{ ...orenBubble }}>
                  <div style={{ fontSize: 14, color: '#e8f3ff', lineHeight: 1.6 }}>
                    {greeting}, {firstName}.{isAdmin && briefing?.focus ? <> Heute zählt vor allem: <b style={{ color: '#fff' }}>{briefing.focus}</b>.</> : ''} Was geht dir durch den Kopf?
                  </div>
                  <div style={{ fontSize: 11.5, color: DIM, marginTop: 6 }}>Schreib oder sprich einfach — Ideen, Aufgaben, Fragen, Grübeleien. Oder drück <b style={{ color: GOLD }}>☀ PLAN MY DAY</b>, dann plane ich deinen Tag und lege für jedes Fokus-Thema ein Tagesboard an.</div>
                </div>
              </div>
            )}
            {busy && (
              <div style={{ display: 'flex', gap: 10, margin: '8px 0', alignItems: 'center' }}>
                <Orb small busy />
                <div style={{ display: 'flex', gap: 4 }}>{[0, 1, 2].map(k => <span key={k} style={{ width: 6, height: 6, borderRadius: '50%', background: MINT, animation: `sbDot 1.2s ${k * 0.15}s infinite` }} />)}</div>
              </div>
            )}
          </div>

          {todaysMsgs.length === 0 && !busy && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 18px 10px' }}>
              {PROMPTS.map(p => (
                <button key={p} onClick={() => { setInput(p.endsWith('…') ? p.slice(0, -1) : p); inputRef.current?.focus() }} style={{ ...pill, fontFamily: 'DM Sans, system-ui, sans-serif', fontSize: 11.5, letterSpacing: 0, textTransform: 'none' }}>{p}</button>
              ))}
            </div>
          )}

          <div style={{ padding: 12, borderTop: '1px solid rgba(80,180,255,0.08)' }}>
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: 8, padding: '8px 8px 8px 14px', borderRadius: 16,
              background: 'rgba(4,12,30,0.7)', border: `1px solid ${listening ? 'rgba(248,113,113,0.55)' : 'rgba(120,200,255,0.22)'}`,
              boxShadow: listening ? '0 0 24px rgba(248,113,113,0.15)' : 'inset 0 1px 0 rgba(160,220,255,0.05)',
            }}>
              <textarea
                ref={inputRef} value={input} rows={1}
                onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px' }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder={listening ? 'Ich höre zu…' : 'Denk laut… (Enter senden, Shift+Enter neue Zeile)'}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', resize: 'none', color: '#eef6ff', fontSize: 14.5, lineHeight: 1.5, fontFamily: 'DM Sans, system-ui, sans-serif', padding: '6px 0', maxHeight: 140 }}
              />
              <button onClick={toggleVoice} title="voice" style={{ ...roundBtn, background: listening ? 'rgba(248,113,113,0.22)' : 'rgba(80,180,255,0.08)', borderColor: listening ? 'rgba(248,113,113,0.6)' : 'rgba(120,200,255,0.25)', animation: listening ? 'sbPulse 1.2s infinite' : undefined }}>{listening ? '■' : '🎙'}</button>
              <button onClick={() => send()} disabled={busy || !input.trim()} style={{ ...roundBtn, background: input.trim() ? 'rgba(52,211,153,0.22)' : 'rgba(80,180,255,0.06)', borderColor: input.trim() ? 'rgba(52,211,153,0.55)' : 'rgba(120,200,255,0.15)', color: input.trim() ? MINT : DIM }}>↑</button>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ BRAIN ORB (bottom) ═══ */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 10, paddingBottom: 10 }}>
        <button onClick={() => setBrainOpen(true)} aria-label="open your brain" className="sb-orb" style={{
          position: 'relative', width: 190, height: 190, borderRadius: '50%', cursor: 'pointer', padding: 0, border: 'none', background: 'transparent',
        }}>
          <div style={{ position: 'absolute', inset: -55, pointerEvents: 'none' }}>
            <OrenCoreGL orbState={glow || busy ? 'thinking' : 'idle'} size={300} />
          </div>
          <span className="sb-orb-ring" style={{ position: 'absolute', inset: 18, borderRadius: '50%', border: '1px solid rgba(120,200,255,0.25)', pointerEvents: 'none' }} />
        </button>
        <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 3, color: DIM, marginTop: 46, textAlign: 'center', position: 'relative', zIndex: 2 }}>
          <span style={{ color: glow ? MINT : BLUE }}>●</span> YOUR BRAIN · <b style={{ color: '#cfe8ff' }}>{live.length}</b> NEURONS · <b style={{ color: '#cfe8ff' }}>{tagCount}</b> TOPICS
        </div>
        <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 2.5, color: 'rgba(120,180,230,0.35)', marginTop: 4 }}>{glow ? `✦ ${glow.size} NEURONS ACTIVE` : 'TAP TO ENTER'}</div>
      </div>

      {/* ═══ BRAIN FULLSCREEN ═══ */}
      {brainOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 88, background: 'radial-gradient(ellipse at 50% 60%, #0a1a3c 0%, #030915 60%, #000 100%)', animation: 'sbBrainIn .75s cubic-bezier(.2,.8,.2,1) both' }}>
          <KnowledgeGraph
            notes={graphNotes} selectedId={selectedId} highlight={glow} burstId={burstId}
            height={winH}
            onSelect={id => setSelectedId(id)}
            onTag={() => { setBrainOpen(false); setLibrary(true) }}
          />
          <div style={{ position: 'absolute', top: 24, left: 28, pointerEvents: 'none', animation: 'sbRise .6s .3s both' }}>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 4, color: '#dff0ff', fontWeight: 700 }}>YOUR BRAIN</div>
            <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 2, color: DIM, marginTop: 4 }}><b style={{ color: '#cfe8ff' }}>{live.length}</b> NEURONS · <b style={{ color: '#cfe8ff' }}>{tagCount}</b> TOPICS · DRAG TO ROTATE · CLICK A NEURON</div>
          </div>
          <button onClick={() => setBrainOpen(false)} style={{ position: 'absolute', top: 22, right: 26, ...topBtn, animation: 'sbRise .6s .3s both' }}>✕ CLOSE</button>
          {loaded && live.length === 0 && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: '62%', textAlign: 'center', pointerEvents: 'none', fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, color: DIM }}>
              TALK TO OREN → EVERY THOUGHT BECOMES A NEURON
            </div>
          )}
        </div>
      )}

      {/* ═══ LIBRARY ═══ */}
      {library && <Library notes={notes} isMobile={isMobile} onClose={() => setLibrary(false)} onOpen={id => setSelectedId(id)} />}

      {/* ═══ NOTE PAGE ═══ */}
      {selected && (
        <NotePage
          n={selected as PageNote} notes={notes as PageNote[]} projectNames={projectNames} isAdmin={isAdmin} isMobile={isMobile}
          getToken={token}
          onClose={() => setSelectedId(null)} onPatch={p => patchNote(selected.id, p as Partial<Note>)} onDelete={() => deleteNote(selected.id)}
          onToday={() => sendToToday(selected)} onOpen={id => setSelectedId(id)} onTag={() => { setSelectedId(null); setLibrary(true) }}
        />
      )}

      {/* ═══ PROCESS INBOX ═══ */}
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
        @keyframes sbFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes sbRise { from { transform: translateY(10px); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes sbCardIn { from { transform: translateY(18px) scale(.97); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes sbSlide { from { transform: translateX(30px); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes sbBrainIn { from { clip-path: circle(0% at 50% 92%); opacity: .4 } to { clip-path: circle(150% at 50% 92%); opacity: 1 } }
        .sb-orb { transition: transform .35s cubic-bezier(.2,.8,.2,1) }
        .sb-orb:hover { transform: scale(1.06) }
        .sb-orb:hover .sb-orb-ring { border-color: rgba(120,200,255,0.55) !important; box-shadow: 0 0 40px rgba(80,170,255,0.25) }
        @keyframes sbDot { 0%,80%,100% { transform: scale(.5); opacity: .3 } 40% { transform: scale(1); opacity: 1 } }
        @keyframes sbOrb { 0%,100% { box-shadow: 0 0 12px rgba(52,211,153,.5), inset 0 0 8px rgba(255,255,255,.4) } 50% { box-shadow: 0 0 26px rgba(52,211,153,.9), inset 0 0 12px rgba(255,255,255,.7) } }
        .sb-scroll { scrollbar-width: thin; scrollbar-color: rgba(80,180,255,.2) transparent }
        .sb-card:hover { transform: translateY(-2px) }
      `}</style>
    </ModuleLayout>
  )
}

// ─── message bubble ───
function Bubble({ m, notes, onOpen, onHover }: { m: Msg; notes: Note[]; onOpen: (id: string) => void; onHover: (ids: string[] | null) => void }) {
  if (m.role === 'me') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '10px 0', animation: 'sbRise .25s ease' }}>
        <div style={{ maxWidth: '82%', padding: '10px 14px', borderRadius: '16px 16px 4px 16px', background: 'linear-gradient(135deg, rgba(60,130,230,0.32), rgba(40,90,180,0.22))', border: '1px solid rgba(120,190,255,0.25)', opacity: m.pending ? 0.7 : 1 }}>
          <div style={{ fontSize: 14, color: '#f0f7ff', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{m.content}</div>
          <div style={{ fontFamily: MONO, fontSize: 8.5, color: 'rgba(180,215,250,0.45)', textAlign: 'right', marginTop: 4 }}>{timeOf(m.created_at)}</div>
        </div>
      </div>
    )
  }
  const filed = m.note_id ? notes.find(n => n.id === m.note_id) : null
  const cited = (m.cited || []).map(id => notes.find(n => n.id === id)).filter(Boolean) as Note[]
  const it = m.intent ? INTENT[m.intent] : null
  return (
    <div style={{ display: 'flex', gap: 10, margin: '10px 0', animation: 'sbRise .3s ease' }}
      onMouseEnter={() => (cited.length || filed) && onHover([...cited.map(c => c.id), ...(filed ? [filed.id] : [])])} onMouseLeave={() => onHover(null)}>
      <Orb small />
      <div style={{ ...orenBubble, maxWidth: '86%' }}>
        {it && <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 2, color: it.color, marginBottom: 5 }}>{it.label}</div>}
        <div style={{ fontSize: 14, color: '#e3efff', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{m.content}</div>
        {filed && (
          <div onClick={() => onOpen(filed.id)} className="sb-card" style={{
            marginTop: 10, padding: '9px 11px', borderRadius: 11, cursor: 'pointer', transition: 'transform .2s',
            background: `linear-gradient(135deg, ${TYPE_COLORS[filed.type] || BLUE}1c, rgba(6,16,38,0.4))`, border: `1px solid ${TYPE_COLORS[filed.type] || BLUE}44`,
          }}>
            <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 1.5, color: TYPE_COLORS[filed.type] || BLUE }}>
              {TYPE_ICON[filed.type]} {filed.type.toUpperCase()}{filed.project ? ` · ${filed.project.toUpperCase()}` : ''}{filed.due ? ` · DUE ${new Date(filed.due + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase()}` : ''}
            </div>
            <div style={{ fontSize: 13, color: '#f2f8ff', fontWeight: 600, marginTop: 3 }}>{filed.title}</div>
            {filed.next_action && <div style={{ fontSize: 11.5, color: 'rgba(255,243,208,0.8)', marginTop: 3 }}>→ {filed.next_action}</div>}
          </div>
        )}
        {cited.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 9 }}>
            {cited.map(c => (
              <button key={c.id} onClick={() => onOpen(c.id)} style={{ fontFamily: MONO, fontSize: 9, padding: '3px 9px', borderRadius: 20, cursor: 'pointer', color: TYPE_COLORS[c.type] || BLUE, background: 'rgba(0,0,0,0.25)', border: `1px solid ${(TYPE_COLORS[c.type] || BLUE)}44`, maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {TYPE_ICON[c.type]} {c.title}
              </button>
            ))}
          </div>
        )}
        <div style={{ fontFamily: MONO, fontSize: 8.5, color: 'rgba(120,180,230,0.35)', marginTop: 6 }}>{timeOf(m.created_at)}</div>
      </div>
    </div>
  )
}

// ─── library overlay ───
function Library({ notes, isMobile, onClose, onOpen }: { notes: Note[]; isMobile: boolean; onClose: () => void; onOpen: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [type, setType] = useState<string | null>(null)
  const [status, setStatus] = useState<'all' | Status>('all')
  const [project, setProject] = useState<string | null>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const projects = useMemo(() => Array.from(new Set(notes.map(n => n.project).filter(Boolean) as string[])), [notes])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return notes.filter(n =>
      (status === 'all' ? n.status !== 'archived' : n.status === status) && (!type || n.type === type) && (!project || n.project === project) &&
      (!s || `${n.title} ${n.summary || ''} ${n.body || ''} ${n.tags.join(' ')} ${n.project || ''}`.toLowerCase().includes(s)))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.due && !b.due ? -1 : 0))
  }, [notes, q, type, status, project])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 85, background: 'radial-gradient(ellipse at 50% 0%, rgba(12,30,66,0.97), rgba(2,6,16,0.98) 70%)', backdropFilter: 'blur(14px)', overflowY: 'auto', animation: 'sbFade .2s' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '18px 16px 60px' : '28px 36px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <button onClick={onClose} style={topBtn}>‹ BACK</button>
          <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 3, color: '#dff0ff', fontWeight: 700 }}>LIBRARY</div>
          <div style={{ flex: 1 }} />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="⌕ search everything…" style={{ width: isMobile ? 160 : 320, background: 'rgba(6,16,38,0.7)', border: '1px solid rgba(120,200,255,0.25)', borderRadius: 12, padding: '10px 14px', color: '#e8f3ff', fontSize: 13.5, outline: 'none', fontFamily: 'DM Sans, system-ui, sans-serif' }} />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {(['all', 'inbox', 'active', 'reference', 'done', 'archived'] as const).map(s => <Chip key={s} active={status === s} onClick={() => setStatus(s)} color={BLUE}>{s.toUpperCase()}</Chip>)}
          <span style={{ width: 1, background: 'rgba(80,180,255,0.15)', margin: '0 4px' }} />
          {TYPES.filter(t => notes.some(n => n.type === t)).map(t => <Chip key={t} active={type === t} onClick={() => setType(type === t ? null : t)} color={TYPE_COLORS[t]}>{TYPE_ICON[t]} {t.toUpperCase()}</Chip>)}
        </div>
        {projects.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
            {projects.map(p => <Chip key={p} active={project === p} onClick={() => setProject(project === p ? null : p)} color="#bfe0ff">▣ {p}</Chip>)}
          </div>
        )}
        {list.length === 0 && <div style={{ color: DIM, fontSize: 13, padding: 20 }}>Nothing here yet.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {list.slice(0, 200).map(n => {
            const c = TYPE_COLORS[n.type] || BLUE
            const pr = checklistProgress(n.body)
            const snippet = (n.body || '').split('\n').map(l => l.trim()).find(l => l && !l.startsWith('#') && !/^- \[( |x|X)\] ?$/.test(l) && l !== n.title)
            return (
              <div key={n.id} onClick={() => onOpen(n.id)} className="sb-card" style={{
                position: 'relative', padding: '14px 15px 12px', borderRadius: 14, cursor: 'pointer', overflow: 'hidden', transition: 'transform .2s',
                background: `linear-gradient(160deg, ${c}14, rgba(6,16,38,0.5) 55%)`, border: `1px solid ${c}30`, opacity: n.status === 'archived' || n.status === 'done' ? 0.6 : 1,
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: 3, bottom: 0, background: c, boxShadow: `0 0 12px ${c}`, opacity: 0.8 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 9, letterSpacing: 1.5, color: c }}>
                  <span>{TYPE_ICON[n.type]} {n.type.toUpperCase()}{n.pinned ? '  ★' : ''}{n.status === 'inbox' ? '  · INBOX' : ''}</span>
                  <span style={{ color: DIM }}>{n.due ? `DUE ${n.due.slice(5)}` : ago(n.created_at)}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#eef6ff', marginTop: 7, lineHeight: 1.35, textDecoration: n.status === 'done' ? 'line-through' : 'none' }}>{n.title}</div>
                {(snippet || n.summary) && <div style={{ fontSize: 12, color: 'rgba(200,225,250,0.6)', marginTop: 5, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{(snippet || '').replace(/^[-*>] (\[( |x|X)\] )?/, '') || n.summary}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 8, fontFamily: MONO, fontSize: 9.5, flexWrap: 'wrap' }}>
                  {pr.total > 0 && <span style={{ color: pr.done === pr.total ? MINT : GOLD }}>☑ {pr.done}/{pr.total}</span>}
                  {n.project && <span style={{ color: '#bfe0ff' }}>▣ {n.project}</span>}
                  {n.tags.length > 0 && <span style={{ color: 'rgba(190,225,255,0.5)' }}>{n.tags.map(t => '#' + t).join(' ')}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── pieces ───
function Orb({ small, busy }: { small?: boolean; busy?: boolean }) {
  const s = small ? 26 : 34
  return <div style={{
    width: s, height: s, borderRadius: '50%', flexShrink: 0, marginTop: small ? 2 : 0,
    background: 'radial-gradient(circle at 35% 30%, #ffffff, #9ff5d6 25%, #34d399 55%, #0b4f3c 100%)',
    animation: `sbOrb ${busy ? '0.9s' : '3s'} ease-in-out infinite`,
  }} />
}
function Chip({ children, active, onClick, color }: { children: React.ReactNode; active?: boolean; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: MONO, fontSize: 9.5, letterSpacing: 1, padding: '5px 11px', borderRadius: 20, cursor: 'pointer', whiteSpace: 'nowrap',
      color: active ? color : 'rgba(170,205,240,0.6)', background: active ? `${color}1f` : 'rgba(6,16,38,0.55)',
      border: `1px solid ${active ? color + '66' : 'rgba(80,180,255,0.15)'}`,
    }}>{children}</button>
  )
}
function Note2({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: 'rgba(255,210,140,0.85)', padding: '8px 12px', borderRadius: 10, background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.2)', marginBottom: 12 }}>{children}</div>
}
const orenBubble: React.CSSProperties = { padding: '10px 14px', borderRadius: '16px 16px 16px 4px', background: 'rgba(14,34,70,0.55)', border: '1px solid rgba(80,180,255,0.14)' }
const dayDivider: React.CSSProperties = { textAlign: 'center', fontFamily: MONO, fontSize: 8.5, letterSpacing: 2.5, color: 'rgba(120,180,230,0.35)', margin: '14px 0 6px' }
const pill: React.CSSProperties = { fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5, padding: '6px 11px', borderRadius: 20, cursor: 'pointer', color: 'rgba(190,220,250,0.75)', background: 'rgba(80,180,255,0.06)', border: '1px solid rgba(80,180,255,0.18)', whiteSpace: 'nowrap' }
const topBtn: React.CSSProperties = { fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5, padding: '7px 13px', borderRadius: 10, cursor: 'pointer', color: '#cfe8ff', background: 'rgba(80,180,255,0.08)', border: '1px solid rgba(120,200,255,0.25)' }
const roundBtn: React.CSSProperties = { width: 38, height: 38, borderRadius: 12, flexShrink: 0, cursor: 'pointer', fontSize: 15, color: '#cfe8ff', border: '1px solid', display: 'flex', alignItems: 'center', justifyContent: 'center' }
