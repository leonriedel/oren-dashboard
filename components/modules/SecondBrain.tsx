'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import ModuleLayout from '@/components/ModuleLayout'
import { Card, SectionTitle, ItemRow } from '@/components/UI'
import type { User } from '@supabase/supabase-js'

interface Props { user: User; onBack: () => void }

export default function SecondBrain({ user, onBack }: Props) {
  const supabase = createClient()
  const [prios, setPrios] = useState<any[]>([])
  const [goals, setGoals] = useState<any[]>([])
  const [nn, setNn] = useState<any[]>([])
  const [newPrio, setNewPrio] = useState('')
  const [newGoal, setNewGoal] = useState('')
  const [loading, setLoading] = useState(true)

  const defaultNN = [
    { emoji:'💪', label:'SPORT', done:false, sort_order:0 },
    { emoji:'🧘', label:'MEDITATION', done:false, sort_order:1 },
    { emoji:'📧', label:'MAILS', done:false, sort_order:2 },
    { emoji:'📸', label:'INSTA-POST', done:false, sort_order:3 },
    { emoji:'⚡', label:'OREN', done:false, sort_order:4 },
  ]

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [p, g, n] = await Promise.all([
      supabase.from('priorities').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('goals').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('non_negotiables').select('*').eq('user_id', user.id).order('sort_order'),
    ])
    setPrios(p.data || [])
    setGoals(g.data || [])
    if (!n.data?.length) {
      // seed defaults
      const { data } = await supabase.from('non_negotiables').insert(defaultNN.map(d => ({ ...d, user_id: user.id }))).select()
      setNn(data || [])
    } else setNn(n.data)
    setLoading(false)
  }

  async function addPrio() {
    if (!newPrio.trim()) return
    const { data } = await supabase.from('priorities').insert({ user_id: user.id, text: newPrio.trim(), done: false }).select().single()
    if (data) setPrios(prev => [...prev, data])
    setNewPrio('')
  }

  async function togglePrio(id: string, done: boolean) {
    await supabase.from('priorities').update({ done: !done }).eq('id', id)
    setPrios(prev => prev.map(p => p.id === id ? { ...p, done: !done } : p))
  }

  async function deletePrio(id: string) {
    await supabase.from('priorities').delete().eq('id', id)
    setPrios(prev => prev.filter(p => p.id !== id))
  }

  async function addGoal() {
    if (!newGoal.trim()) return
    const { data } = await supabase.from('goals').insert({ user_id: user.id, text: newGoal.trim(), done: false }).select().single()
    if (data) setGoals(prev => [...prev, data])
    setNewGoal('')
  }

  async function toggleGoal(id: string, done: boolean) {
    await supabase.from('goals').update({ done: !done }).eq('id', id)
    setGoals(prev => prev.map(g => g.id === id ? { ...g, done: !done } : g))
  }

  async function deleteGoal(id: string) {
    await supabase.from('goals').delete().eq('id', id)
    setGoals(prev => prev.filter(g => g.id !== id))
  }

  async function toggleNN(id: string, done: boolean) {
    await supabase.from('non_negotiables').update({ done: !done }).eq('id', id)
    setNn(prev => prev.map(n => n.id === id ? { ...n, done: !done } : n))
  }

  const donePrios = prios.filter(p => p.done).length
  const doneGoals = goals.filter(g => g.done).length
  const doneNN = nn.filter(n => n.done).length
  const total = prios.length + goals.length + nn.length
  const done = donePrios + doneGoals + doneNN
  const pct = total ? Math.round(done / total * 100) : 0

  const recs = ['Deep Work Block: Ablenkungen minimieren.','Top Prio zuerst — alles andere ist zweitrangig.','Energie hoch? Jetzt die härteste Aufgabe.','Review: Was hat heute funktioniert?','Wochenende nutzen: Planen, reflektieren, aufladen.']
  const rec = recs[new Date().getDay() % recs.length]

  return (
    <ModuleLayout onBack={onBack} icon="🧠" title="SECONDBRAIN" titleColor="#00aadd" sub="Daily Operations & Execution" iconBg="linear-gradient(135deg, #005577, #0088bb)">
      {/* Mission */}
      <div style={{ background:'linear-gradient(135deg, rgba(0,212,255,0.05), rgba(0,68,170,0.1))', border:'1px solid rgba(0,212,255,0.15)', borderRadius:16, padding:20, marginBottom:12 }}>
        <div style={{ fontFamily:'var(--mono)', fontSize:10, letterSpacing:2, color:'var(--muted2)', marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--cyan)', display:'inline-block' }} />
          MISSION HEUTE
        </div>
        <div style={{ fontSize:18, fontWeight:600, lineHeight:1.4, marginBottom:14 }}>System aufbauen. Prozesse automatisieren. Fokus halten.</div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          {[['var(--amber)','ENERGIE: Hoch'],['var(--cyan)','FOKUS: Deep Work'],['var(--green)','MODUS: Builder']].map(([c,l]) => (
            <div key={l} style={{ fontSize:11, padding:'4px 12px', borderRadius:20, background:`rgba(255,255,255,0.05)`, color:c, fontFamily:'var(--mono)', display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:c as string, display:'inline-block' }} />{l}
            </div>
          ))}
        </div>
      </div>

      {/* Momentum */}
      <Card>
        <SectionTitle color="var(--cyan)">MOMENTUM</SectionTitle>
        <div style={{ height:6, background:'var(--bg3)', borderRadius:3, overflow:'hidden', marginBottom:12 }}>
          <div style={{ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg, var(--cyan2), var(--cyan))', borderRadius:3, transition:'width 0.6s ease' }} />
        </div>
        <div style={{ display:'flex', gap:24 }}>
          {[['TAG', pct+'%'],['PRIOS', prios.length ? Math.round(donePrios/prios.length*100)+'%' : '0%'],['GOALS', goals.length ? Math.round(doneGoals/goals.length*100)+'%' : '0%']].map(([l,v]) => (
            <div key={l} style={{ fontFamily:'var(--mono)', fontSize:12 }}>
              <span style={{ color:'var(--cyan)', fontWeight:700 }}>{v}</span>{' '}
              <span style={{ color:'var(--muted)', fontSize:10 }}>{l}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Oren rec */}
      <div style={{ display:'flex', gap:10, padding:14, background:'var(--card2)', borderRadius:12, marginBottom:12, border:'1px solid var(--border)' }}>
        <span style={{ fontSize:18 }}>🤖</span>
        <div>
          <div style={{ fontFamily:'var(--mono)', fontSize:10, letterSpacing:2, color:'var(--cyan)', marginBottom:5 }}>OREN EMPFIEHLT</div>
          <div style={{ fontSize:13, color:'var(--muted2)', lineHeight:1.5 }}>{rec}</div>
        </div>
      </div>

      {/* Top Prio */}
      <Card>
        <SectionTitle color="var(--red)" action={<button onClick={() => {}} style={{ background:'none', border:'none', color:'var(--cyan)', fontSize:20, cursor:'pointer', lineHeight:1 }}>+</button>}>TOP PRIO</SectionTitle>
        {!prios.length && <div style={{ color:'var(--muted)', fontSize:13, textAlign:'center', padding:'8px 0' }}>Keine Prioritäten — hinzufügen ↓</div>}
        {prios.map(p => (
          <ItemRow key={p.id}>
            <div onClick={() => togglePrio(p.id, p.done)} style={{ width:20, height:20, borderRadius:'50%', border:`1.5px solid ${p.done ? 'var(--green)' : 'var(--border2)'}`, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, background:p.done?'var(--green)':'transparent', flexShrink:0 }}>{p.done ? '✓' : ''}</div>
            <div style={{ flex:1, fontSize:14, textDecoration:p.done?'line-through':'none', color:p.done?'var(--muted)':'var(--text)' }}>{p.text}</div>
            <div onClick={() => deletePrio(p.id)} style={{ cursor:'pointer', color:'var(--muted)', fontSize:18, padding:'0 4px' }}>×</div>
          </ItemRow>
        ))}
        <div style={{ display:'flex', gap:10, marginTop:12 }}>
          <input value={newPrio} onChange={e => setNewPrio(e.target.value)} onKeyDown={e => e.key==='Enter'&&addPrio()} placeholder="Aufgabe hinzufügen..." style={{ flex:1, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', color:'var(--text)', fontSize:13, outline:'none' }} />
          <button onClick={addPrio} style={{ width:38, height:38, borderRadius:'50%', background:'var(--cyan2)', border:'none', cursor:'pointer', color:'white', fontSize:20, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
        </div>
      </Card>

      {/* Non-Negotiables */}
      <Card>
        <SectionTitle color="var(--amber)" action={<span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--muted2)' }}>{doneNN}/{nn.length}</span>}>NON-NEGOTIABLES</SectionTitle>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8 }}>
          {nn.map(n => (
            <div key={n.id} onClick={() => toggleNN(n.id, n.done)} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, padding:'12px 6px', borderRadius:12, border:`1px solid ${n.done ? 'rgba(0,212,255,0.4)' : 'var(--border)'}`, background:n.done ? 'rgba(0,212,255,0.08)' : 'var(--card2)', cursor:'pointer', transition:'all 0.2s' }}>
              <span style={{ fontSize:22 }}>{n.emoji}</span>
              <span style={{ fontSize:9, letterSpacing:1, color:'var(--muted)', textTransform:'uppercase', textAlign:'center' }}>{n.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Weekly Goals */}
      <Card>
        <SectionTitle color="var(--green)">WEEKLY GOALS</SectionTitle>
        {!goals.length && <div style={{ color:'var(--muted)', fontSize:13, textAlign:'center', padding:'8px 0' }}>Keine Goals — hinzufügen ↓</div>}
        {goals.map(g => (
          <ItemRow key={g.id}>
            <div onClick={() => toggleGoal(g.id, g.done)} style={{ width:20, height:20, borderRadius:'50%', border:`1.5px solid ${g.done?'var(--green)':'var(--border2)'}`, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, background:g.done?'var(--green)':'transparent', flexShrink:0 }}>{g.done?'✓':''}</div>
            <div style={{ flex:1, fontSize:14, textDecoration:g.done?'line-through':'none', color:g.done?'var(--muted)':'var(--text)' }}>{g.text}</div>
            <div onClick={() => deleteGoal(g.id)} style={{ cursor:'pointer', color:'var(--muted)', fontSize:18, padding:'0 4px' }}>×</div>
          </ItemRow>
        ))}
        <div style={{ display:'flex', gap:10, marginTop:12 }}>
          <input value={newGoal} onChange={e => setNewGoal(e.target.value)} onKeyDown={e => e.key==='Enter'&&addGoal()} placeholder="Goal hinzufügen..." style={{ flex:1, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', color:'var(--text)', fontSize:13, outline:'none' }} />
          <button onClick={addGoal} style={{ width:38, height:38, borderRadius:'50%', background:'var(--cyan2)', border:'none', cursor:'pointer', color:'white', fontSize:20, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
        </div>
      </Card>
    </ModuleLayout>
  )
}
