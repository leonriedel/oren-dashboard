'use client'
import React, { useCallback, useEffect, useState } from 'react'
import { TYPE_COLORS } from '@/components/secondbrain/KnowledgeGraph'

// SECONDBRAIN · process inbox — one card at a time, OREN suggests, keys 1–4

export type InboxNote = {
  id: string; type: string; title: string; body: string | null; summary: string | null; tags: string[]
  created_at: string; project: string | null; due: string | null; next_action: string | null; suggestion: string | null
}
type Note = InboxNote

const MONO = 'Space Mono, monospace'
const BLUE = '#80c0ff', GOLD = '#fbbf24', MINT = '#34d399', RED = '#f87171'
const DIM = 'rgba(120,180,230,0.5)'
const TYPE_ICON: Record<string, string> = { idea: '✦', note: '▤', link: '↗', task: '◉', goal: '◎', person: '☺', quote: '❝' }
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'now'; if (m < 60) return `${m}m`; const h = Math.round(m / 60); if (h < 24) return `${h}h`
  const d = Math.round(h / 24); return d < 30 ? `${d}d` : new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}
function fmtDue(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
}
const field: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: 'rgba(6,16,38,0.6)', border: '1px solid rgba(80,180,255,0.16)', borderRadius: 9,
  padding: '9px 12px', color: '#d8eaff', fontSize: 12.5, outline: 'none', fontFamily: 'DM Sans, system-ui, sans-serif',
}

// ─── process inbox (focus mode) ───
export default function ProcessInbox({ items, projectNames, onClose, onToday, onProject, onKeep, onDrop }: {
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

