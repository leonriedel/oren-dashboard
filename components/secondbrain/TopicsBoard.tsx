'use client'
import React, { useState } from 'react'

/**
 * SECONDBRAIN · TOPICS BOARD
 * All topics ranked by heat (priority + deadlines + momentum + today's focus).
 * Each topic: priority, focus toggle, next action, open tasks, and today's noteboard.
 */

export type TopicItem = { id: string; type: string; title: string; status: string; due: string | null; next_action: string | null }
export type TopicView = {
  name: string; priority: number; status: string; heat: number; focus: boolean; color: string
  open: TopicItem[]; overdue: number; dueToday: number; total: number; last: string | null
  next: string | null; board: { id: string; done: number; total: number } | null
}

interface Props {
  topics: TopicView[]
  maxHeat: number
  height: number | 'auto'
  onCyclePrio: (name: string) => void
  onToggleFocus: (name: string) => void
  onTogglePause: (name: string) => void
  onOpenBoard: (name: string) => void
  onOpenNote: (id: string) => void
  onDoneTask: (id: string) => void
  onAddTopic: (name: string) => void
}

const MONO = 'Space Mono, monospace'
const GOLD = '#fbbf24', MINT = '#34d399', RED = '#f87171', BLUE = '#80c0ff'
const DIM = 'rgba(120,180,230,0.5)'
const PRIO: Record<number, { label: string; color: string }> = { 1: { label: 'P1', color: '#ff7a59' }, 2: { label: 'P2', color: GOLD }, 3: { label: 'P3', color: 'rgba(150,190,230,0.6)' } }
const ICON: Record<string, string> = { idea: '✦', note: '▤', link: '↗', task: '◉', goal: '◎', person: '☺', quote: '❝' }

const ago = (iso: string | null) => {
  if (!iso) return '—'
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600000)
  if (h < 1) return 'now'; if (h < 24) return `${h}h`; return `${Math.round(h / 24)}d`
}

export default function TopicsBoard({ topics, maxHeat, height, onCyclePrio, onToggleFocus, onTogglePause, onOpenBoard, onOpenNote, onDoneTask, onAddTopic }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState('')
  const focus = topics.filter(t => t.focus && t.status !== 'paused')
  const rest = topics.filter(t => !t.focus && t.status !== 'paused')
  const paused = topics.filter(t => t.status === 'paused')

  const card = (t: TopicView, rank: number) => {
    const p = PRIO[t.priority] || PRIO[2]
    const pct = maxHeat > 0 ? Math.max(0.06, t.heat / maxHeat) : 0
    const hot = pct > 0.66
    const expanded = open === t.name
    return (
      <div key={t.name} style={{
        position: 'relative', borderRadius: 14, overflow: 'hidden', marginBottom: 10,
        background: t.focus ? `linear-gradient(135deg, ${t.color}22, rgba(8,20,46,0.7) 60%)` : 'rgba(8,20,46,0.55)',
        border: `1px solid ${t.focus ? t.color + '66' : 'rgba(80,180,255,0.12)'}`,
        boxShadow: t.focus ? `0 0 26px ${t.color}22` : 'none', transition: 'border-color .2s',
      }}>
        {/* heat bar */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${hot ? '#ff7a59' : t.color}, transparent)`, opacity: 0.4 + pct * 0.6 }} />
        <div style={{ padding: '12px 14px 12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(120,180,230,0.35)', width: 16 }}>{String(rank).padStart(2, '0')}</span>
            <span onClick={() => setOpen(expanded ? null : t.name)} style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: '#f2f8ff', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.name}
            </span>
            <span title="heat" style={{ display: 'flex', gap: 2, alignItems: 'flex-end' }}>
              {[0.2, 0.45, 0.7, 0.9].map((th, k) => (
                <span key={k} style={{ width: 4, height: 6 + k * 3, borderRadius: 1, background: pct >= th ? (hot ? '#ff7a59' : GOLD) : 'rgba(80,180,255,0.12)', boxShadow: pct >= th && hot ? '0 0 6px #ff7a59' : 'none' }} />
              ))}
            </span>
            <button onClick={() => onCyclePrio(t.name)} title="change priority" style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, padding: '3px 7px', borderRadius: 7, cursor: 'pointer', color: p.color, background: 'rgba(0,0,0,0.25)', border: `1px solid ${p.color}55` }}>{p.label}</button>
            <button onClick={() => onToggleFocus(t.name)} title="focus today" style={{ width: 28, height: 26, borderRadius: 8, cursor: 'pointer', fontSize: 13, background: t.focus ? 'rgba(251,191,36,0.22)' : 'rgba(0,0,0,0.2)', border: `1px solid ${t.focus ? 'rgba(251,191,36,0.6)' : 'rgba(80,180,255,0.15)'}`, filter: t.focus ? 'none' : 'grayscale(1) brightness(2.2)', opacity: t.focus ? 1 : 0.55 }}>☀</button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 7, paddingLeft: 25 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: t.next ? 'rgba(220,235,252,0.8)' : DIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.next ? <>→ {t.next}</> : 'no next action yet'}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: DIM, whiteSpace: 'nowrap' }}>
              {t.overdue > 0 && <b style={{ color: RED }}>{t.overdue} LATE · </b>}
              {t.dueToday > 0 && <b style={{ color: GOLD }}>{t.dueToday} TODAY · </b>}
              {t.open.length} OPEN · {ago(t.last)}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingLeft: 25 }}>
            <button onClick={() => onOpenBoard(t.name)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '7px 11px', borderRadius: 9, cursor: 'pointer',
              background: t.board ? `${t.color}18` : 'rgba(80,180,255,0.05)', border: `1px solid ${t.board ? t.color + '55' : 'rgba(80,180,255,0.16)'}`, color: '#e6f2ff',
            }}>
              <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5 }}>▦ {t.board ? "TODAY'S BOARD" : 'START TODAY’S BOARD'}</span>
              {t.board && t.board.total > 0 && <span style={{ fontFamily: MONO, fontSize: 9.5, color: t.board.done === t.board.total ? MINT : GOLD }}>{t.board.done}/{t.board.total}</span>}
            </button>
            <button onClick={() => setOpen(expanded ? null : t.name)} style={{ padding: '7px 10px', borderRadius: 9, cursor: 'pointer', fontFamily: MONO, fontSize: 9.5, color: 'rgba(190,220,250,0.75)', background: 'rgba(80,180,255,0.05)', border: '1px solid rgba(80,180,255,0.16)' }}>{expanded ? '▴' : '▾'} {t.total}</button>
          </div>

          {expanded && (
            <div style={{ marginTop: 10, paddingLeft: 25, animation: 'sbFade .2s' }}>
              {t.open.length === 0 && <div style={{ fontSize: 12, color: DIM, padding: '4px 0' }}>No open tasks in this topic.</div>}
              {t.open.slice(0, 8).map(it => (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0', borderTop: '1px solid rgba(80,180,255,0.06)' }}>
                  <span onClick={() => onDoneTask(it.id)} title="done" style={{ width: 15, height: 15, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', border: `1.5px solid ${it.due && it.due < new Date().toISOString().slice(0, 10) ? RED : 'rgba(128,192,255,0.45)'}` }} />
                  <span onClick={() => onOpenNote(it.id)} style={{ flex: 1, fontSize: 12.5, color: '#dcecff', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.next_action || it.title}</span>
                  {it.due && <span style={{ fontFamily: MONO, fontSize: 9, color: DIM }}>{it.due.slice(5)}</span>}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button onClick={() => onTogglePause(t.name)} style={miniBtn}>{t.status === 'paused' ? '▶ RESUME' : '❚❚ PAUSE TOPIC'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height, borderRadius: 22, overflow: 'hidden', border: '1px solid rgba(80,180,255,0.12)', background: 'linear-gradient(180deg, rgba(10,24,54,0.6), rgba(4,12,30,0.55))', backdropFilter: 'blur(14px)' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(80,180,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: 2.5, color: '#dff0ff', fontWeight: 700 }}>TOPICS</div>
          <div style={{ fontSize: 11, color: DIM, marginTop: 1 }}>ranked by heat · ☀ = today&apos;s focus</div>
        </div>
        <input value={adding} onChange={e => setAdding(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && adding.trim()) { onAddTopic(adding.trim()); setAdding('') } }}
          placeholder="+ new topic" style={{ width: 130, background: 'rgba(4,12,30,0.7)', border: '1px solid rgba(120,200,255,0.2)', borderRadius: 9, padding: '6px 10px', color: '#e8f3ff', fontSize: 12, outline: 'none' }} />
      </div>
      <div className="sb-scroll" style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 6px' }}>
        {topics.length === 0 && (
          <div style={{ fontSize: 13, color: DIM, lineHeight: 1.6, padding: 8 }}>
            Noch keine Themen. Erzähl OREN rechts, woran du arbeitest — er ordnet alles Themen zu. Oder leg oben eins an (z. B. <i>Edgar</i>, <i>OREN</i>, <i>Villa</i>).
          </div>
        )}
        {focus.length > 0 && <Label color={GOLD}>☀ TODAY&apos;S FOCUS</Label>}
        {focus.map((t, i) => card(t, i + 1))}
        {rest.length > 0 && focus.length > 0 && <Label color={BLUE}>ALL TOPICS</Label>}
        {rest.map((t, i) => card(t, focus.length + i + 1))}
        {paused.length > 0 && <Label color={DIM}>PAUSED</Label>}
        {paused.map((t, i) => card(t, focus.length + rest.length + i + 1))}
      </div>
    </div>
  )
}

function Label({ children, color }: { children: React.ReactNode; color: string }) {
  return <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 2.5, color, margin: '4px 2px 8px' }}>{children}</div>
}
const miniBtn: React.CSSProperties = { fontFamily: MONO, fontSize: 9, letterSpacing: 1, padding: '5px 9px', borderRadius: 7, cursor: 'pointer', color: 'rgba(190,220,250,0.7)', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(80,180,255,0.16)' }
