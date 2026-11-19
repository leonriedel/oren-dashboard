'use client'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isMikha, MBadge } from '@/components/thinkspace/mikha'
import { useIsMobile } from '@/lib/useIsMobile'

/**
 * THINKSPACE · BOARD EDITOR (Notion-style)
 * Sections (collapsible super-headings) → toggles (collapsible items with status) → content blocks:
 * text, heading, to-do, bullet, link card, image gallery, details table, callout, divider.
 * Everything nests via parent_id; open/closed state is remembered per viewer.
 */

type BType = 'section' | 'toggle' | 'heading' | 'text' | 'todo' | 'bullet' | 'link' | 'image' | 'props' | 'divider' | 'callout'
type Block = {
  id: string; board_id: string; parent_id: string | null; type: BType; content: string; done: boolean; position: number
  props: any; created_by?: string | null; updated_by?: string | null
}
type Board = { id: string; title: string; emoji: string; color: string }

const MONO = 'Space Mono, monospace'
const SANS = 'DM Sans, Inter, system-ui, sans-serif'
const DIM = 'rgba(140,185,230,0.5)'
const BUCKET = 'thinkspace'

const STATUS: { key: string; label: string; color: string }[] = [
  { key: 'new', label: 'NEU', color: '#64c8ff' },
  { key: 'check', label: 'PRÜFEN', color: '#fbbf24' },
  { key: 'visited', label: 'BESICHTIGT', color: '#b47cff' },
  { key: 'negotiate', label: 'VERHANDLUNG', color: '#ff9f43' },
  { key: 'bought', label: 'GEKAUFT', color: '#34d399' },
  { key: 'rejected', label: 'ABGELEHNT', color: '#f87171' },
  { key: 'none', label: '—', color: 'rgba(140,185,230,0.4)' },
]
const BLOCK_MENU: { type: BType | 'template'; icon: string; label: string; hint: string }[] = [
  { type: 'section', icon: '▣', label: 'Bereich', hint: 'Über-Überschrift, z. B. Land, Design' },
  { type: 'toggle', icon: '▸', label: 'Toggle', hint: 'aufklappbarer Eintrag mit Status' },
  { type: 'template', icon: '🏝', label: 'Land / Objekt', hint: 'Toggle mit Details, Link, Bildern, Notizen' },
  { type: 'text', icon: '¶', label: 'Text', hint: 'freier Text' },
  { type: 'heading', icon: 'H', label: 'Überschrift', hint: 'kleine Zwischenüberschrift' },
  { type: 'todo', icon: '☐', label: 'To-do', hint: 'Checkbox' },
  { type: 'bullet', icon: '•', label: 'Aufzählung', hint: 'Listenpunkt' },
  { type: 'link', icon: '↗', label: 'Link', hint: 'Vorschaukarte (Maps, Listing, Drive …)' },
  { type: 'image', icon: '🖼', label: 'Bilder', hint: 'Fotos hochladen, Galerie' },
  { type: 'props', icon: '☷', label: 'Details', hint: 'Tabelle: Preis, Größe, Lage …' },
  { type: 'callout', icon: '💡', label: 'Hinweis', hint: 'farbige Info-Box' },
  { type: 'divider', icon: '—', label: 'Trennlinie', hint: '' },
]
const SECTION_SUGGESTIONS = ['🏝 Land', '🎨 Design', '🏗 Bau', '📄 Rechtliches', '💰 Finanzen', '📞 Kontakte']
const LAND_KEYS = ['Preis', 'Größe', 'Lage', 'Zoning', 'Zufahrt', 'Kontakt']

function defaultProps(type: BType): any {
  if (type === 'toggle') return { status: 'new' }
  if (type === 'props') return { rows: [{ k: '', v: '' }] }
  if (type === 'image') return { paths: [] }
  if (type === 'link') return { url: '' }
  if (type === 'callout') return { emoji: '💡' }
  return {}
}

export default function BoardEditor({ board, supabase, onBack }: { board: Board; supabase: any; onBack: () => void }) {
  const isMobile = useIsMobile()
  const [blocks, setBlocks] = useState<Block[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState(board.title)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [focusId, setFocusId] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ paths: string[]; i: number } | null>(null)
  const [needsSql, setNeedsSql] = useState(false)
  const userIdRef = useRef<string | null>(null)
  const openKey = `ts-open-${board.id}`

  // ─── load ───
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    userIdRef.current = user?.id || null
    const { data } = await supabase.from('workspace_blocks').select('*').eq('board_id', board.id).order('position', { ascending: true })
    const list = ((data || []) as Block[]).map(b => ({ ...b, parent_id: b.parent_id ?? null, props: b.props || {} }))
    if (list.length && !('parent_id' in (data?.[0] || {}))) setNeedsSql(true)
    setBlocks(list)
    setLoading(false)
    signImages(list)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.id])
  useEffect(() => { load() }, [load])
  useEffect(() => { try { setOpen(JSON.parse(localStorage.getItem(openKey) || '{}')) } catch { /* noop */ } }, [openKey])
  const setOpenState = (id: string, v: boolean) => setOpen(prev => { const n = { ...prev, [id]: v }; try { localStorage.setItem(openKey, JSON.stringify(n)) } catch { /* noop */ } return n })
  const isOpen = (b: Block) => open[b.id] ?? (b.type === 'section')

  async function signImages(list: Block[]) {
    const paths = list.flatMap(b => (b.type === 'image' ? (b.props?.paths || []) : [])).filter((p: string) => !urls[p])
    if (!paths.length) return
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60 * 6)
    const map: Record<string, string> = {}
    for (const d of data || []) if (d.signedUrl && d.path) map[d.path] = d.signedUrl
    setUrls(prev => ({ ...prev, ...map }))
  }

  // ─── tree ───
  const children = useMemo(() => {
    const m = new Map<string | null, Block[]>()
    for (const b of blocks) { const k = b.parent_id ?? null; m.set(k, [...(m.get(k) || []), b]) }
    m.forEach(list => list.sort((a, b) => a.position - b.position))
    return m
  }, [blocks])
  const kids = (id: string | null) => children.get(id) || []
  const countDeep = (id: string): number => kids(id).reduce((n, c) => n + 1 + countDeep(c.id), 0)

  // ─── mutations ───
  async function insert(type: BType, parentId: string | null, extra: Partial<Block> = {}): Promise<Block | null> {
    const siblings = kids(parentId)
    const position = siblings.reduce((m, b) => Math.max(m, b.position), -1) + 1
    const row: any = { board_id: board.id, type, content: '', position, created_by: userIdRef.current, parent_id: parentId, props: defaultProps(type), ...extra }
    const { data, error } = await supabase.from('workspace_blocks').insert(row).select().single()
    if (error) {
      if (/parent_id|props|column/i.test(error.message)) setNeedsSql(true)
      else alert('Speichern fehlgeschlagen: ' + error.message)
      return null
    }
    const b = { ...(data as Block), parent_id: data.parent_id ?? null, props: data.props || {} }
    setBlocks(prev => [...prev, b])
    return b
  }
  async function add(type: BType | 'template', parentId: string | null) {
    if (type === 'template') return addLand(parentId)
    const b = await insert(type, parentId)
    if (!b) return
    if (type === 'section' || type === 'toggle') setOpenState(b.id, true)
    if (parentId) setOpenState(parentId, true)
    setFocusId(b.id)
  }
  async function addLand(parentId: string | null) {
    const t = await insert('toggle', parentId, { content: 'Neues Grundstück', props: { status: 'new' } })
    if (!t) return
    setOpenState(t.id, true); if (parentId) setOpenState(parentId, true)
    await insert('props', t.id, { props: { rows: LAND_KEYS.map(k => ({ k, v: '' })) } })
    await insert('link', t.id)
    await insert('image', t.id)
    await insert('text', t.id, { content: '' })
    setFocusId(t.id)
  }
  async function addSection(name: string) {
    const b = await insert('section', null, { content: name })
    if (b) setOpenState(b.id, true)
  }
  async function update(id: string, fields: Partial<Block>) {
    const uid = userIdRef.current
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...fields, updated_by: uid || b.updated_by } : b))
    const now = new Date().toISOString()
    const { error } = await supabase.from('workspace_blocks').update({ ...fields, updated_at: now, updated_by: uid }).eq('id', id)
    if (error) await supabase.from('workspace_blocks').update({ ...fields, updated_at: now }).eq('id', id)
    await supabase.from('workspace_boards').update({ updated_at: now }).eq('id', board.id)
  }
  async function remove(b: Block) {
    const n = countDeep(b.id)
    if ((b.type === 'section' || b.type === 'toggle' || n > 0) && !confirm(`„${b.content || 'Block'}“${n ? ` mit ${n} Unterpunkten` : ''} löschen?`)) return
    const doomed = new Set<string>([b.id])
    let grew = true
    while (grew) { grew = false; for (const x of blocks) if (x.parent_id && doomed.has(x.parent_id) && !doomed.has(x.id)) { doomed.add(x.id); grew = true } }
    const paths = blocks.filter(x => doomed.has(x.id) && x.type === 'image').flatMap(x => x.props?.paths || [])
    setBlocks(prev => prev.filter(x => !doomed.has(x.id)))
    await supabase.from('workspace_blocks').delete().eq('id', b.id)
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
  }
  async function move(b: Block, dir: -1 | 1) {
    const sib = kids(b.parent_id)
    const i = sib.findIndex(x => x.id === b.id), j = i + dir
    if (j < 0 || j >= sib.length) return
    const other = sib[j]
    setBlocks(prev => prev.map(x => x.id === b.id ? { ...x, position: other.position } : x.id === other.id ? { ...x, position: b.position } : x))
    await Promise.all([
      supabase.from('workspace_blocks').update({ position: other.position }).eq('id', b.id),
      supabase.from('workspace_blocks').update({ position: b.position }).eq('id', other.id),
    ])
  }
  async function uploadImages(b: Block, files: FileList | File[]) {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!arr.length) return
    const added: string[] = []
    for (const f of arr) {
      const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60)
      const path = `${board.id}/${b.id}/${Date.now()}-${safe}`
      const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type, upsert: false })
      if (error) { if (/bucket/i.test(error.message)) setNeedsSql(true); else alert('Upload fehlgeschlagen: ' + error.message); continue }
      added.push(path)
    }
    if (!added.length) return
    const paths = [...(b.props?.paths || []), ...added]
    await update(b.id, { props: { ...b.props, paths } })
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(added, 60 * 60 * 6)
    const map: Record<string, string> = {}
    for (const d of data || []) if (d.signedUrl && d.path) map[d.path] = d.signedUrl
    setUrls(prev => ({ ...prev, ...map }))
  }
  async function removeImage(b: Block, path: string) {
    await update(b.id, { props: { ...b.props, paths: (b.props?.paths || []).filter((p: string) => p !== path) } })
    await supabase.storage.from(BUCKET).remove([path])
  }
  async function saveTitle() {
    if (title.trim() && title !== board.title) {
      await supabase.from('workspace_boards').update({ title: title.trim(), updated_at: new Date().toISOString() }).eq('id', board.id)
      board.title = title.trim()
    }
  }

  // ─── render one block (recursive) ───
  const render = (b: Block, depth: number): React.ReactNode => {
    const mk = isMikha(b.created_by) ? <MBadge /> : isMikha(b.updated_by) ? <MBadge edited /> : null
    const controls = <Controls onUp={() => move(b, -1)} onDown={() => move(b, 1)} onDelete={() => remove(b)} />

    if (b.type === 'section') {
      const o = isOpen(b), n = countDeep(b.id)
      return (
        <div key={b.id} style={{ marginTop: depth === 0 ? 26 : 14 }}>
          <Row controls={controls}>
            <button onClick={() => setOpenState(b.id, !o)} style={chev(o, 18)}>▸</button>
            <Inline value={b.content} placeholder="BEREICH" autoFocus={focusId === b.id} onSave={v => update(b.id, { content: v })}
              style={{ fontFamily: SANS, fontSize: isMobile ? 20 : 24, fontWeight: 700, color: '#f4f9ff', letterSpacing: 0.2 }} />
            <span style={{ fontFamily: MONO, fontSize: 9.5, color: DIM, letterSpacing: 1.5, whiteSpace: 'nowrap' }}>{n} {n === 1 ? 'ITEM' : 'ITEMS'}</span>
            {mk}
          </Row>
          <div style={{ height: 2, borderRadius: 2, margin: '6px 0 10px 30px', background: `linear-gradient(90deg, ${board.color}, transparent 70%)`, opacity: 0.6 }} />
          {o && (
            <div style={{ paddingLeft: isMobile ? 8 : 30 }}>
              {kids(b.id).map(c => render(c, depth + 1))}
              <AddMenu onPick={t => add(t, b.id)} exclude={['section']} label="+ Eintrag" />
            </div>
          )}
        </div>
      )
    }

    if (b.type === 'toggle') {
      const o = isOpen(b), n = countDeep(b.id)
      const st = STATUS.find(s => s.key === (b.props?.status || 'none')) || STATUS[STATUS.length - 1]
      const cycle = () => { const i = STATUS.findIndex(s => s.key === st.key); update(b.id, { props: { ...b.props, status: STATUS[(i + 1) % STATUS.length].key } }) }
      return (
        <div key={b.id} style={{
          margin: '6px 0', borderRadius: 12, transition: 'background .2s',
          background: o ? 'rgba(14,32,68,0.45)' : 'transparent', border: `1px solid ${o ? 'rgba(80,180,255,0.14)' : 'transparent'}`,
          opacity: st.key === 'rejected' ? 0.55 : 1,
        }}>
          <Row controls={controls} pad="6px 10px">
            <button onClick={() => setOpenState(b.id, !o)} style={chev(o, 14)}>▸</button>
            <Inline value={b.content} placeholder="Neuer Eintrag" autoFocus={focusId === b.id} onSave={v => update(b.id, { content: v })}
              style={{ fontFamily: SANS, fontSize: 16, fontWeight: 600, color: '#eef6ff', textDecoration: st.key === 'rejected' ? 'line-through' : 'none' }} />
            {!o && n > 0 && <span style={{ fontFamily: MONO, fontSize: 9, color: DIM }}>{n}</span>}
            <button onClick={cycle} title="Status ändern" style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1.2, fontWeight: 700, padding: '3px 8px', borderRadius: 7, cursor: 'pointer', whiteSpace: 'nowrap', color: st.color, background: `${st.color}18`, border: `1px solid ${st.color}55` }}>{st.label}</button>
            {mk}
          </Row>
          {o && (
            <div style={{ margin: '0 10px 10px 22px', paddingLeft: 14, borderLeft: '1px solid rgba(120,190,255,0.16)' }}>
              {kids(b.id).map(c => render(c, depth + 1))}
              <AddMenu onPick={t => add(t, b.id)} exclude={['section', 'template']} label="+ Inhalt" small />
            </div>
          )}
        </div>
      )
    }

    if (b.type === 'divider') return <Row key={b.id} controls={controls}><div style={{ flex: 1, height: 1, background: 'rgba(120,190,255,0.18)', margin: '12px 0' }} /></Row>

    if (b.type === 'heading') return (
      <Row key={b.id} controls={controls}>
        <Inline value={b.content} placeholder="Überschrift" autoFocus={focusId === b.id} onSave={v => update(b.id, { content: v })}
          style={{ fontFamily: SANS, fontSize: 15, fontWeight: 700, color: '#dbeafe', letterSpacing: 0.3, marginTop: 8 }} />
        {mk}
      </Row>
    )

    if (b.type === 'todo') return (
      <Row key={b.id} controls={controls}>
        <span onClick={() => update(b.id, { done: !b.done })} style={{ width: 17, height: 17, marginTop: 3, borderRadius: 5, flexShrink: 0, cursor: 'pointer', border: `1.5px solid ${b.done ? '#34d399' : 'rgba(128,192,255,0.45)'}`, background: b.done ? 'rgba(52,211,153,0.25)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399', fontSize: 10 }}>{b.done ? '✓' : ''}</span>
        <Area value={b.content} placeholder="To-do" autoFocus={focusId === b.id} onSave={v => update(b.id, { content: v })} style={{ textDecoration: b.done ? 'line-through' : 'none', opacity: b.done ? 0.5 : 1 }} />
        {mk}
      </Row>
    )

    if (b.type === 'bullet') return (
      <Row key={b.id} controls={controls}>
        <span style={{ color: board.color, fontSize: 16, lineHeight: '26px', width: 12, flexShrink: 0 }}>•</span>
        <Area value={b.content} placeholder="Listenpunkt" autoFocus={focusId === b.id} onSave={v => update(b.id, { content: v })} />
        {mk}
      </Row>
    )

    if (b.type === 'callout') return (
      <Row key={b.id} controls={controls}>
        <div style={{ flex: 1, display: 'flex', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.22)' }}>
          <span style={{ fontSize: 16, lineHeight: '26px' }}>{b.props?.emoji || '💡'}</span>
          <Area value={b.content} placeholder="Wichtiger Hinweis…" autoFocus={focusId === b.id} onSave={v => update(b.id, { content: v })} />
        </div>
        {mk}
      </Row>
    )

    if (b.type === 'link') return (
      <Row key={b.id} controls={controls}>
        <LinkBlock block={b} supabase={supabase} onSave={props => update(b.id, { props: { ...b.props, ...props } })} autoFocus={focusId === b.id} />
        {mk}
      </Row>
    )

    if (b.type === 'image') return (
      <Row key={b.id} controls={controls}>
        <ImageBlock block={b} urls={urls} onUpload={f => uploadImages(b, f)} onRemove={p => removeImage(b, p)} onOpen={i => setLightbox({ paths: b.props?.paths || [], i })} />
        {mk}
      </Row>
    )

    if (b.type === 'props') return (
      <Row key={b.id} controls={controls}>
        <PropsBlock rows={b.props?.rows || []} color={board.color} onSave={rows => update(b.id, { props: { ...b.props, rows } })} />
        {mk}
      </Row>
    )

    // text (default)
    return (
      <Row key={b.id} controls={controls}>
        <Area value={b.content} placeholder="Text…" autoFocus={focusId === b.id} onSave={v => update(b.id, { content: v })} />
        {mk}
      </Row>
    )
  }

  const top = kids(null)
  const mikhaCount = blocks.filter(b => isMikha(b.created_by) || isMikha(b.updated_by)).length

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at 30% 0%, #0a1a3a 0%, #030914 55%, #000 100%)', color: '#d0e5ff', fontFamily: SANS }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12, padding: isMobile ? '12px 14px' : '14px 32px', background: 'linear-gradient(180deg, rgba(3,9,20,0.95), rgba(3,9,20,0.6))', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(80,180,255,0.1)' }}>
        <button onClick={onBack} style={ghostBtn}>← BACK</button>
        <span style={{ fontSize: 24 }}>{board.emoji}</span>
        <input value={title} onChange={e => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', fontFamily: SANS, fontSize: isMobile ? 20 : 24, fontWeight: 700, color: '#f5f9ff', padding: 0 }} />
        {mikhaCount > 0 && <MBadge count={mikhaCount} />}
        {!isMobile && <span style={{ fontFamily: MONO, fontSize: 9.5, color: DIM, letterSpacing: 1.5 }}>{blocks.length} BLOCKS</span>}
      </div>

      <div style={{ maxWidth: 920, margin: '0 auto', padding: isMobile ? '10px 14px 120px' : '18px 32px 160px' }}>
        {needsSql && (
          <div style={{ margin: '14px 0', padding: '12px 14px', borderRadius: 10, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', color: '#ffe6a8', fontSize: 13 }}>
            Für Bereiche, Toggles und Bilder bitte einmal <b>lib/sql/thinkspace_v2.sql</b> in Supabase ausführen.
          </div>
        )}
        {loading ? <div style={{ fontFamily: MONO, fontSize: 11, color: DIM, padding: 40, textAlign: 'center' }}>Loading…</div> : (
          <>
            {top.length === 0 && (
              <div style={{ padding: '40px 0 10px' }}>
                <div style={{ fontSize: 18, color: '#eef6ff', fontWeight: 600 }}>Leeres Board — womit fangt ihr an?</div>
                <div style={{ fontSize: 13, color: DIM, marginTop: 6 }}>Lege Bereiche an, darin aufklappbare Einträge mit Links, Bildern und Details.</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                  {SECTION_SUGGESTIONS.map(s => <button key={s} onClick={() => addSection(s)} style={suggBtn}>{s}</button>)}
                </div>
              </div>
            )}
            {top.map(b => render(b, 0))}
            <div style={{ marginTop: 22 }}>
              <AddMenu onPick={t => add(t, null)} label="+ Block / Bereich" />
            </div>
          </>
        )}
      </div>

      {lightbox && <Lightbox paths={lightbox.paths} urls={urls} start={lightbox.i} onClose={() => setLightbox(null)} />}
    </div>
  )
}

// ─── building blocks ───
function Row({ children, controls, pad }: { children: React.ReactNode; controls: React.ReactNode; pad?: string }) {
  const [h, setH] = useState(false)
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 8, padding: pad || '2px 0', borderRadius: 8 }}>
      {children}
      <div style={{ display: 'flex', gap: 2, opacity: h ? 1 : 0, transition: 'opacity .15s', flexShrink: 0, alignSelf: 'center' }} className="ts-ctrl">{controls}</div>
    </div>
  )
}
function Controls({ onUp, onDown, onDelete }: { onUp: () => void; onDown: () => void; onDelete: () => void }) {
  const s: React.CSSProperties = { background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(160,200,240,0.55)', fontSize: 11, padding: '3px 4px', lineHeight: 1 }
  return (<>
    <button onClick={onUp} title="nach oben" style={s}>↑</button>
    <button onClick={onDown} title="nach unten" style={s}>↓</button>
    <button onClick={onDelete} title="löschen" style={{ ...s, color: 'rgba(248,113,113,0.6)' }}>✕</button>
  </>)
}
const chev = (open: boolean, size: number): React.CSSProperties => ({
  background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(170,210,250,0.8)', fontSize: size * 0.75, width: size + 8, height: size + 12,
  flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s', padding: 0,
})

function Inline({ value, placeholder, onSave, style, autoFocus }: { value: string; placeholder: string; onSave: (v: string) => void; style?: React.CSSProperties; autoFocus?: boolean }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return <input value={v} placeholder={placeholder} autoFocus={autoFocus} onChange={e => setV(e.target.value)} onBlur={() => v !== value && onSave(v)}
    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', padding: '4px 0', ...style }} />
}
function Area({ value, placeholder, onSave, style, autoFocus }: { value: string; placeholder: string; onSave: (v: string) => void; style?: React.CSSProperties; autoFocus?: boolean }) {
  const [v, setV] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => setV(value), [value])
  useEffect(() => { const t = ref.current; if (t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' } }, [v])
  return <textarea ref={ref} value={v} rows={1} placeholder={placeholder} autoFocus={autoFocus} onChange={e => setV(e.target.value)} onBlur={() => v !== value && onSave(v)}
    style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', resize: 'none', overflow: 'hidden', color: '#dfecfb', fontFamily: SANS, fontSize: 14.5, lineHeight: 1.7, padding: '2px 0', ...style }} />
}

function AddMenu({ onPick, exclude = [], label, small }: { onPick: (t: BType | 'template') => void; exclude?: string[]; label: string; small?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative', marginTop: 6 }}>
      <button onClick={() => setOpen(o => !o)} style={{ fontFamily: MONO, fontSize: small ? 9.5 : 10, letterSpacing: 1.5, padding: small ? '5px 10px' : '8px 14px', borderRadius: 9, cursor: 'pointer', color: 'rgba(160,205,250,0.75)', background: 'rgba(80,180,255,0.05)', border: '1px dashed rgba(120,190,255,0.28)' }}>{label}</button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 30, top: '100%', left: 0, marginTop: 6, width: 300, maxHeight: 380, overflowY: 'auto', padding: 6, borderRadius: 12, background: 'rgba(8,18,40,0.98)', border: '1px solid rgba(120,190,255,0.25)', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
          {BLOCK_MENU.filter(m => !exclude.includes(m.type)).map(m => (
            <button key={m.type} onClick={() => { setOpen(false); onPick(m.type) }} className="ts-menu" style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '8px 10px', borderRadius: 8, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(80,180,255,0.08)', border: '1px solid rgba(120,190,255,0.15)', color: '#cfe8ff', fontSize: 13, flexShrink: 0 }}>{m.icon}</span>
              <span><span style={{ display: 'block', fontSize: 13, color: '#eef6ff', fontFamily: SANS }}>{m.label}</span>{m.hint && <span style={{ display: 'block', fontSize: 11, color: DIM, fontFamily: SANS }}>{m.hint}</span>}</span>
            </button>
          ))}
        </div>
      )}
      <style>{`.ts-menu:hover { background: rgba(80,180,255,0.1) !important } @media (hover: none) { .ts-ctrl { opacity: .7 !important } }`}</style>
    </div>
  )
}

function LinkBlock({ block, supabase, onSave, autoFocus }: { block: Block; supabase: any; onSave: (p: any) => void; autoFocus?: boolean }) {
  const [edit, setEdit] = useState(!block.props?.url)
  const [url, setUrl] = useState(block.props?.url || '')
  const [busy, setBusy] = useState(false)
  const p = block.props?.preview
  async function commit() {
    const u = url.trim()
    if (!u) { setEdit(false); return }
    const full = /^https?:\/\//i.test(u) ? u : `https://${u}`
    setBusy(true); setEdit(false)
    let preview: any = null
    try {
      const { data } = await supabase.auth.getSession()
      const r = await fetch(`/api/link-preview?url=${encodeURIComponent(full)}`, { headers: { Authorization: `Bearer ${data?.session?.access_token || ''}` } })
      preview = await r.json()
    } catch { /* noop */ }
    onSave({ url: full, preview })
    setBusy(false)
  }
  if (edit) return (
    <input value={url} autoFocus={autoFocus} onChange={e => setUrl(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      placeholder="Link einfügen — Google Maps, Listing, Drive, Instagram …"
      style={{ flex: 1, background: 'rgba(4,12,30,0.6)', border: '1px dashed rgba(120,190,255,0.3)', borderRadius: 10, padding: '10px 12px', outline: 'none', color: '#e6f2ff', fontSize: 13.5, fontFamily: SANS }} />
  )
  const site = p?.site || (() => { try { return new URL(block.props.url).hostname.replace(/^www\./, '') } catch { return '' } })()
  return (
    <div style={{ flex: 1, display: 'flex', gap: 0, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(120,190,255,0.2)', background: 'rgba(10,24,54,0.55)', minHeight: 72 }}>
      <a href={block.props.url} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, display: 'flex', gap: 12, textDecoration: 'none', padding: 12 }}>
        {p?.image && <img src={p.image} alt="" style={{ width: 110, height: 72, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} onError={e => ((e.target as HTMLImageElement).style.display = 'none')} />}
        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#eef6ff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{busy ? 'Lade Vorschau…' : (p?.title || block.props.url)}</span>
          {p?.description && <span style={{ fontSize: 12, color: DIM, marginTop: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</span>}
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, fontFamily: MONO, fontSize: 9.5, color: '#9fd4ff' }}>
            <img src={`https://www.google.com/s2/favicons?domain=${site}&sz=32`} alt="" style={{ width: 13, height: 13, borderRadius: 3 }} />{site} ↗
          </span>
        </span>
      </a>
      <button onClick={() => setEdit(true)} title="Link ändern" style={{ background: 'transparent', border: 'none', borderLeft: '1px solid rgba(120,190,255,0.12)', color: DIM, cursor: 'pointer', padding: '0 12px', fontSize: 12 }}>✎</button>
    </div>
  )
}

function ImageBlock({ block, urls, onUpload, onRemove, onOpen }: { block: Block; urls: Record<string, string>; onUpload: (f: FileList | File[]) => void; onRemove: (p: string) => void; onOpen: (i: number) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const paths: string[] = block.props?.paths || []
  const up = async (f: FileList | File[]) => { setBusy(true); await onUpload(f); setBusy(false) }
  return (
    <div onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); up(e.dataTransfer.files) }}
      style={{ flex: 1, padding: paths.length ? 0 : 0, borderRadius: 12, outline: drag ? '2px dashed rgba(120,190,255,0.6)' : 'none' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
        {paths.map((p, i) => (
          <div key={p} className="ts-img" style={{ position: 'relative', aspectRatio: '4 / 3', borderRadius: 10, overflow: 'hidden', background: 'rgba(10,24,54,0.6)', border: '1px solid rgba(120,190,255,0.15)', cursor: 'zoom-in' }} onClick={() => onOpen(i)}>
            {urls[p] ? <img src={urls[p]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 9, color: DIM }}>…</span>}
            <button onClick={e => { e.stopPropagation(); if (confirm('Bild entfernen?')) onRemove(p) }} className="ts-img-x" style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 6, border: 'none', cursor: 'pointer', background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11 }}>✕</button>
          </div>
        ))}
        <button onClick={() => input.current?.click()} style={{ aspectRatio: '4 / 3', borderRadius: 10, cursor: 'pointer', background: 'rgba(80,180,255,0.04)', border: '1px dashed rgba(120,190,255,0.3)', color: 'rgba(160,205,250,0.75)', fontFamily: MONO, fontSize: 10, letterSpacing: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ fontSize: 20 }}>{busy ? '◌' : '🖼'}</span>{busy ? 'LÄDT HOCH…' : paths.length ? '+ MEHR' : 'BILDER HOCHLADEN'}
          {!paths.length && !busy && <span style={{ fontSize: 8.5, color: DIM, letterSpacing: 0.5 }}>oder hierher ziehen</span>}
        </button>
      </div>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={e => { if (e.target.files) up(e.target.files); e.target.value = '' }} />
      <style>{`.ts-img .ts-img-x { opacity: 0; transition: opacity .15s } .ts-img:hover .ts-img-x { opacity: 1 } @media (hover: none) { .ts-img .ts-img-x { opacity: .8 } }`}</style>
    </div>
  )
}

function PropsBlock({ rows, color, onSave }: { rows: { k: string; v: string }[]; color: string; onSave: (rows: { k: string; v: string }[]) => void }) {
  const [r, setR] = useState(rows)
  useEffect(() => setR(rows), [rows])
  const commit = (next: { k: string; v: string }[]) => { setR(next); onSave(next) }
  const cell: React.CSSProperties = { background: 'transparent', border: 'none', outline: 'none', width: '100%', padding: '8px 10px', fontFamily: SANS, fontSize: 13.5 }
  return (
    <div style={{ flex: 1, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(120,190,255,0.16)', background: 'rgba(8,20,46,0.5)' }}>
      {r.map((row, i) => (
        <div key={i} className="ts-prop" style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 160px) 1fr 28px', borderTop: i ? '1px solid rgba(120,190,255,0.08)' : 'none' }}>
          <input value={row.k} placeholder="Feld" onChange={e => setR(r.map((x, j) => j === i ? { ...x, k: e.target.value } : x))} onBlur={() => onSave(r)}
            style={{ ...cell, color, fontFamily: MONO, fontSize: 10.5, letterSpacing: 1, textTransform: 'uppercase', borderRight: '1px solid rgba(120,190,255,0.08)' }} />
          <input value={row.v} placeholder="—" onChange={e => setR(r.map((x, j) => j === i ? { ...x, v: e.target.value } : x))} onBlur={() => onSave(r)} style={{ ...cell, color: '#eef6ff' }} />
          <button onClick={() => commit(r.filter((_, j) => j !== i))} className="ts-prop-x" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(248,113,113,0.6)', fontSize: 10 }}>✕</button>
        </div>
      ))}
      <button onClick={() => commit([...r, { k: '', v: '' }])} style={{ width: '100%', textAlign: 'left', padding: '7px 10px', background: 'transparent', border: 'none', borderTop: '1px solid rgba(120,190,255,0.08)', cursor: 'pointer', fontFamily: MONO, fontSize: 9.5, letterSpacing: 1, color: DIM }}>+ FELD</button>
      <style>{`.ts-prop .ts-prop-x { opacity: 0 } .ts-prop:hover .ts-prop-x { opacity: 1 }`}</style>
    </div>
  )
}

function Lightbox({ paths, urls, start, onClose }: { paths: string[]; urls: Record<string, string>; start: number; onClose: () => void }) {
  const [i, setI] = useState(start)
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI(x => (x + 1) % paths.length); if (e.key === 'ArrowLeft') setI(x => (x - 1 + paths.length) % paths.length) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [paths.length, onClose])
  const nav: React.CSSProperties = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 46, height: 46, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 18, cursor: 'pointer' }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }}>
      {urls[paths[i]] && <img src={urls[paths[i]]} alt="" onClick={e => e.stopPropagation()} style={{ maxWidth: '92vw', maxHeight: '88vh', borderRadius: 10, boxShadow: '0 20px 80px rgba(0,0,0,0.8)' }} />}
      {paths.length > 1 && <>
        <button onClick={e => { e.stopPropagation(); setI(x => (x - 1 + paths.length) % paths.length) }} style={{ ...nav, left: 20 }}>‹</button>
        <button onClick={e => { e.stopPropagation(); setI(x => (x + 1) % paths.length) }} style={{ ...nav, right: 20 }}>›</button>
      </>}
      <div style={{ position: 'absolute', bottom: 18, fontFamily: MONO, fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: 2 }}>{i + 1} / {paths.length} · ESC</div>
    </div>
  )
}

const ghostBtn: React.CSSProperties = { fontFamily: MONO, fontSize: 10, letterSpacing: 1.5, padding: '7px 12px', borderRadius: 9, cursor: 'pointer', color: '#cfe8ff', background: 'rgba(80,180,255,0.08)', border: '1px solid rgba(120,200,255,0.25)', flexShrink: 0 }
const suggBtn: React.CSSProperties = { fontFamily: SANS, fontSize: 13.5, padding: '9px 14px', borderRadius: 10, cursor: 'pointer', color: '#e6f2ff', background: 'rgba(80,180,255,0.07)', border: '1px solid rgba(120,190,255,0.22)' }
