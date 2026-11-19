'use client'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase'
import ModuleLayout from '@/components/ModuleLayout'
import { useIsMobile } from '@/lib/useIsMobile'
import BoardEditor, { type EditorTables } from '@/components/thinkspace/BoardEditor'

const KnowledgeGraph = dynamic(() => import('@/components/secondbrain/KnowledgeGraph'), { ssr: false })
const OrenCoreGL = dynamic(() => import('@/components/OrenCoreGL'), { ssr: false })

/**
 * SECONDBRAIN v7 · simple & yours
 * This week (weekly goals + today's priorities) → pages with sub-pages (Notion-style editor, private) →
 * the brain orb opens your page network.
 */

type Page = {
  id: string; parent_id: string | null; title: string; emoji: string; color: string
  priority: number | null; status: string; pinned: boolean; position: number; updated_at: string; created_at: string
}
type Goal = { id: string; text: string; done: boolean; page_id?: string | null }
type Prio = { id: string; text: string; done: boolean; sort_order?: number }

const TABLES: EditorTables = { boards: 'brain_pages', blocks: 'brain_blocks', bucket: 'brain' }
const MONO = 'Space Mono, monospace'
const SANS = 'DM Sans, Inter, system-ui, sans-serif'
const BLUE = '#64c8ff', MINT = '#34d399', DIM = 'rgba(140,185,230,0.5)'
const PRIO: Record<number, { label: string; color: string }> = { 1: { label: 'P1', color: '#ff6b6b' }, 2: { label: 'P2', color: '#fbbf24' }, 3: { label: 'P3', color: '#64c8ff' } }
const STATUS: { key: string; label: string; color: string }[] = [
  { key: 'active', label: 'ACTIVE', color: MINT },
  { key: 'someday', label: 'SOMEDAY', color: '#b47cff' },
  { key: 'done', label: 'DONE', color: 'rgba(160,200,240,0.6)' },
  { key: 'archived', label: 'ARCHIVED', color: 'rgba(140,160,190,0.45)' },
]
const FILTERS = [
  { key: 'open', label: 'ALL OPEN' }, { key: 'p1', label: 'P1' }, { key: 'active', label: 'ACTIVE' },
  { key: 'someday', label: 'SOMEDAY' }, { key: 'done', label: 'DONE' }, { key: 'archived', label: 'ARCHIVE' },
]
const COLORS = ['#80c0ff', '#34d399', '#fbbf24', '#f97316', '#a78bfa', '#ff6b6b', '#38bdf8', '#ff6fae']
const EMOJIS = ['📄', '🎯', '🚀', '🧠', '💡', '🏝', '🏡', '🎨', '🤖', '💰', '📈', '🏋️', '✍️', '📚', '🌱', '🛠', '❤️', '✈️']
const PAGE_SUGGESTIONS = ['🎯 Goals', '💡 Ideas', '✅ Next steps', '📚 Research', '📝 Notes', '🤝 People']

function weekStart(d = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
function isoWeek(d = new Date()): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7)
}
function weekRange(): string {
  const s = new Date(weekStart() + 'T00:00:00'), e = new Date(s); e.setDate(s.getDate() + 6)
  const f = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${f(s)} – ${f(e)}`
}
function ago(iso: string): string {
  const m = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 60) return `${Math.round(m)}m ago`
  if (m < 1440) return `${Math.round(m / 60)}h ago`
  return `${Math.round(m / 1440)}d ago`
}
const uid = () => Math.random().toString(36).slice(2, 10)

export default function SecondBrain({ user, onBack }: { user: User; onBack: () => void }) {
  const isMobile = useIsMobile()
  const supabase = useMemo(() => createClient(), [])
  const [pages, setPages] = useState<Page[]>([])
  const [loaded, setLoaded] = useState(false)
  const [needsSql, setNeedsSql] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [prios, setPrios] = useState<Prio[]>([])
  const [filter, setFilter] = useState('open')
  const [q, setQ] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [brainOpen, setBrainOpen] = useState(false)
  const [oldCount, setOldCount] = useState(0)
  const [importing, setImporting] = useState(false)
  const [winH, setWinH] = useState(800)
  const week = weekStart()

  useEffect(() => {
    const f = () => setWinH(window.innerHeight)
    f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f)
  }, [])
  useEffect(() => { try { const v = localStorage.getItem('sb7-filter'); if (v) setFilter(v) } catch { /* noop */ } }, [])
  useEffect(() => { try { localStorage.setItem('sb7-filter', filter) } catch { /* noop */ } }, [filter])

  // ─── load ───
  const load = useCallback(async () => {
    const [pg, wk, pr] = await Promise.all([
      supabase.from('brain_pages').select('*').order('position').order('created_at'),
      supabase.from('brain_weeks').select('goals').eq('week_start', week).maybeSingle(),
      supabase.from('priorities').select('id,text,done,sort_order').eq('user_id', user.id).eq('done', false).order('sort_order').order('created_at'),
    ])
    if (pg.error) { setNeedsSql(/relation|does not exist|schema cache/i.test(pg.error.message)); setLoaded(true); return }
    setNeedsSql(false)
    setPages((pg.data || []) as Page[])
    setGoals(((wk.data as any)?.goals || []) as Goal[])
    setPrios((pr.data || []) as Prio[])
    setLoaded(true)
    if (!(pg.data || []).length) {
      let r: any = await supabase.from('brain_notes').select('id', { count: 'exact', head: true }).neq('status', 'archived')
      if (r.error) r = await supabase.from('brain_notes').select('id', { count: 'exact', head: true })
      setOldCount(r.count || 0)
    }
  }, [supabase, user.id, week])
  useEffect(() => { load() }, [load])

  // ─── tree helpers ───
  const byId = useMemo(() => new Map(pages.map(p => [p.id, p])), [pages])
  const childrenOf = useCallback((id: string | null) => pages.filter(p => p.parent_id === id), [pages])
  const countDeep = useCallback((id: string): number => childrenOf(id).reduce((n, c) => n + 1 + countDeep(c.id), 0), [childrenOf])
  const rootOf = useCallback((p: Page): Page => { let r = p; let g = 0; while (r.parent_id && byId.get(r.parent_id) && g++ < 50) r = byId.get(r.parent_id)!; return r }, [byId])
  const trail = useCallback((p: Page): Page[] => { const out: Page[] = []; let r: Page | undefined = p; let g = 0; while (r && g++ < 50) { out.unshift(r); r = r.parent_id ? byId.get(r.parent_id) : undefined } return out }, [byId])

  // ─── page mutations ───
  async function createPage(fields: Partial<Page>, open = true): Promise<Page | null> {
    const siblings = childrenOf(fields.parent_id ?? null)
    const row = { title: 'Untitled', emoji: '📄', color: '#80c0ff', status: 'active', position: siblings.length, ...fields }
    const { data, error } = await supabase.from('brain_pages').insert(row).select().single()
    if (error) { if (/relation|does not exist/i.test(error.message)) setNeedsSql(true); else alert('Create failed: ' + error.message); return null }
    setPages(prev => [...prev, data as Page])
    if (open) setOpenId((data as Page).id)
    return data as Page
  }
  async function patchPage(id: string, fields: Partial<Page>) {
    const now = new Date().toISOString()
    setPages(prev => prev.map(p => p.id === id ? { ...p, ...fields, updated_at: now } : p))
    await supabase.from('brain_pages').update({ ...fields, updated_at: now }).eq('id', id)
  }
  async function deletePage(p: Page) {
    const n = countDeep(p.id)
    if (!confirm(`Delete "${p.title}"${n ? ` and ${n} sub-page${n === 1 ? '' : 's'}` : ''}? This cannot be undone.`)) return
    const doomed = new Set([p.id]); let grew = true
    while (grew) { grew = false; for (const x of pages) if (x.parent_id && doomed.has(x.parent_id) && !doomed.has(x.id)) { doomed.add(x.id); grew = true } }
    setPages(prev => prev.filter(x => !doomed.has(x.id)))
    if (openId && doomed.has(openId)) setOpenId(p.parent_id)
    await supabase.from('brain_pages').delete().eq('id', p.id)
  }
  const cyclePrio = (p: Page) => patchPage(p.id, { priority: p.priority === 1 ? 2 : p.priority === 2 ? 3 : p.priority === 3 ? null : 1 })

  // ─── weekly goals ───
  async function saveGoals(next: Goal[]) {
    setGoals(next)
    const { error } = await supabase.from('brain_weeks').upsert({ user_id: user.id, week_start: week, goals: next, updated_at: new Date().toISOString() })
    if (error && /relation|does not exist/i.test(error.message)) setNeedsSql(true)
  }
  const addGoal = (text: string, page_id: string | null = null) => text.trim() && saveGoals([...goals, { id: uid(), text: text.trim(), done: false, page_id }])

  // ─── today's priorities ───
  async function addPrio(text: string) {
    if (!text.trim()) return
    const { data } = await supabase.from('priorities').insert({ user_id: user.id, text: text.trim(), done: false, sort_order: prios.length }).select('id,text,done,sort_order').single()
    if (data) setPrios(prev => [...prev, data as Prio])
  }
  async function togglePrio(p: Prio) {
    setPrios(prev => prev.map(x => x.id === p.id ? { ...x, done: !x.done } : x))
    await supabase.from('priorities').update({ done: !p.done }).eq('id', p.id)
  }
  async function removePrio(p: Prio) {
    setPrios(prev => prev.filter(x => x.id !== p.id))
    await supabase.from('priorities').delete().eq('id', p.id)
  }

  // ─── import old SecondBrain notes ───
  async function importOld() {
    setImporting(true)
    let res: any = await supabase.from('brain_notes').select('id,type,title,body,summary,url,tags,project').neq('status', 'archived').order('created_at')
    if (res.error) res = await supabase.from('brain_notes').select('id,type,title,body,summary,url,tags').order('created_at')
    const notes = (res.data || []) as any[]
    const root = await createPage({ title: 'Old SecondBrain', emoji: '🗄', color: '#a78bfa', status: 'someday' }, false)
    if (!root) { setImporting(false); return }
    const icon: Record<string, string> = { idea: '💡', goal: '🎯', task: '✅', link: '🔗', person: '🤝', quote: '💬', note: '📝' }
    const groups = new Map<string, Page>()
    for (const n of notes) {
      const g = (n.project || '').trim()
      let parent = root
      if (g) {
        if (!groups.has(g)) { const gp = await createPage({ title: g, emoji: '📁', parent_id: root.id }, false); if (gp) groups.set(g, gp) }
        parent = groups.get(g) || root
      }
      const pg = await createPage({ title: (n.title || 'Note').slice(0, 120), emoji: icon[n.type] || '📝', parent_id: parent.id }, false)
      if (!pg) continue
      const blocks: any[] = []
      const text = [n.body, n.body ? '' : n.summary].filter(Boolean).join('\n')
      if (text) blocks.push({ board_id: pg.id, type: 'text', content: text, position: 0, props: {} })
      if (n.url) blocks.push({ board_id: pg.id, type: 'link', content: '', position: 1, props: { url: n.url } })
      if (n.tags?.length) blocks.push({ board_id: pg.id, type: 'text', content: n.tags.map((t: string) => '#' + t).join(' '), position: 2, props: {} })
      if (blocks.length) await supabase.from('brain_blocks').insert(blocks)
    }
    setImporting(false); setOldCount(0)
    load()
  }

  // ─── views ───
  const openPage = openId ? byId.get(openId) : null
  const sortPages = (list: Page[]) => [...list].sort((a, b) =>
    (Number(b.pinned) - Number(a.pinned)) || ((a.priority ?? 9) - (b.priority ?? 9)) || (+new Date(b.updated_at) - +new Date(a.updated_at)))
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (needle) return sortPages(pages.filter(p => p.title.toLowerCase().includes(needle)))
    const roots = pages.filter(p => !p.parent_id)
    const f = roots.filter(p =>
      filter === 'open' ? (p.status === 'active' || p.status === 'someday') :
      filter === 'p1' ? p.priority === 1 && p.status !== 'archived' && p.status !== 'done' :
      p.status === filter)
    return sortPages(f)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, q, filter])

  const graphNotes = useMemo(() => pages.filter(p => p.status !== 'archived').map(p => {
    const r = rootOf(p)
    const type = p.status === 'done' ? 'task' : p.status === 'someday' ? 'link' : p.priority === 1 ? 'goal' : p.priority === 2 ? 'idea' : 'note'
    const parent = p.parent_id ? byId.get(p.parent_id) : undefined
    return { id: p.id, type, title: `${p.emoji} ${p.title}`, tags: [r.title], related: parent && parent.parent_id ? [parent.id] : [], pinned: p.pinned }
  }), [pages, rootOf, byId])
  const rootCount = pages.filter(p => !p.parent_id).length

  // ═══ PAGE VIEW ═══
  if (openPage) {
    const parent = openPage.parent_id ? byId.get(openPage.parent_id) : undefined
    const subs = sortPages(childrenOf(openPage.id))
    const inWeek = goals.some(g => g.page_id === openPage.id)
    return (
      <BoardEditor
        key={openPage.id}
        board={openPage}
        supabase={supabase}
        tables={TABLES}
        openPrefix="sb7-open-"
        sqlFile="lib/sql/brain_v7.sql"
        suggestions={PAGE_SUGGESTIONS}
        backLabel={parent ? `← ${parent.emoji} ${parent.title.slice(0, 18)}` : '← SECONDBRAIN'}
        onBack={() => setOpenId(parent ? parent.id : null)}
        onTitle={t => setPages(prev => prev.map(p => p.id === openPage.id ? { ...p, title: t } : p))}
        topRight={<PageControls page={openPage} isMobile={isMobile} inWeek={inWeek}
          onPrio={() => cyclePrio(openPage)} onPatch={f => patchPage(openPage.id, f)} onDelete={() => deletePage(openPage)}
          onWeek={() => inWeek ? saveGoals(goals.filter(g => g.page_id !== openPage.id)) : addGoal(openPage.title, openPage.id)} />}
      >
        <div style={{ padding: '16px 0 6px' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5, color: DIM }}>
            <button onClick={() => setOpenId(null)} style={crumbBtn}>🧠 SECONDBRAIN</button>
            {trail(openPage).map(p => (
              <React.Fragment key={p.id}><span>/</span>
                <button onClick={() => setOpenId(p.id)} style={{ ...crumbBtn, color: p.id === openPage.id ? '#eaf4ff' : DIM }}>{p.emoji} {p.title.toUpperCase().slice(0, 28)}</button>
              </React.Fragment>
            ))}
          </div>
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? 150 : 190}px, 1fr))`, gap: 10 }}>
            {subs.map(s => <SubTile key={s.id} page={s} count={countDeep(s.id)} onOpen={() => setOpenId(s.id)} />)}
            <button onClick={() => createPage({ parent_id: openPage.id, color: openPage.color })} style={{
              minHeight: 64, borderRadius: 12, cursor: 'pointer', fontFamily: MONO, fontSize: 10, letterSpacing: 1.5,
              color: 'rgba(160,205,250,0.75)', background: 'rgba(80,180,255,0.04)', border: '1px dashed rgba(120,190,255,0.28)',
            }}>+ SUB-PAGE</button>
          </div>
          <div style={{ height: 1, margin: '18px 0 0', background: `linear-gradient(90deg, ${openPage.color}66, transparent 80%)` }} />
        </div>
      </BoardEditor>
    )
  }

  // ═══ HOME ═══
  return (
    <ModuleLayout onBack={onBack} icon="🧠" title="SECONDBRAIN" titleColor={BLUE} sub="Pages · Weekly goals · Priorities" iconBg="rgba(100,200,255,0.12)" maxWidth={1320}
      rightAction={<button onClick={() => setShowNew(true)} style={primaryBtn}>{isMobile ? '+' : '+ NEW PAGE'}</button>}>
      <div style={{ padding: isMobile ? '0 0 40px' : '10px 0 40px', minWidth: 0 }}>
        {needsSql && (
          <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 12, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', color: '#ffe6a8', fontSize: 13.5 }}>
            One-time setup: run <b>lib/sql/brain_v7.sql</b> in the Supabase SQL editor, then reload.
          </div>
        )}

        {/* ═══ THIS WEEK ═══ */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'minmax(0,1.25fr) minmax(0,1fr)', gap: 14, animation: 'sbRise .5s both' }}>
          <GoalsCard goals={goals} pagesById={byId} onSave={saveGoals} onAdd={t => addGoal(t)} onOpen={id => setOpenId(id)} />
          <PriosCard prios={prios} onAdd={addPrio} onToggle={togglePrio} onRemove={removePrio} />
        </div>

        {/* ═══ PAGES ═══ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '28px 0 14px' }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: 3, color: '#cfe8ff', fontWeight: 700, marginRight: 6 }}>◇ PAGES</div>
          {!q && FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5, padding: '6px 11px', borderRadius: 20, cursor: 'pointer',
              color: filter === f.key ? '#04121f' : 'rgba(170,210,250,0.75)', background: filter === f.key ? BLUE : 'rgba(80,180,255,0.06)',
              border: `1px solid ${filter === f.key ? BLUE : 'rgba(120,190,255,0.2)'}`, fontWeight: filter === f.key ? 700 : 400,
            }}>{f.label}</button>
          ))}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search all pages…" style={{
            marginLeft: isMobile ? 0 : 'auto', flex: isMobile ? '1 1 100%' : '0 1 240px', background: 'rgba(4,12,30,0.6)', border: '1px solid rgba(120,190,255,0.2)',
            borderRadius: 20, padding: '8px 14px', color: '#e6f2ff', fontFamily: SANS, fontSize: 13, outline: 'none',
          }} />
        </div>

        {showNew && <NewPageForm onCancel={() => setShowNew(false)} onCreate={async f => { setShowNew(false); await createPage(f) }} />}

        {!loaded ? (
          <div style={{ fontFamily: MONO, fontSize: 11, color: DIM, padding: 40, textAlign: 'center' }}>Loading…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding: '44px 20px', textAlign: 'center', borderRadius: 16, border: '1px dashed rgba(120,190,255,0.22)', color: DIM }}>
            {q ? <div style={{ fontSize: 14 }}>No page matches “{q}”.</div> : rootCount === 0 ? (
              <>
                <div style={{ fontSize: 17, color: '#eef6ff', fontWeight: 600 }}>Your brain is empty — start with your big topics</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>One page per area of life or project. Sub-pages for everything inside.</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 18 }}>
                  {[['🤖', 'AI Dev'], ['🏝', 'Land & Property'], ['📈', 'Trading'], ['💼', 'Business'], ['🏋️', 'Health'], ['💡', 'Ideas']].map(([e, t]) => (
                    <button key={t} onClick={() => createPage({ title: t, emoji: e }, false)} style={suggBtn}>{e} {t}</button>
                  ))}
                </div>
                {oldCount > 0 && (
                  <button onClick={importOld} disabled={importing} style={{ ...ghostBtn, marginTop: 20 }}>
                    {importing ? 'IMPORTING…' : `⇣ IMPORT ${oldCount} NOTES FROM THE OLD SECONDBRAIN`}
                  </button>
                )}
              </>
            ) : <div style={{ fontSize: 14 }}>Nothing in this filter.</div>}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(auto-fill, minmax(230px, 1fr))', gap: isMobile ? 10 : 14 }}>
            {visible.map((p, i) => (
              <PageTile key={p.id} page={p} index={i} count={countDeep(p.id)} path={q && p.parent_id ? trail(p).slice(0, -1).map(x => x.title).join(' / ') : ''}
                onOpen={() => setOpenId(p.id)} onPrio={() => cyclePrio(p)} onPin={() => patchPage(p.id, { pinned: !p.pinned })} onDelete={() => deletePage(p)} />
            ))}
          </div>
        )}

        {/* ═══ BRAIN ORB ═══ */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 46 }}>
          <button onClick={() => setBrainOpen(true)} aria-label="open your brain" className="sb-orb" style={{ position: 'relative', width: 170, height: 170, borderRadius: '50%', cursor: 'pointer', padding: 0, border: 'none', background: 'transparent' }}>
            <div style={{ position: 'absolute', inset: -50, pointerEvents: 'none' }}><OrenCoreGL orbState="idle" size={270} /></div>
            <span className="sb-orb-ring" style={{ position: 'absolute', inset: 16, borderRadius: '50%', border: '1px solid rgba(120,200,255,0.25)', pointerEvents: 'none' }} />
          </button>
          <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 3, color: DIM, marginTop: 40, position: 'relative', zIndex: 2 }}>
            <span style={{ color: BLUE }}>●</span> YOUR BRAIN · <b style={{ color: '#cfe8ff' }}>{pages.length}</b> PAGES · <b style={{ color: '#cfe8ff' }}>{rootCount}</b> AREAS
          </div>
          <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 2.5, color: 'rgba(120,180,230,0.35)', marginTop: 4 }}>TAP TO ENTER</div>
        </div>
      </div>

      {brainOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 88, background: 'radial-gradient(ellipse at 50% 60%, #0a1a3c 0%, #030915 60%, #000 100%)', animation: 'sbBrainIn .75s cubic-bezier(.2,.8,.2,1) both' }}>
          <KnowledgeGraph notes={graphNotes} selectedId={null} highlight={null} height={winH}
            onSelect={id => { if (id) { setBrainOpen(false); setOpenId(id) } }}
            onTag={tag => { const r = pages.find(p => !p.parent_id && p.title === tag); if (r) { setBrainOpen(false); setOpenId(r.id) } }} />
          <div style={{ position: 'absolute', top: 24, left: 28, pointerEvents: 'none', animation: 'sbRise .6s .3s both' }}>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 4, color: '#dff0ff', fontWeight: 700 }}>YOUR BRAIN</div>
            <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 2, color: DIM, marginTop: 4 }}>{pages.length} PAGES · DRAG TO ROTATE · CLICK TO OPEN</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 10, fontFamily: MONO, fontSize: 9, letterSpacing: 1.2, color: DIM }}>
              {[['#ff9f43', 'P1'], ['#ffd73c', 'P2'], ['#64c8ff', 'P3 / –'], ['#b47cff', 'SOMEDAY'], ['#34d399', 'DONE']].map(([c, l]) => <span key={l}><span style={{ color: c }}>●</span> {l}</span>)}
            </div>
          </div>
          <button onClick={() => setBrainOpen(false)} style={{ position: 'absolute', top: 22, right: 26, ...ghostBtn, animation: 'sbRise .6s .3s both' }}>✕ CLOSE</button>
          {pages.length === 0 && <div style={{ position: 'absolute', left: 0, right: 0, top: '62%', textAlign: 'center', fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, color: DIM }}>EVERY PAGE BECOMES A NEURON</div>}
        </div>
      )}

      <style>{`
        @keyframes sbRise { from { transform: translateY(10px); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes sbCardIn { from { transform: translateY(16px) scale(.97); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes sbBrainIn { from { clip-path: circle(0% at 50% 92%); opacity: .4 } to { clip-path: circle(150% at 50% 92%); opacity: 1 } }
        .sb-orb { transition: transform .35s cubic-bezier(.2,.8,.2,1) }
        .sb-orb:hover { transform: scale(1.06) }
        .sb-orb:hover .sb-orb-ring { border-color: rgba(120,200,255,0.55) !important; box-shadow: 0 0 40px rgba(80,170,255,0.25) }
        .sb-tile { transition: transform .2s ease, background .2s ease, box-shadow .2s ease }
        .sb-tile:hover { transform: translateY(-3px); background: rgba(14,32,66,0.8) !important; box-shadow: 0 14px 34px rgba(0,0,0,0.45) }
        .sb-tile .sb-act { opacity: 0; transition: opacity .15s }
        .sb-tile:hover .sb-act { opacity: 1 }
        @media (hover: none) { .sb-tile .sb-act { opacity: .7 } }
        .sb-row:hover .sb-x { opacity: 1 !important }
      `}</style>
    </ModuleLayout>
  )
}

// ═══ WEEKLY GOALS ═══
function GoalsCard({ goals, pagesById, onSave, onAdd, onOpen }: { goals: Goal[]; pagesById: Map<string, Page>; onSave: (g: Goal[]) => void; onAdd: (t: string) => void; onOpen: (id: string) => void }) {
  const [text, setText] = useState('')
  const done = goals.filter(g => g.done).length
  const pct = goals.length ? Math.round((done / goals.length) * 100) : 0
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={label}>◇ WEEK {isoWeek()} · WEEKLY GOALS</div>
          <div style={{ fontSize: 12, color: DIM, marginTop: 3 }}>{weekRange()}</div>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 22, color: pct === 100 && goals.length ? MINT : '#eaf4ff', fontWeight: 700 }}>{done}<span style={{ fontSize: 13, color: DIM }}>/{goals.length}</span></div>
      </div>
      <div style={{ height: 5, borderRadius: 4, background: 'rgba(80,180,255,0.1)', margin: '12px 0 10px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: `linear-gradient(90deg, ${BLUE}, ${MINT})`, transition: 'width .5s cubic-bezier(.2,.8,.2,1)' }} />
      </div>
      {goals.map(g => {
        const pg = g.page_id ? pagesById.get(g.page_id) : undefined
        return (
          <div key={g.id} className="sb-row" style={rowStyle}>
            <Check on={g.done} color={MINT} onClick={() => onSave(goals.map(x => x.id === g.id ? { ...x, done: !x.done } : x))} />
            <InlineText value={g.text} done={g.done} onSave={v => onSave(goals.map(x => x.id === g.id ? { ...x, text: v } : x))} />
            {pg && <button onClick={() => onOpen(pg.id)} title="open page" style={chip}>{pg.emoji} OPEN</button>}
            <button className="sb-x" onClick={() => onSave(goals.filter(x => x.id !== g.id))} style={xBtn}>✕</button>
          </div>
        )
      })}
      <input value={text} onChange={e => setText(e.target.value)} placeholder={goals.length ? '+ add a goal for this week' : '+ What has to be true by Sunday? (Enter)'}
        onKeyDown={e => { if (e.key === 'Enter' && text.trim()) { onAdd(text); setText('') } }} style={addInput} />
    </div>
  )
}

// ═══ TODAY'S PRIORITIES ═══
function PriosCard({ prios, onAdd, onToggle, onRemove }: { prios: Prio[]; onAdd: (t: string) => void; onToggle: (p: Prio) => void; onRemove: (p: Prio) => void }) {
  const [text, setText] = useState('')
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  return (
    <div style={card}>
      <div style={label}>◇ TODAY · PRIORITIES</div>
      <div style={{ fontSize: 12, color: DIM, marginTop: 3, marginBottom: 12 }}>{today}</div>
      {prios.map((p, i) => (
        <div key={p.id} className="sb-row" style={rowStyle}>
          <span style={{ fontFamily: MONO, fontSize: 10, width: 16, color: i < 3 ? '#fbbf24' : DIM, fontWeight: 700 }}>{i + 1}</span>
          <Check on={p.done} color="#fbbf24" onClick={() => onToggle(p)} />
          <span style={{ flex: 1, fontSize: 14, color: p.done ? DIM : '#e6f2ff', textDecoration: p.done ? 'line-through' : 'none' }}>{p.text}</span>
          <button className="sb-x" onClick={() => onRemove(p)} style={xBtn}>✕</button>
        </div>
      ))}
      {!prios.length && <div style={{ fontSize: 13, color: DIM, padding: '4px 0 8px' }}>Pick the 3 things that make today a win.</div>}
      <input value={text} onChange={e => setText(e.target.value)} placeholder="+ add priority (Enter)"
        onKeyDown={e => { if (e.key === 'Enter' && text.trim()) { onAdd(text); setText('') } }} style={addInput} />
    </div>
  )
}

// ═══ TILES ═══
function PageTile({ page, index, count, path, onOpen, onPrio, onPin, onDelete }: { page: Page; index: number; count: number; path: string; onOpen: () => void; onPrio: () => void; onPin: () => void; onDelete: () => void }) {
  const st = STATUS.find(s => s.key === page.status) || STATUS[0]
  const pr = page.priority ? PRIO[page.priority] : null
  return (
    <div onClick={onOpen} className="sb-tile" style={{
      position: 'relative', minHeight: 128, minWidth: 0, padding: '15px 14px 13px', borderRadius: 14, cursor: 'pointer',
      background: 'rgba(8,20,48,0.6)', border: '1px solid rgba(80,180,255,0.16)', borderLeft: `3px solid ${page.color}`,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between', animation: `sbCardIn .45s ${Math.min(index, 12) * 0.035}s both`,
      opacity: page.status === 'done' || page.status === 'archived' ? 0.62 : 1,
    }}>
      <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 4 }}>
        <button className={page.pinned ? '' : 'sb-act'} onClick={e => { e.stopPropagation(); onPin() }} title={page.pinned ? 'unpin' : 'pin to top'} style={{ ...iconBtn, color: page.pinned ? '#fbbf24' : DIM }}>{page.pinned ? '★' : '☆'}</button>
        <button className="sb-act" onClick={e => { e.stopPropagation(); onDelete() }} title="delete" style={{ ...iconBtn, color: 'rgba(255,120,120,0.7)' }}>✕</button>
      </div>
      <div>
        <div style={{ fontSize: 28, lineHeight: 1 }}>{page.emoji}</div>
        {path && <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 1, color: DIM, marginTop: 8 }}>{path.toUpperCase()}</div>}
        <div style={{ fontFamily: SANS, fontSize: 16.5, fontWeight: 600, color: '#f3f8ff', marginTop: 9, lineHeight: 1.25, paddingRight: 30 }}>{page.title}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
        <button onClick={e => { e.stopPropagation(); onPrio() }} title="priority (click to change)" style={{
          fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: 1, padding: '3px 7px', borderRadius: 6, cursor: 'pointer',
          color: pr ? pr.color : DIM, background: pr ? pr.color + '1f' : 'transparent', border: `1px solid ${pr ? pr.color + '66' : 'rgba(120,190,255,0.2)'}`,
        }}>{pr ? pr.label : 'P–'}</button>
        <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 1.2, color: st.color }}>● {st.label}</span>
        <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 8.5, letterSpacing: 1, color: DIM, whiteSpace: 'nowrap' }}>{count ? `${count} SUB · ` : ''}{ago(page.updated_at).toUpperCase()}</span>
      </div>
    </div>
  )
}

function SubTile({ page, count, onOpen }: { page: Page; count: number; onOpen: () => void }) {
  const pr = page.priority ? PRIO[page.priority] : null
  return (
    <button onClick={onOpen} className="sb-tile" style={{
      textAlign: 'left', minHeight: 64, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
      background: 'rgba(8,20,48,0.6)', border: '1px solid rgba(80,180,255,0.16)', borderLeft: `3px solid ${page.color}`,
      opacity: page.status === 'done' || page.status === 'archived' ? 0.6 : 1,
    }}>
      <span style={{ fontSize: 20 }}>{page.emoji}</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontFamily: SANS, fontSize: 13.5, fontWeight: 600, color: '#eef6ff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{page.title}</span>
        <span style={{ display: 'block', fontFamily: MONO, fontSize: 8.5, letterSpacing: 1, color: DIM, marginTop: 3 }}>
          {pr && <b style={{ color: pr.color }}>{pr.label} · </b>}{count ? `${count} SUB · ` : ''}{page.status.toUpperCase()}
        </span>
      </span>
    </button>
  )
}

// ═══ PAGE CONTROLS (in the editor header) ═══
function PageControls({ page, isMobile, inWeek, onPrio, onPatch, onDelete, onWeek }: { page: Page; isMobile: boolean; inWeek: boolean; onPrio: () => void; onPatch: (f: Partial<Page>) => void; onDelete: () => void; onWeek: () => void }) {
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close)
  }, [menu])
  const pr = page.priority ? PRIO[page.priority] : null
  const st = STATUS.find(s => s.key === page.status) || STATUS[0]
  return (
    <div ref={ref} style={{ position: 'relative', display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
      <button onClick={onPrio} title="priority" style={{ ...hdrBtn, color: pr ? pr.color : DIM, borderColor: pr ? pr.color + '66' : 'rgba(120,190,255,0.25)' }}>{pr ? pr.label : 'P–'}</button>
      {!isMobile && <button onClick={onWeek} title="add to this week's goals" style={{ ...hdrBtn, color: inWeek ? MINT : DIM, borderColor: inWeek ? MINT + '66' : 'rgba(120,190,255,0.25)' }}>{inWeek ? '✓ THIS WEEK' : '+ WEEK GOAL'}</button>}
      <button onClick={() => setMenu(m => !m)} style={{ ...hdrBtn, color: st.color }}>{isMobile ? '⋯' : `● ${st.label} ⋯`}</button>
      {menu && (
        <div style={{ position: 'absolute', top: '120%', right: 0, zIndex: 40, width: 260, padding: 12, borderRadius: 14, background: 'rgba(8,18,40,0.98)', border: '1px solid rgba(120,190,255,0.25)', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
          <div style={menuLabel}>STATUS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {STATUS.map(s => <button key={s.key} onClick={() => onPatch({ status: s.key })} style={{ ...hdrBtn, color: s.color, background: page.status === s.key ? 'rgba(80,180,255,0.14)' : 'transparent' }}>{s.label}</button>)}
          </div>
          {isMobile && <><div style={menuLabel}>WEEK</div><button onClick={onWeek} style={{ ...hdrBtn, color: inWeek ? MINT : '#cfe8ff' }}>{inWeek ? '✓ IN THIS WEEK — REMOVE' : '+ ADD AS WEEK GOAL'}</button></>}
          <div style={menuLabel}>ICON</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {EMOJIS.map(e => <button key={e} onClick={() => onPatch({ emoji: e })} style={{ fontSize: 17, padding: 4, borderRadius: 6, cursor: 'pointer', background: page.emoji === e ? 'rgba(80,180,255,0.18)' : 'transparent', border: 'none' }}>{e}</button>)}
          </div>
          <div style={menuLabel}>COLOR</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {COLORS.map(c => <button key={c} onClick={() => onPatch({ color: c })} style={{ width: 20, height: 20, borderRadius: 10, cursor: 'pointer', background: c, border: page.color === c ? '2px solid #fff' : '2px solid transparent' }} />)}
          </div>
          <div style={menuLabel}>PIN</div>
          <button onClick={() => onPatch({ pinned: !page.pinned })} style={{ ...hdrBtn, color: page.pinned ? '#fbbf24' : '#cfe8ff' }}>{page.pinned ? '★ PINNED — UNPIN' : '☆ PIN TO TOP'}</button>
          <div style={{ height: 1, background: 'rgba(120,190,255,0.15)', margin: '12px 0' }} />
          <button onClick={() => { setMenu(false); onDelete() }} style={{ ...hdrBtn, color: '#ff8a8a', borderColor: 'rgba(255,120,120,0.35)', width: '100%' }}>DELETE PAGE</button>
        </div>
      )}
    </div>
  )
}

// ═══ NEW PAGE ═══
function NewPageForm({ onCancel, onCreate }: { onCancel: () => void; onCreate: (f: Partial<Page>) => void }) {
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('📄')
  const [color, setColor] = useState('#80c0ff')
  const [priority, setPriority] = useState<number | null>(null)
  const go = () => title.trim() && onCreate({ title: title.trim(), emoji, color, priority })
  return (
    <div style={{ ...card, marginBottom: 16, animation: 'sbRise .3s both' }}>
      <div style={label}>◇ NEW PAGE</div>
      <input value={title} autoFocus onChange={e => setTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') go(); if (e.key === 'Escape') onCancel() }}
        placeholder="e.g. AI Dev, Shemagi land, Q1 Business plan"
        style={{ width: '100%', boxSizing: 'border-box', margin: '12px 0', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(120,190,255,0.22)', borderRadius: 10, padding: '11px 13px', color: '#f5f9ff', fontFamily: SANS, fontSize: 15, outline: 'none' }} />
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {EMOJIS.map(e => <button key={e} onClick={() => setEmoji(e)} style={{ fontSize: 17, padding: '6px 7px', borderRadius: 8, cursor: 'pointer', background: emoji === e ? 'rgba(80,180,255,0.18)' : 'rgba(0,0,0,0.25)', border: emoji === e ? '1px solid rgba(128,192,255,0.6)' : '1px solid rgba(80,180,255,0.12)' }}>{e}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 6 }}>{COLORS.map(c => <button key={c} onClick={() => setColor(c)} style={{ width: 22, height: 22, borderRadius: 11, cursor: 'pointer', background: c, border: color === c ? '2px solid #fff' : '2px solid transparent' }} />)}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 2, 3].map(n => <button key={n} onClick={() => setPriority(priority === n ? null : n)} style={{ ...hdrBtn, color: PRIO[n].color, background: priority === n ? PRIO[n].color + '22' : 'transparent', borderColor: priority === n ? PRIO[n].color : 'rgba(120,190,255,0.25)' }}>{PRIO[n].label}</button>)}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={ghostBtn}>CANCEL</button>
          <button onClick={go} style={primaryBtn}>CREATE</button>
        </div>
      </div>
    </div>
  )
}

// ═══ small parts ═══
function Check({ on, color, onClick }: { on: boolean; color: string; onClick: () => void }) {
  return <button onClick={onClick} style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#04121f', background: on ? color : 'transparent', border: `1.5px solid ${on ? color : 'rgba(140,190,240,0.4)'}`, transition: 'all .15s' }}>{on ? '✓' : ''}</button>
}
function InlineText({ value, done, onSave }: { value: string; done: boolean; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <input value={v} onChange={e => setV(e.target.value)} onBlur={() => v.trim() && v !== value && onSave(v.trim())} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', fontFamily: SANS, fontSize: 14, color: done ? DIM : '#e6f2ff', textDecoration: done ? 'line-through' : 'none', padding: 0 }} />
}

const card: React.CSSProperties = { minWidth: 0, padding: '18px 18px 14px', borderRadius: 16, background: 'linear-gradient(160deg, rgba(10,26,58,0.75), rgba(4,12,30,0.75))', border: '1px solid rgba(120,190,255,0.18)', boxShadow: 'inset 0 1px 0 rgba(160,220,255,0.05)' }
const label: React.CSSProperties = { fontFamily: MONO, fontSize: 10, letterSpacing: 2.5, color: '#9fd3ff', fontWeight: 700 }
const menuLabel: React.CSSProperties = { fontFamily: MONO, fontSize: 8.5, letterSpacing: 2, color: DIM, margin: '12px 0 6px' }
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 2px', borderBottom: '1px solid rgba(120,190,255,0.07)' }
const addInput: React.CSSProperties = { width: '100%', boxSizing: 'border-box', marginTop: 8, background: 'transparent', border: 'none', borderBottom: '1px dashed rgba(120,190,255,0.22)', outline: 'none', padding: '8px 2px', color: '#e6f2ff', fontFamily: SANS, fontSize: 13.5 }
const xBtn: React.CSSProperties = { opacity: 0, background: 'transparent', border: 'none', color: 'rgba(255,120,120,0.7)', cursor: 'pointer', fontSize: 12, padding: 2, transition: 'opacity .15s' }
const chip: React.CSSProperties = { fontFamily: MONO, fontSize: 8.5, letterSpacing: 1, padding: '3px 7px', borderRadius: 6, cursor: 'pointer', color: '#cfe8ff', background: 'rgba(80,180,255,0.08)', border: '1px solid rgba(120,190,255,0.22)', whiteSpace: 'nowrap' }
const iconBtn: React.CSSProperties = { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, padding: 3 }
const crumbBtn: React.CSSProperties = { background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5, color: DIM, padding: '2px 0' }
const hdrBtn: React.CSSProperties = { fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.2, fontWeight: 700, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px solid rgba(120,190,255,0.25)', whiteSpace: 'nowrap' }
const primaryBtn: React.CSSProperties = { fontFamily: MONO, fontSize: 10, letterSpacing: 2, fontWeight: 700, padding: '8px 15px', borderRadius: 9, cursor: 'pointer', color: MINT, background: 'rgba(52,211,153,0.14)', border: '1px solid rgba(52,211,153,0.5)' }
const ghostBtn: React.CSSProperties = { fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, padding: '8px 14px', borderRadius: 9, cursor: 'pointer', color: '#cfe8ff', background: 'rgba(80,180,255,0.08)', border: '1px solid rgba(120,200,255,0.25)' }
const suggBtn: React.CSSProperties = { fontFamily: SANS, fontSize: 13.5, padding: '9px 14px', borderRadius: 10, cursor: 'pointer', color: '#e6f2ff', background: 'rgba(80,180,255,0.07)', border: '1px solid rgba(120,190,255,0.22)' }
