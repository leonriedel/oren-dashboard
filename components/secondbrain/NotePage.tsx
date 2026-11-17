'use client'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { TYPE_COLORS } from '@/components/secondbrain/KnowledgeGraph'

/**
 * SECONDBRAIN · NOTE PAGE
 * Every note is a page to think in: structured template per type, markdown
 * writing with checklists, autosave, and OREN as a thinking partner.
 */

export type PageNote = {
  id: string; type: string; title: string; body: string | null; url: string | null; summary: string | null
  tags: string[]; related: string[]; pinned: boolean; created_at: string
  status: string; project: string | null; due: string | null; next_action: string | null
}

interface Props {
  n: PageNote
  notes: PageNote[]
  projectNames: string[]
  isAdmin: boolean
  isMobile: boolean
  getToken: () => Promise<string | undefined>
  onClose: () => void
  onPatch: (p: Partial<PageNote>) => void
  onDelete: () => void
  onToday: () => void
  onOpen: (id: string) => void
  onTag: (t: string) => void
}

const MONO = 'Space Mono, monospace'
const BLUE = '#80c0ff', GOLD = '#fbbf24', MINT = '#34d399', RED = '#f87171'
const DIM = 'rgba(120,180,230,0.5)'
const ICON: Record<string, string> = { idea: '✦', note: '▤', link: '↗', task: '◉', goal: '◎', person: '☺', quote: '❝' }

const TEMPLATES: Record<string, string[]> = {
  idea: ['The idea', 'Why it matters', 'How it could work', 'Risks & open questions', 'Next step'],
  goal: ['Why I want this', 'What success looks like', 'Milestones', 'Obstacles', 'This week'],
  task: ['Context', 'Steps', 'Done when'],
  person: ['Who', 'How we know each other', 'Last conversation', 'Follow-ups'],
  link: ['Key points', 'My thoughts', 'How I can use this'],
  quote: ['Why it resonates', 'Where it applies in my life'],
  note: ['Key points', 'My thoughts', 'How I can use this'],
}
const CHECK_SECTIONS = new Set(['Next step', 'Milestones', 'This week', 'Steps', 'Follow-ups'])

function buildTemplate(type: string, seed: string) {
  const secs = TEMPLATES[type] || TEMPLATES.note
  return secs.map((s, i) => {
    const content = i === 0 && seed ? seed : CHECK_SECTIONS.has(s) ? '- [ ] ' : ''
    return `## ${s}\n${content}`
  }).join('\n\n') + '\n'
}

function initialBody(n: PageNote) {
  const body = (n.body || '').trim()
  if (/^#{1,3} /m.test(body) || body.length > 400) return body
  const seed = body && body !== n.title ? body : ''
  return buildTemplate(n.type, seed)
}

export function checklistProgress(body: string | null) {
  const all = (body || '').match(/^\s*- \[( |x|X)\]/gm) || []
  const done = all.filter(x => /\[x\]/i.test(x)).length
  return { done, total: all.length }
}

export default function NotePage({ n, notes, projectNames, isAdmin, isMobile, getToken, onClose, onPatch, onDelete, onToday, onOpen, onTag }: Props) {
  const [title, setTitle] = useState(n.title)
  const [body, setBody] = useState(() => initialBody(n))
  const [mode, setMode] = useState<'write' | 'read'>('write')
  const [saved, setSaved] = useState<'saved' | 'saving' | 'idle'>('idle')
  const [thinking, setThinking] = useState<string | null>(null)
  const [project, setProject] = useState(n.project || '')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const dirty = useRef(false)
  const c = TYPE_COLORS[n.type] || BLUE

  // reset when switching note
  useEffect(() => {
    setTitle(n.title); setBody(initialBody(n)); setProject(n.project || ''); dirty.current = false; setSaved('idle')
    setMode(/^#{1,3} /m.test(n.body || '') && (n.body || '').length > 60 ? 'read' : 'write')
  }, [n.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // autosave
  useEffect(() => {
    if (!dirty.current) return
    setSaved('saving')
    const t = setTimeout(() => { onPatch({ title: title.trim() || n.title, body }); setSaved('saved') }, 700)
    return () => clearTimeout(t)
  }, [title, body]) // eslint-disable-line react-hooks/exhaustive-deps

  // auto-grow textarea
  useEffect(() => {
    const ta = taRef.current; if (!ta) return
    ta.style.height = 'auto'; ta.style.height = `${Math.max(ta.scrollHeight, 360)}px`
  }, [body, mode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const edit = (v: string) => { dirty.current = true; setBody(v) }
  const progress = checklistProgress(body)
  const words = useMemo(() => body.replace(/^#+ .*$/gm, '').split(/\s+/).filter(w => w && w !== '-' && w !== '[' && w !== ']').length, [body])
  const related = n.related.map(id => notes.find(x => x.id === id)).filter(Boolean) as PageNote[]

  function insert(snippet: string) {
    setMode('write')
    const ta = taRef.current
    if (!ta) { edit(body + snippet); return }
    const s = ta.selectionStart ?? body.length, e = ta.selectionEnd ?? body.length
    const before = body.slice(0, s), after = body.slice(e)
    const pre = before && !before.endsWith('\n') ? '\n' : ''
    const next = before + pre + snippet + after
    edit(next)
    requestAnimationFrame(() => { ta.focus(); const p = (before + pre + snippet).length; ta.setSelectionRange(p, p) })
  }

  function toggleCheck(lineIdx: number) {
    const lines = body.split('\n')
    const l = lines[lineIdx]
    lines[lineIdx] = /- \[ \]/.test(l) ? l.replace('- [ ]', '- [x]') : l.replace(/- \[[xX]\]/, '- [ ]')
    edit(lines.join('\n'))
  }

  async function think(m: 'questions' | 'expand' | 'challenge' | 'plan') {
    setThinking(m)
    try {
      const t = await getToken()
      const r = await fetch('/api/brain/think', {
        method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ noteId: n.id, mode: m, title, body }),
      })
      const j = await r.json()
      if (j.markdown) {
        const label = { questions: 'Questions to think about', expand: 'Ideas to build on', challenge: 'Devil\'s advocate', plan: 'Action plan' }[m]
        edit(`${body.trimEnd()}\n\n### ✦ OREN · ${label}\n${j.markdown}\n`)
        setMode('read')
      }
    } catch { /* noop */ } finally { setThinking(null) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'radial-gradient(ellipse at 30% 0%, rgba(14,34,72,0.97), rgba(2,6,16,0.985) 70%)', backdropFilter: 'blur(14px)', overflowY: 'auto', animation: 'sbFade .2s' }}>
      {/* top bar */}
      <div style={{ position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 12, padding: isMobile ? '12px 16px' : '14px 32px', background: 'linear-gradient(180deg, rgba(4,12,30,0.95), rgba(4,12,30,0.6))', borderBottom: '1px solid rgba(80,180,255,0.08)', backdropFilter: 'blur(10px)' }}>
        <button onClick={onClose} style={ghost}>‹ BACK</button>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 2, color: c, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {n.project ? `${n.project.toUpperCase()} / ` : ''}{ICON[n.type]} {n.type.toUpperCase()}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1.5, color: saved === 'saving' ? GOLD : 'rgba(120,180,230,0.4)' }}>
          {saved === 'saving' ? 'SAVING…' : saved === 'saved' ? 'SAVED ✓' : `${words} WORDS`}
        </span>
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 9, padding: 3 }}>
          {(['write', 'read'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5, padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer', background: mode === m ? 'rgba(80,180,255,0.2)' : 'transparent', color: mode === m ? '#dff0ff' : DIM }}>{m.toUpperCase()}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? '20px 16px 80px' : '36px 32px 100px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap: isMobile ? 24 : 40, alignItems: 'start' }}>

        {/* ── writing column ── */}
        <div style={{ minWidth: 0 }}>
          <input value={title} onChange={e => { dirty.current = true; setTitle(e.target.value) }} style={{
            width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#f6faff',
            fontSize: isMobile ? 26 : 36, fontWeight: 700, letterSpacing: -0.5, fontFamily: 'DM Sans, system-ui, sans-serif', padding: 0,
          }} />
          {n.summary && <div style={{ fontSize: 15, color: 'rgba(200,225,250,0.6)', marginTop: 8, lineHeight: 1.6, fontStyle: 'italic' }}>{n.summary}</div>}
          {n.url && <a href={n.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 10, fontFamily: MONO, fontSize: 11, color: TYPE_COLORS.link, textDecoration: 'none', wordBreak: 'break-all' }}>↗ {n.url}</a>}

          {progress.total > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
              <div style={{ flex: 1, maxWidth: 260, height: 4, borderRadius: 2, background: 'rgba(80,180,255,0.1)', overflow: 'hidden' }}>
                <div style={{ width: `${(progress.done / progress.total) * 100}%`, height: '100%', background: MINT, boxShadow: `0 0 8px ${MINT}`, transition: 'width .3s' }} />
              </div>
              <span style={{ fontFamily: MONO, fontSize: 10, color: MINT }}>{progress.done}/{progress.total}</span>
            </div>
          )}

          {/* toolbar */}
          <div style={{ display: 'flex', gap: 6, marginTop: 22, flexWrap: 'wrap', borderBottom: '1px solid rgba(80,180,255,0.08)', paddingBottom: 12 }}>
            <button style={tool} onClick={() => insert('## ')}>H  Section</button>
            <button style={tool} onClick={() => insert('- [ ] ')}>☐  Checklist</button>
            <button style={tool} onClick={() => insert('- ')}>•  List</button>
            <button style={tool} onClick={() => insert('> ')}>❝  Quote</button>
            <button style={tool} onClick={() => insert(`\n---\n**${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}** · `)}>◷  Log entry</button>
            {!/^## /m.test(body) && <button style={{ ...tool, color: GOLD, borderColor: 'rgba(251,191,36,0.35)' }} onClick={() => edit(buildTemplate(n.type, body.trim()))}>✦  Structure</button>}
          </div>

          {mode === 'write' ? (
            <textarea
              ref={taRef} value={body} onChange={e => edit(e.target.value)} spellCheck
              placeholder="Start thinking…"
              style={{
                width: '100%', marginTop: 16, background: 'transparent', border: 'none', outline: 'none', resize: 'none', overflow: 'hidden',
                color: '#dbe9fb', fontSize: 16, lineHeight: 1.8, fontFamily: 'DM Sans, system-ui, sans-serif', minHeight: 360, caretColor: c,
              }}
            />
          ) : (
            <div onDoubleClick={() => setMode('write')} style={{ marginTop: 16, minHeight: 300 }}>
              <Markdown text={body} onToggle={toggleCheck} accent={c} />
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1.5, color: 'rgba(120,180,230,0.3)', marginTop: 30 }}>DOUBLE-CLICK TO WRITE</div>
            </div>
          )}
        </div>

        {/* ── side column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: isMobile ? 'static' : 'sticky', top: 80 }}>
          {isAdmin && (
            <Side title="THINK WITH OREN" color={MINT}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {([['questions', '? Ask me'], ['expand', '✦ Expand'], ['challenge', '⚔ Challenge'], ['plan', '☐ Plan it']] as const).map(([m, l]) => (
                  <button key={m} disabled={!!thinking} onClick={() => think(m)} style={{
                    padding: '10px 8px', borderRadius: 10, cursor: thinking ? 'wait' : 'pointer', fontSize: 12, color: thinking === m ? '#04101f' : '#dff7ec',
                    background: thinking === m ? MINT : 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.3)', transition: 'all .2s',
                  }}>{thinking === m ? 'thinking…' : l}</button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: DIM, marginTop: 8, lineHeight: 1.45 }}>OREN reads this page and its connections, then writes below your text.</div>
            </Side>
          )}

          <Side title="DETAILS" color={c}>
            <Field label="STATUS">
              <select value={n.status} onChange={e => onPatch({ status: e.target.value })} style={input}>
                {['inbox', 'active', 'reference', 'done', 'archived'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="TYPE">
              <select value={n.type} onChange={e => onPatch({ type: e.target.value })} style={input}>
                {Object.keys(ICON).map(t => <option key={t} value={t}>{ICON[t]} {t}</option>)}
              </select>
            </Field>
            <Field label="PROJECT">
              <input list="np-projects" value={project} onChange={e => setProject(e.target.value)} onBlur={() => project !== (n.project || '') && onPatch({ project: project.trim() || null })} placeholder="none" style={input} />
              <datalist id="np-projects">{projectNames.map(p => <option key={p} value={p} />)}</datalist>
            </Field>
            <Field label="DUE">
              <input type="date" value={n.due || ''} onChange={e => onPatch({ due: e.target.value || null })} style={{ ...input, colorScheme: 'dark' }} />
            </Field>
            {n.next_action && <Field label="NEXT"><span style={{ fontSize: 12.5, color: '#fff3d0', lineHeight: 1.4 }}>{n.next_action}</span></Field>}
            {n.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
                {n.tags.map(t => <span key={t} onClick={() => onTag(t)} style={{ fontFamily: MONO, fontSize: 9.5, padding: '3px 9px', borderRadius: 20, cursor: 'pointer', color: '#bfe0ff', border: '1px solid rgba(191,224,255,0.25)' }}>#{t}</span>)}
              </div>
            )}
          </Side>

          {related.length > 0 && (
            <Side title="CONNECTED" color={BLUE}>
              {related.map(r => (
                <div key={r.id} onClick={() => onOpen(r.id)} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 0', cursor: 'pointer', borderTop: '1px solid rgba(80,180,255,0.06)' }}>
                  <span style={{ color: TYPE_COLORS[r.type], fontSize: 11, width: 14 }}>{ICON[r.type]}</span>
                  <span style={{ flex: 1, fontSize: 12.5, color: '#cfe4fa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
                </div>
              ))}
            </Side>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button style={{ ...act, color: GOLD, borderColor: 'rgba(251,191,36,0.35)' }} onClick={onToday}>→ TODAY</button>
            <button style={{ ...act, ...(n.pinned ? { color: GOLD } : {}) }} onClick={() => onPatch({ pinned: !n.pinned })}>{n.pinned ? '★ PINNED' : '☆ PIN'}</button>
            {n.status !== 'done' && <button style={{ ...act, color: MINT, borderColor: 'rgba(52,211,153,0.35)' }} onClick={() => onPatch({ status: 'done' })}>✓ DONE</button>}
            <button style={{ ...act, color: RED, borderColor: 'rgba(248,113,113,0.3)' }} onClick={() => { if (confirmDelete()) onDelete() }}>DELETE</button>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: 'rgba(120,180,230,0.3)', letterSpacing: 1 }}>CREATED {new Date(n.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).toUpperCase()}</div>
        </div>
      </div>
    </div>
  )
}

function confirmDelete() {
  try { return window.confirm('Delete this page permanently?') } catch { return true }
}

// ─── tiny markdown renderer (headings, checklists, lists, quotes, hr, bold/italic/code/links) ───
function Markdown({ text, onToggle, accent }: { text: string; onToggle: (line: number) => void; accent: string }) {
  const lines = text.split('\n')
  const out: React.ReactNode[] = []
  lines.forEach((raw, i) => {
    const l = raw.replace(/\s+$/, '')
    let m: RegExpMatchArray | null
    if (!l.trim()) { out.push(<div key={i} style={{ height: 10 }} />); return }
    if (/^---+$/.test(l.trim())) { out.push(<div key={i} style={{ height: 1, background: 'rgba(80,180,255,0.12)', margin: '14px 0' }} />); return }
    if ((m = l.match(/^(#{1,3}) (.*)$/))) {
      const lvl = m[1].length, oren = m[2].startsWith('✦ OREN')
      out.push(<div key={i} style={{
        fontSize: lvl === 1 ? 26 : lvl === 2 ? 19 : 14, fontWeight: lvl === 3 ? 700 : 650, color: oren ? MINT : '#f2f8ff',
        marginTop: i === 0 ? 0 : lvl === 3 ? 18 : 26, marginBottom: 6, letterSpacing: lvl === 3 ? 1 : 0,
        fontFamily: lvl === 3 ? MONO : 'DM Sans, system-ui, sans-serif', textTransform: lvl === 3 ? 'uppercase' : 'none',
        borderLeft: lvl === 2 ? `2px solid ${accent}` : oren ? `2px solid ${MINT}` : 'none', paddingLeft: lvl === 2 || oren ? 10 : 0,
      }}>{inline(m[2])}</div>)
      return
    }
    if ((m = l.match(/^(\s*)- \[( |x|X)\] ?(.*)$/))) {
      const done = m[2] !== ' '
      out.push(<div key={i} onClick={() => onToggle(i)} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '4px 0', paddingLeft: m[1].length * 10, cursor: 'pointer' }}>
        <span style={{ width: 17, height: 17, marginTop: 4, borderRadius: 5, flexShrink: 0, border: `1.5px solid ${done ? MINT : 'rgba(128,192,255,0.45)'}`, background: done ? 'rgba(52,211,153,0.25)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: MINT, fontSize: 10 }}>{done ? '✓' : ''}</span>
        <span style={{ fontSize: 16, lineHeight: 1.7, color: done ? 'rgba(160,190,225,0.45)' : '#dbe9fb', textDecoration: done ? 'line-through' : 'none' }}>{inline(m[3]) || <span style={{ color: 'rgba(120,180,230,0.3)' }}>…</span>}</span>
      </div>)
      return
    }
    if ((m = l.match(/^(\s*)([-*]|\d+\.) (.*)$/))) {
      out.push(<div key={i} style={{ display: 'flex', gap: 10, padding: '2px 0', paddingLeft: m[1].length * 10 }}>
        <span style={{ color: accent, fontSize: 14, lineHeight: 1.8, minWidth: 14 }}>{/\d/.test(m[2]) ? m[2] : '•'}</span>
        <span style={{ fontSize: 16, lineHeight: 1.75, color: '#dbe9fb' }}>{inline(m[3])}</span>
      </div>)
      return
    }
    if ((m = l.match(/^> ?(.*)$/))) {
      out.push(<div key={i} style={{ borderLeft: '2px solid rgba(191,224,255,0.3)', paddingLeft: 14, margin: '6px 0', fontSize: 16, lineHeight: 1.7, color: 'rgba(210,230,250,0.75)', fontStyle: 'italic' }}>{inline(m[1])}</div>)
      return
    }
    out.push(<div key={i} style={{ fontSize: 16, lineHeight: 1.8, color: '#dbe9fb' }}>{inline(l)}</div>)
  })
  return <>{out}</>
}

function inline(s: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g
  let last = 0, m: RegExpExecArray | null, k = 0
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push(s.slice(last, m.index))
    const t = m[0]
    if (t.startsWith('**')) parts.push(<b key={k++} style={{ color: '#fff', fontWeight: 650 }}>{t.slice(2, -2)}</b>)
    else if (t.startsWith('`')) parts.push(<code key={k++} style={{ fontFamily: MONO, fontSize: '0.85em', padding: '1px 5px', borderRadius: 4, background: 'rgba(80,180,255,0.1)' }}>{t.slice(1, -1)}</code>)
    else if (t.startsWith('[')) { const mm = t.match(/\[([^\]]+)\]\(([^)]+)\)/)!; parts.push(<a key={k++} href={mm[2]} target="_blank" rel="noreferrer" style={{ color: '#9fd4ff' }}>{mm[1]}</a>) }
    else parts.push(<i key={k++}>{t.slice(1, -1)}</i>)
    last = m.index + t.length
  }
  if (last < s.length) parts.push(s.slice(last))
  return parts
}

function Side({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 16, borderRadius: 14, background: 'rgba(10,24,54,0.5)', border: '1px solid rgba(80,180,255,0.12)' }}>
      <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 2.5, fontWeight: 700, color, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />{title}
      </div>
      {children}
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: 1.5, color: DIM }}>{label}</span>
      {children}
    </div>
  )
}
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'rgba(6,16,38,0.7)', border: '1px solid rgba(80,180,255,0.16)', borderRadius: 8, padding: '6px 9px', color: '#d8eaff', fontSize: 12.5, outline: 'none', fontFamily: 'DM Sans, system-ui, sans-serif' }
const ghost: React.CSSProperties = { fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, padding: '6px 12px', borderRadius: 9, cursor: 'pointer', color: '#cfe8ff', background: 'rgba(80,180,255,0.08)', border: '1px solid rgba(120,200,255,0.25)' }
const tool: React.CSSProperties = { fontFamily: MONO, fontSize: 10, letterSpacing: 0.5, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', color: 'rgba(190,220,250,0.75)', background: 'rgba(80,180,255,0.05)', border: '1px solid rgba(80,180,255,0.15)' }
const act: React.CSSProperties = { fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5, padding: '8px 12px', borderRadius: 9, cursor: 'pointer', color: 'rgba(190,220,250,0.8)', background: 'rgba(80,180,255,0.06)', border: '1px solid rgba(80,180,255,0.2)' }
