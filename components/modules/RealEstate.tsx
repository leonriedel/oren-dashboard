'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Project = {
  id: string
  name: string
  status: string
  location: string | null
  invested: number
  current_value: number
  notes: string | null
  created_by: string | null
  created_at: string
}

const STATUSES = ['konzept', 'kauf', 'bau', 'vermietet', 'verkauft']
const STATUS_COLORS: Record<string, string> = {
  konzept:   '#80c0ff',
  kauf:      '#fbbf24',
  bau:       '#f97316',
  vermietet: '#34d399',
  verkauft:  '#a78bfa',
}

export default function RealEstate({ onBack }: any) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  const supabase = createClient()

  const load = async () => {
    const { data } = await supabase
      .from('real_estate_projects')
      .select('*')
      .order('created_at', { ascending: false })
    setProjects((data as Project[]) || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const createProject = async (fields: Partial<Project>) => {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('real_estate_projects').insert({
      ...fields,
      created_by: user?.id,
    })
    setShowNew(false)
    load()
  }

  const updateProject = async (id: string, fields: Partial<Project>) => {
    await supabase.from('real_estate_projects').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)
    setEditingId(null)
    load()
  }

  const deleteProject = async (id: string) => {
    if (!confirm('Projekt wirklich löschen?')) return
    await supabase.from('real_estate_projects').delete().eq('id', id)
    load()
  }

  const totalInvested = projects.reduce((s, p) => s + (Number(p.invested) || 0), 0)
  const totalValue = projects.reduce((s, p) => s + (Number(p.current_value) || 0), 0)
  const gain = totalValue - totalInvested
  const gainPct = totalInvested > 0 ? (gain / totalInvested) * 100 : 0
  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n)

  return (
    <div style={{ minHeight:'100vh', background:'#000', color:'#d0e5ff', padding:'20px 28px', fontFamily:'Space Mono, monospace' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18, paddingBottom:14, borderBottom:'1px solid rgba(80,180,255,0.15)' }}>
        <div>
          <div style={{ fontSize:10, letterSpacing:3, color:'#80c0ff', marginBottom:4 }}>◆ REAL ESTATE</div>
          <div style={{ fontSize:18, letterSpacing:1, color:'#f5f5f5', fontFamily:'Inter, sans-serif', fontWeight:300 }}>Projekte & Portfolio</div>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={() => setShowNew(true)} style={btnPrimary}>+ NEUES PROJEKT</button>
          <button onClick={onBack} style={btnGhost}>← ZURÜCK</button>
        </div>
      </div>

      {/* SUMMARY */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:20 }}>
        <Stat label="PROJEKTE" value={String(projects.length).padStart(2,'0')} />
        <Stat label="INVESTIERT" value={`€ ${fmt(totalInvested)}`} />
        <Stat label="AKTUELLER WERT" value={`€ ${fmt(totalValue)}`} color="#34d399" />
        <Stat label="GEWINN/VERLUST" value={`${gain >= 0 ? '+' : ''}${fmt(gain)}  (${gainPct.toFixed(1)}%)`} color={gain >= 0 ? '#34d399' : '#ff6b6b'} />
      </div>

      {/* NEW PROJECT FORM */}
      {showNew && (
        <ProjectForm
          onCancel={() => setShowNew(false)}
          onSave={createProject}
        />
      )}

      {/* PROJECT LIST */}
      {loading ? (
        <div style={{ fontSize:11, color:'rgba(128,192,255,0.4)', textAlign:'center', padding:40 }}>Lade Projekte...</div>
      ) : projects.length === 0 && !showNew ? (
        <div style={{ textAlign:'center', padding:60, color:'rgba(128,192,255,0.5)', border:'1px dashed rgba(80,180,255,0.2)', borderRadius:8 }}>
          <div style={{ fontSize:14, marginBottom:8 }}>Noch keine Projekte</div>
          <div style={{ fontSize:11, letterSpacing:1 }}>Klick auf "+ NEUES PROJEKT" um das erste anzulegen</div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {projects.map(p => editingId === p.id ? (
            <ProjectForm
              key={p.id}
              initial={p}
              onCancel={() => setEditingId(null)}
              onSave={(fields) => updateProject(p.id, fields)}
            />
          ) : (
            <ProjectCard
              key={p.id}
              project={p}
              onEdit={() => setEditingId(p.id)}
              onDelete={() => deleteProject(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── subcomponents ──────────────────────────────────────────────

function Stat({ label, value, color = '#f5f5f5' }: any) {
  return (
    <div style={{ background:'rgba(10,20,35,0.5)', border:'1px solid rgba(80,180,255,0.12)', borderRadius:6, padding:'12px 14px' }}>
      <div style={{ fontSize:9, letterSpacing:2, color:'rgba(128,192,255,0.5)', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:16, fontWeight:400, color, fontFamily:'Space Mono, monospace' }}>{value}</div>
    </div>
  )
}

function ProjectCard({ project, onEdit, onDelete }: any) {
  const color = STATUS_COLORS[project.status] || '#80c0ff'
  const gain = (Number(project.current_value) || 0) - (Number(project.invested) || 0)
  const fmt = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(n)
  return (
    <div style={{ background:'rgba(5,10,18,0.6)', border:'1px solid rgba(80,180,255,0.15)', borderRadius:8, padding:'14px 18px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
            <div style={{ fontFamily:'Inter, sans-serif', fontSize:15, fontWeight:500, color:'#f5f5f5' }}>{project.name}</div>
            <div style={{
              fontSize:8, letterSpacing:1.5, padding:'2px 8px', borderRadius:3,
              background:`${color}22`, color, border:`1px solid ${color}55`, fontWeight:700,
            }}>{project.status.toUpperCase()}</div>
          </div>
          {project.location && (
            <div style={{ fontSize:11, color:'rgba(128,192,255,0.55)', marginBottom:2 }}>📍 {project.location}</div>
          )}
        </div>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={onEdit} style={btnMini}>EDIT</button>
          <button onClick={onDelete} style={{ ...btnMini, color:'#ff6b6b', borderColor:'rgba(255,107,107,0.3)' }}>✕</button>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginTop:8, paddingTop:10, borderTop:'1px solid rgba(80,180,255,0.08)' }}>
        <div>
          <div style={{ fontSize:8, letterSpacing:1.5, color:'rgba(128,192,255,0.4)', marginBottom:2 }}>INVESTIERT</div>
          <div style={{ fontSize:13, color:'#d0e5ff' }}>€ {fmt(Number(project.invested) || 0)}</div>
        </div>
        <div>
          <div style={{ fontSize:8, letterSpacing:1.5, color:'rgba(128,192,255,0.4)', marginBottom:2 }}>AKTUELL</div>
          <div style={{ fontSize:13, color:'#d0e5ff' }}>€ {fmt(Number(project.current_value) || 0)}</div>
        </div>
        <div>
          <div style={{ fontSize:8, letterSpacing:1.5, color:'rgba(128,192,255,0.4)', marginBottom:2 }}>GEWINN</div>
          <div style={{ fontSize:13, color: gain >= 0 ? '#34d399' : '#ff6b6b' }}>{gain >= 0 ? '+' : ''}€ {fmt(gain)}</div>
        </div>
      </div>

      {project.notes && (
        <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid rgba(80,180,255,0.08)', fontSize:12, color:'rgba(208,229,255,0.75)', fontFamily:'Inter, sans-serif', lineHeight:1.5 }}>
          {project.notes}
        </div>
      )}
    </div>
  )
}

function ProjectForm({ initial, onCancel, onSave }: any) {
  const [name, setName] = useState(initial?.name || '')
  const [status, setStatus] = useState(initial?.status || 'konzept')
  const [location, setLocation] = useState(initial?.location || '')
  const [invested, setInvested] = useState(initial?.invested?.toString() || '')
  const [currentValue, setCurrentValue] = useState(initial?.current_value?.toString() || '')
  const [notes, setNotes] = useState(initial?.notes || '')

  const save = () => {
    if (!name.trim()) return alert('Name ist Pflicht')
    onSave({
      name: name.trim(),
      status,
      location: location.trim() || null,
      invested: parseFloat(invested) || 0,
      current_value: parseFloat(currentValue) || 0,
      notes: notes.trim() || null,
    })
  }

  return (
    <div style={{ background:'rgba(10,20,35,0.7)', border:'1px solid rgba(80,180,255,0.3)', borderRadius:8, padding:18, marginBottom:12 }}>
      <div style={{ fontSize:10, letterSpacing:2.5, color:'#80c0ff', marginBottom:14 }}>
        {initial ? '◆ PROJEKT BEARBEITEN' : '◆ NEUES PROJEKT'}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:12, marginBottom:10 }}>
        <Field label="NAME" value={name} onChange={setName} placeholder="z.B. Villa Canggu North" />
        <Field label="STATUS" asSelect value={status} onChange={setStatus} options={STATUSES} />
      </div>

      <div style={{ marginBottom:10 }}>
        <Field label="LOCATION" value={location} onChange={setLocation} placeholder="z.B. Bali · Canggu · Berawa" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:10 }}>
        <Field label="INVESTIERT (€)" value={invested} onChange={setInvested} placeholder="0" type="number" />
        <Field label="AKTUELLER WERT (€)" value={currentValue} onChange={setCurrentValue} placeholder="0" type="number" />
      </div>

      <div style={{ marginBottom:14 }}>
        <Field label="NOTIZEN" asTextarea value={notes} onChange={setNotes} placeholder="Freitext, Partner, Deadlines, Links ..." />
      </div>

      <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
        <button onClick={onCancel} style={btnGhost}>ABBRECHEN</button>
        <button onClick={save} style={btnPrimary}>{initial ? 'SPEICHERN' : 'ANLEGEN'}</button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text', asSelect, asTextarea, options }: any) {
  const baseStyle: any = {
    width:'100%', background:'rgba(0,0,0,0.5)', border:'1px solid rgba(80,180,255,0.2)',
    borderRadius:4, padding:'8px 10px', color:'#d0e5ff',
    fontFamily:'Inter, sans-serif', fontSize:13, outline:'none', boxSizing:'border-box',
  }
  return (
    <div>
      <div style={{ fontSize:9, letterSpacing:2, color:'rgba(128,192,255,0.6)', marginBottom:5 }}>{label}</div>
      {asSelect ? (
        <select value={value} onChange={e => onChange(e.target.value)} style={baseStyle}>
          {options.map((o: string) => <option key={o} value={o}>{o.toUpperCase()}</option>)}
        </select>
      ) : asTextarea ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ ...baseStyle, resize:'vertical', minHeight:60 }} />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={baseStyle} />
      )}
    </div>
  )
}

const btnPrimary: any = {
  background:'rgba(52,211,153,0.15)', border:'1px solid rgba(52,211,153,0.5)',
  color:'#34d399', padding:'8px 16px', fontFamily:'Space Mono, monospace',
  fontSize:10, letterSpacing:2, cursor:'pointer', borderRadius:4, fontWeight:700,
}
const btnGhost: any = {
  background:'transparent', border:'1px solid rgba(80,180,255,0.3)',
  color:'rgba(128,192,255,0.85)', padding:'8px 16px', fontFamily:'Space Mono, monospace',
  fontSize:10, letterSpacing:2, cursor:'pointer', borderRadius:4,
}
const btnMini: any = {
  background:'transparent', border:'1px solid rgba(80,180,255,0.2)',
  color:'rgba(128,192,255,0.7)', padding:'4px 10px', fontFamily:'Space Mono, monospace',
  fontSize:9, letterSpacing:1.5, cursor:'pointer', borderRadius:3,
}
