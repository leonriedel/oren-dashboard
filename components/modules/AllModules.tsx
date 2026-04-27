'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import ModuleLayout from '@/components/ModuleLayout'
import { Card, SectionTitle, ItemRow, MetricGrid, FullBtn } from '@/components/UI'
import type { User } from '@supabase/supabase-js'

interface Props { user: User; onBack: () => void }

// ============================================================
// INVESTMENTS
// ============================================================
export function Investments({ user, onBack }: Props) {
  const supabase = createClient()
  const [investments, setInvestments] = useState<any[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ category:'stocks', name:'', invested:'', current:'' })

  useEffect(() => { supabase.from('investments').select('*').eq('user_id', user.id).then(r => setInvestments(r.data || [])) }, [])

  async function add() {
    if (!form.name || !form.invested) return
    const { data } = await supabase.from('investments').insert({ user_id:user.id, category:form.category, name:form.name, invested:parseFloat(form.invested), current_value:parseFloat(form.current||form.invested) }).select().single()
    if (data) setInvestments(p => [...p, data])
    setForm({ category:'stocks', name:'', invested:'', current:'' }); setShowAdd(false)
  }

  const cats = ['stocks','crypto','realestate','startups','other']
  const catLabels: Record<string,string> = { stocks:'Stocks / ETFs', crypto:'Crypto', realestate:'Real Estate', startups:'Startups / Equity', other:'Other' }
  const totalInv = investments.reduce((a,b) => a+Number(b.invested), 0)
  const totalCur = investments.reduce((a,b) => a+Number(b.current_value), 0)
  const ret = totalInv ? ((totalCur-totalInv)/totalInv*100).toFixed(1)+'%' : '—'
  function fmt(n:number) { return n>=1000000?(n/1000000).toFixed(1)+'M €':n>=1000?(n/1000).toFixed(1)+'K €':n.toFixed(0)+' €' }

  return (
    <ModuleLayout onBack={onBack} icon="📈" title="INVESTMENTS" titleColor="var(--amber)" sub="Portfolio & Returns" iconBg="linear-gradient(135deg, #5c4500, #c78800)">
      <Card>
        <SectionTitle color="var(--amber)">PORTFOLIO OVERVIEW</SectionTitle>
        <MetricGrid items={[
          { label:'INVESTED', value: totalInv ? fmt(totalInv) : '—', color:'var(--amber)' },
          { label:'CURRENT VALUE', value: totalCur ? fmt(totalCur) : '—', color:'var(--amber)' },
          { label:'RETURN', value: ret, color: totalCur >= totalInv ? 'var(--green)' : 'var(--red)' },
        ]} />
      </Card>
      <Card>
        <SectionTitle color="var(--cyan)">CATEGORIES</SectionTitle>
        {cats.map(c => {
          const items = investments.filter(i => i.category === c)
          const val = items.reduce((a,b) => a+Number(b.current_value), 0)
          return (
            <div key={c} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
              <span style={{ fontSize:14 }}>{catLabels[c]}</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:13, color: val ? 'var(--amber)' : 'var(--muted2)' }}>{val ? fmt(val) : '—'}</span>
            </div>
          )
        })}
      </Card>
      {showAdd ? (
        <Card style={{ border:'1px solid var(--border2)' }}>
          <div style={{ fontFamily:'var(--mono)', fontSize:12, color:'var(--amber)', marginBottom:12 }}>INVESTMENT HINZUFÜGEN</div>
          {[['select','category',['stocks','crypto','realestate','startups','other']],['text','name','Name / Ticker'],['number','invested','Investiert (€)'],['number','current','Aktueller Wert (€)']].map(([type, key, opts]) => (
            type === 'select' ? (
              <select key={key as string} value={(form as any)[key as string]} onChange={e => setForm(p => ({...p, [key as string]:e.target.value}))} style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', color:'var(--text)', fontSize:13, outline:'none', marginBottom:8 }}>
                {(opts as string[]).map(o => <option key={o} value={o}>{catLabels[o]||o}</option>)}
              </select>
            ) : (
              <input key={key as string} type={type as string} placeholder={opts as string} value={(form as any)[key as string]} onChange={e => setForm(p => ({...p, [key as string]:e.target.value}))} style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', color:'var(--text)', fontSize:13, outline:'none', marginBottom:8 }} />
            )
          ))}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setShowAdd(false)} style={{ flex:1, padding:10, borderRadius:10, border:'1px solid var(--border)', background:'transparent', color:'var(--muted2)', cursor:'pointer', fontFamily:'var(--mono)', fontSize:11 }}>ABBRECHEN</button>
            <button onClick={add} style={{ flex:1, padding:10, borderRadius:10, border:'none', background:'var(--amber)', color:'black', cursor:'pointer', fontFamily:'var(--mono)', fontSize:11 }}>SPEICHERN</button>
          </div>
        </Card>
      ) : (
        <FullBtn onClick={() => setShowAdd(true)} color="var(--amber)" borderColor="rgba(255,179,0,0.3)">+ ADD INVESTMENT</FullBtn>
      )}
    </ModuleLayout>
  )
}

// ============================================================
// NEWS (static + refresh)
// ============================================================
const NEWS_DATA = {
  general: [
    { source:'Spiegel', headline:'Jeff Bezos: Vom Trump-Gegner zum Kumpel — Psychogramm eines gefallenen Idealisten', time:'jetzt' },
    { source:'Spiegel', headline:'Deutsche Bahn will offenbar 20 Milliarden für schönere Bahnhöfe ausgeben', time:'2h' },
    { source:'Handelsblatt', headline:'Fed hält Zinsen stabil — Märkte reagieren verhalten', time:'3h' },
    { source:'FAZ', headline:'KI-Regulierung: EU-Kommission verschärft Anforderungen für Unternehmen', time:'4h' },
  ],
  f1: [
    { source:'Formel1.de', headline:'Warum Red Bull dringend einen namhaften Neuzugang braucht', time:'jetzt' },
    { source:'Formel1.de', headline:'Lando Norris in TIME-100-Liste: Paris Hilton adelt den Weltmeister', time:'1h' },
    { source:'Motorsport', headline:'Monaco GP Preview: Wer dominiert auf dem Stadtkurs?', time:'5h' },
  ],
}

export function News({ user, onBack }: Props) {
  return (
    <ModuleLayout onBack={onBack} icon="📰" title="NEWS" titleColor="#4a9edd" sub="Intel & Headlines" iconBg="linear-gradient(135deg, #0a3a5c, #1466a0)">
      {Object.entries(NEWS_DATA).map(([key, items]) => (
        <Card key={key}>
          <SectionTitle color="var(--cyan)">{key === 'general' ? 'INTEL · NEWS' : '🏎️ F1'}</SectionTitle>
          {items.map((n, i) => (
            <div key={i} style={{ padding:'13px 0', borderBottom: i < items.length-1 ? '1px solid var(--border)' : 'none', cursor:'pointer' }}>
              <div style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--cyan)', letterSpacing:1, marginBottom:5, display:'flex', gap:8 }}>
                {n.source} <span style={{ color:'var(--muted)' }}>{n.time}</span>
              </div>
              <div style={{ fontSize:14, lineHeight:1.5 }}>{n.headline}</div>
            </div>
          ))}
        </Card>
      ))}
      <Card>
        <SectionTitle color="var(--amber)">BUSINESS INTEL</SectionTitle>
        <FullBtn onClick={() => {}} color="var(--amber)" borderColor="rgba(255,179,0,0.2)">+ QUELLE HINZUFÜGEN</FullBtn>
      </Card>
    </ModuleLayout>
  )
}

// ============================================================
// THINKSPACE
// ============================================================
export function ThinkSpace({ user, onBack }: Props) {
  const supabase = createClient()
  const [entries, setEntries] = useState<any[]>([])
  const [text, setText] = useState('')
  const [activeList, setActiveList] = useState<string|null>(null)

  useEffect(() => { supabase.from('thinkspace').select('*').eq('user_id', user.id).order('created_at', { ascending:false }).then(r => setEntries(r.data||[])) }, [])

  async function save(type: string) {
    if (!text.trim()) return
    const { data } = await supabase.from('thinkspace').insert({ user_id:user.id, type, text:text.trim() }).select().single()
    if (data) setEntries(p => [data, ...p])
    setText('')
  }

  async function del(id: string) {
    await supabase.from('thinkspace').delete().eq('id', id)
    setEntries(p => p.filter(e => e.id !== id))
  }

  const types = [
    { key:'idea', icon:'💡', label:'Ideas', color:'var(--purple)' },
    { key:'strategy', icon:'🎯', label:'Strategies', color:'var(--cyan)' },
    { key:'decision', icon:'📋', label:'Decisions', color:'var(--amber)' },
    { key:'future', icon:'✨', label:'Future Plans', color:'var(--green)' },
  ]

  return (
    <ModuleLayout onBack={onBack} icon="💡" title="THINKSPACE" titleColor="var(--purple)" sub="Strategy & Deep Thinking" iconBg="linear-gradient(135deg, #3b1a6e, #7c3aed)">
      <Card>
        <SectionTitle color="var(--purple)">DEEP CAPTURE</SectionTitle>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="What's on your mind? Write freely — strategy, ideas, decisions, future thinking..." style={{ width:'100%', background:'var(--bg3)', border:'1px solid rgba(168,85,247,0.3)', borderRadius:12, padding:16, color:'var(--text)', fontSize:14, lineHeight:1.6, resize:'none', minHeight:120, outline:'none' }} />
        <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
          {types.map(t => (
            <button key={t.key} onClick={() => save(t.key)} style={{ padding:'7px 14px', borderRadius:20, border:`1px solid ${t.color}44`, background:`${t.color}14`, color:t.color, fontSize:12, cursor:'pointer', fontFamily:'var(--mono)' }}>→ {t.label.toUpperCase()}</button>
          ))}
        </div>
      </Card>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
        {types.map(t => {
          const count = entries.filter(e => e.type === t.key).length
          return (
            <div key={t.key} onClick={() => setActiveList(activeList === t.key ? null : t.key)} style={{ background:'var(--card2)', borderRadius:14, padding:16, border:`1px solid ${activeList===t.key ? t.color+'44' : 'var(--border)'}`, cursor:'pointer', transition:'border-color 0.2s' }}>
              <div style={{ fontSize:16, marginBottom:8 }}>{t.icon}</div>
              <div style={{ fontSize:13, fontWeight:500, marginBottom:4 }}>{t.label}</div>
              <div style={{ fontFamily:'var(--mono)', fontSize:24, fontWeight:700, color:t.color }}>{count}</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>entries</div>
            </div>
          )
        })}
      </div>
      {activeList && (
        <Card>
          <SectionTitle color="var(--purple)">{types.find(t=>t.key===activeList)?.icon} {types.find(t=>t.key===activeList)?.label.toUpperCase()}</SectionTitle>
          {entries.filter(e => e.type === activeList).map(e => (
            <ItemRow key={e.id}>
              <div style={{ flex:1, fontSize:13, lineHeight:1.5 }}>{e.text}</div>
              <div onClick={() => del(e.id)} style={{ cursor:'pointer', color:'var(--muted)', fontSize:18 }}>×</div>
            </ItemRow>
          ))}
          {!entries.filter(e => e.type === activeList).length && <div style={{ color:'var(--muted)', fontSize:13 }}>Keine Einträge</div>}
        </Card>
      )}
    </ModuleLayout>
  )
}

// ============================================================
// SPORT & ERNÄHRUNG
// ============================================================
export function Sport({ user, onBack }: Props) {
  const supabase = createClient()
  const [training, setTraining] = useState<any[]>([])
  const [food, setFood] = useState<any[]>([])
  const [newFood, setNewFood] = useState('')
  const [showTraining, setShowTraining] = useState(false)
  const [tf, setTf] = useState({ day:'Montag', exercise:'' })

  useEffect(() => {
    Promise.all([
      supabase.from('training').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('food_notes').select('*').eq('user_id', user.id).order('created_at'),
    ]).then(([t, f]) => {
      setTraining(t.data||[])
      if (!f.data?.length) {
        supabase.from('food_notes').insert([
          { user_id:user.id, text:'WPF - Wolf Protein Fasten!! Mittags Shake! - Auch wenn. man Gäste hat!' },
          { user_id:user.id, text:'2 Mahlzeiten am Tag, Weizen vermeiden' },
        ]).select().then(r => setFood(r.data||[]))
      } else setFood(f.data)
    })
  }, [])

  async function addFood() {
    if (!newFood.trim()) return
    const { data } = await supabase.from('food_notes').insert({ user_id:user.id, text:newFood.trim() }).select().single()
    if (data) setFood(p => [...p, data])
    setNewFood('')
  }

  async function delFood(id: string) {
    await supabase.from('food_notes').delete().eq('id', id)
    setFood(p => p.filter(f => f.id !== id))
  }

  async function addTraining() {
    if (!tf.exercise.trim()) return
    const { data } = await supabase.from('training').insert({ user_id:user.id, day:tf.day, exercise:tf.exercise.trim() }).select().single()
    if (data) setTraining(p => [...p, data])
    setTf({ day:'Montag', exercise:'' }); setShowTraining(false)
  }

  async function delTraining(id: string) {
    await supabase.from('training').delete().eq('id', id)
    setTraining(p => p.filter(t => t.id !== id))
  }

  return (
    <ModuleLayout onBack={onBack} icon="🏋️" title="SPORT & ERNÄHRUNG" titleColor="var(--orange)" sub="Body & Performance" iconBg="linear-gradient(135deg, #5c2000, #c45200)">
      <Card>
        <SectionTitle color="var(--orange)" action={<span style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--muted2)' }}>{training.length} days</span>}>TRAINING PLANS</SectionTitle>
        {training.map(t => (
          <ItemRow key={t.id}>
            <span style={{ fontSize:18 }}>💪</span>
            <div style={{ flex:1 }}><strong>{t.day}</strong> — {t.exercise}</div>
            <div onClick={() => delTraining(t.id)} style={{ cursor:'pointer', color:'var(--muted)', fontSize:18 }}>×</div>
          </ItemRow>
        ))}
        {showTraining ? (
          <div style={{ marginTop:12 }}>
            <select value={tf.day} onChange={e => setTf(p => ({...p, day:e.target.value}))} style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', color:'var(--text)', fontSize:13, outline:'none', marginBottom:8 }}>
              {['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'].map(d => <option key={d}>{d}</option>)}
            </select>
            <input placeholder="Übungen / Plan..." value={tf.exercise} onChange={e => setTf(p => ({...p, exercise:e.target.value}))} style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', color:'var(--text)', fontSize:13, outline:'none', marginBottom:8 }} />
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setShowTraining(false)} style={{ flex:1, padding:10, borderRadius:10, border:'1px solid var(--border)', background:'transparent', color:'var(--muted2)', cursor:'pointer', fontFamily:'var(--mono)', fontSize:11 }}>ABBRECHEN</button>
              <button onClick={addTraining} style={{ flex:1, padding:10, borderRadius:10, border:'none', background:'var(--orange)', color:'white', cursor:'pointer', fontFamily:'var(--mono)', fontSize:11 }}>SPEICHERN</button>
            </div>
          </div>
        ) : (
          <FullBtn onClick={() => setShowTraining(true)} color="var(--orange)" borderColor="rgba(255,107,53,0.3)">+ ADD TRAINING DAY</FullBtn>
        )}
      </Card>
      <Card>
        <SectionTitle color="var(--orange)">🍎 ERNÄHRUNG — NOTIZEN</SectionTitle>
        {food.map(f => (
          <div key={f.id} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--orange)', marginTop:6, flexShrink:0 }} />
            <div style={{ flex:1, fontSize:14, lineHeight:1.5 }}>{f.text}</div>
            <div onClick={() => delFood(f.id)} style={{ cursor:'pointer', color:'var(--muted)', fontSize:18 }}>×</div>
          </div>
        ))}
        <div style={{ display:'flex', gap:10, marginTop:12 }}>
          <input value={newFood} onChange={e => setNewFood(e.target.value)} onKeyDown={e => e.key==='Enter'&&addFood()} placeholder="Tipp, Regel, Beobachtung..." style={{ flex:1, background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', color:'var(--text)', fontSize:13, outline:'none' }} />
          <button onClick={addFood} style={{ width:38, height:38, borderRadius:'50%', background:'var(--orange)', border:'none', cursor:'pointer', color:'white', fontSize:20, display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
        </div>
      </Card>
    </ModuleLayout>
  )
}

// ============================================================
// SOCIAL MEDIA
// ============================================================
export function SocialMedia({ user, onBack }: Props) {
  const supabase = createClient()
  const [content, setContent] = useState<any[]>([])
  const [pipeline, setPipeline] = useState<any[]>([])
  const [dumps, setDumps] = useState<any[]>([])
  const [targets, setTargets] = useState({ reels:0, posts:0 })
  const [pipelineFilter, setPipelineFilter] = useState('all')
  const [showAdd, setShowAdd] = useState<'today'|'pipeline'|'targets'|null>(null)
  const [form, setForm] = useState({ type:'REEL', text:'', status:'idea' })
  const [dump, setDump] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const today = new Date().toISOString().split('T')[0]
    const [c, p, d, t] = await Promise.all([
      supabase.from('content_items').select('*').eq('user_id', user.id).eq('is_today', true).gte('created_at', today).order('created_at'),
      supabase.from('content_items').select('*').eq('user_id', user.id).eq('is_today', false).order('created_at', { ascending:false }),
      supabase.from('brain_dump').select('*').eq('user_id', user.id).order('created_at', { ascending:false }),
      supabase.from('weekly_targets').select('*').eq('user_id', user.id).order('created_at', { ascending:false }).limit(1).single(),
    ])
    setContent(c.data||[])
    setPipeline(p.data||[])
    setDumps(d.data||[])
    if (t.data) setTargets({ reels:t.data.reels, posts:t.data.posts })
  }

  async function addContent() {
    if (!form.text.trim()) return
    const { data } = await supabase.from('content_items').insert({ user_id:user.id, type:form.type, text:form.text.trim(), is_today: showAdd==='today', pipeline_status: showAdd==='pipeline' ? form.status : 'idea' }).select().single()
    if (data) { showAdd==='today' ? setContent(p=>[...p,data]) : setPipeline(p=>[...p,data]) }
    setForm({ type:'REEL', text:'', status:'idea' }); setShowAdd(null)
  }

  async function toggleContent(id:string, done:boolean) {
    await supabase.from('content_items').update({ done:!done }).eq('id', id)
    setContent(p => p.map(c => c.id===id ? {...c, done:!done} : c))
  }

  async function saveDump() {
    if (!dump.trim()) return
    const { data } = await supabase.from('brain_dump').insert({ user_id:user.id, text:dump.trim() }).select().single()
    if (data) setDumps(p => [data, ...p])
    setDump('')
  }

  const shipped = content.filter(c => c.done).length
  const filteredPipeline = pipelineFilter === 'all' ? pipeline : pipeline.filter(p => p.pipeline_status === pipelineFilter)
  const tabs = ['all','idea','progress','ready','posted']

  return (
    <ModuleLayout onBack={onBack} icon="📲" title="SOCIAL MEDIA" titleColor="var(--pink)" sub="Content & Growth Engine" iconBg="linear-gradient(135deg, #5c0030, #c0115e)">
      <Card style={{ borderColor:'rgba(236,72,153,0.2)' }}>
        <SectionTitle color="var(--pink)" action={<button onClick={() => setShowAdd('today')} style={{ background:'none', border:'none', color:'var(--pink)', fontSize:20, cursor:'pointer', lineHeight:1 }}>+</button>}>
          TODAY'S CONTENT <span style={{ fontFamily:'var(--mono)', fontSize:10, color:'var(--muted2)', fontWeight:400 }}>{shipped}/{content.length} SHIPPED</span>
        </SectionTitle>
        {!content.length && <div style={{ color:'var(--muted)', fontSize:13 }}>Kein Content heute geplant</div>}
        {content.map(item => (
          <div key={item.id} style={{ display:'flex', gap:12, padding:'12px 0', borderBottom:'1px solid var(--border)' }}>
            <div onClick={() => toggleContent(item.id, item.done)} style={{ width:22, height:22, borderRadius:'50%', border:`1.5px solid ${item.done?'var(--pink)':'var(--border2)'}`, flexShrink:0, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, background:item.done?'var(--pink)':'transparent' }}>{item.done?'✓':''}</div>
            <div>
              <div style={{ fontSize:10, letterSpacing:1.5, color:'var(--muted2)', textTransform:'uppercase', marginBottom:4, fontFamily:'var(--mono)' }}>{item.type}</div>
              <div style={{ fontSize:13, lineHeight:1.5, textDecoration:item.done?'line-through':'none', color:item.done?'var(--muted)':'var(--text)' }}>{item.text}</div>
            </div>
          </div>
        ))}
      </Card>

      <Card>
        <SectionTitle color="var(--pink)" action={<span onClick={() => setShowAdd('targets')} style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--muted2)', cursor:'pointer' }}>EDIT</span>}>WEEKLY PUSH</SectionTitle>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          {[['REELS', content.filter(c=>c.type==='REEL'&&c.done).length, targets.reels],['POSTS', content.filter(c=>c.type==='POST'&&c.done).length, targets.posts]].map(([l,d,t]) => (
            <div key={l as string} style={{ background:'rgba(236,72,153,0.06)', border:'1px solid rgba(236,72,153,0.15)', borderRadius:12, padding:'14px', textAlign:'center' }}>
              <div style={{ fontSize:10, letterSpacing:2, color:'rgba(236,72,153,0.6)', textTransform:'uppercase', marginBottom:8 }}>{l}</div>
              <div style={{ fontFamily:'var(--mono)', fontSize:18, color:'var(--pink)' }}>{d}/{t}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle color="var(--purple)" action={<button onClick={() => setShowAdd('pipeline')} style={{ background:'none', border:'none', color:'var(--pink)', fontSize:20, cursor:'pointer', lineHeight:1 }}>+</button>}>CONTENT PIPELINE</SectionTitle>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setPipelineFilter(t)} style={{ padding:'5px 12px', borderRadius:20, border:'1px solid var(--border)', background: pipelineFilter===t ? 'var(--pink)' : 'transparent', color: pipelineFilter===t ? 'white' : 'var(--muted2)', fontSize:11, cursor:'pointer', fontFamily:'var(--mono)', letterSpacing:1 }}>{t.toUpperCase()}</button>
          ))}
        </div>
        {!filteredPipeline.length ? <div style={{ color:'var(--muted)', fontSize:13 }}>Pipeline is empty</div> : filteredPipeline.map(item => (
          <ItemRow key={item.id}>
            <span style={{ fontSize:11, padding:'3px 8px', borderRadius:20, background:'rgba(168,85,247,0.1)', color:'var(--purple)', fontFamily:'var(--mono)' }}>{item.pipeline_status?.toUpperCase()}</span>
            <div style={{ flex:1, fontSize:13 }}>{item.text}</div>
          </ItemRow>
        ))}
      </Card>

      <Card>
        <SectionTitle color="var(--amber)">BRAIN DUMP <span style={{ fontWeight:400, color:'var(--muted)', fontSize:10, marginLeft:4 }}>hooks · ideas · captions</span></SectionTitle>
        <textarea value={dump} onChange={e => setDump(e.target.value)} placeholder="Quick capture — hook, idea, caption, observation..." style={{ width:'100%', background:'var(--bg3)', border:'1px solid rgba(236,72,153,0.2)', borderRadius:12, padding:16, color:'var(--text)', fontSize:14, lineHeight:1.6, resize:'none', minHeight:80, outline:'none' }} />
        <button onClick={saveDump} style={{ marginTop:8, padding:'8px 16px', borderRadius:8, border:'1px solid rgba(236,72,153,0.3)', background:'rgba(236,72,153,0.08)', color:'var(--pink)', fontSize:12, cursor:'pointer', fontFamily:'var(--mono)' }}>SAVE NOTE</button>
        {dumps.map(d => (
          <div key={d.id} style={{ display:'flex', gap:10, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--pink)', marginTop:6, flexShrink:0 }} />
            <div style={{ flex:1, fontSize:13 }}>{d.text}</div>
          </div>
        ))}
      </Card>

      {/* Add Modal */}
      {showAdd && showAdd !== 'targets' && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:'20px 20px 0 0', padding:'24px 20px 40px', width:'100%', maxWidth:480 }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:13, color:'var(--pink)', marginBottom:16 }}>{showAdd === 'today' ? 'CONTENT HEUTE' : 'PIPELINE ITEM'}</div>
            <select value={form.type} onChange={e => setForm(p=>({...p,type:e.target.value}))} style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:'11px 14px', color:'var(--text)', fontSize:13, outline:'none', marginBottom:8 }}>
              {['REEL','POST','STORY','CAROUSEL'].map(t => <option key={t}>{t}</option>)}
            </select>
            <input placeholder="Content Beschreibung..." value={form.text} onChange={e => setForm(p=>({...p,text:e.target.value}))} style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:'11px 14px', color:'var(--text)', fontSize:13, outline:'none', marginBottom:8 }} />
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setShowAdd(null)} style={{ flex:1, padding:12, borderRadius:10, border:'1px solid var(--border)', background:'transparent', color:'var(--muted2)', cursor:'pointer', fontFamily:'var(--mono)', fontSize:11 }}>ABBRECHEN</button>
              <button onClick={addContent} style={{ flex:1, padding:12, borderRadius:10, border:'none', background:'var(--pink)', color:'white', cursor:'pointer', fontFamily:'var(--mono)', fontSize:11 }}>SPEICHERN</button>
            </div>
          </div>
        </div>
      )}
    </ModuleLayout>
  )
}

// ============================================================
// TALK TO OREN (Claude API)
// ============================================================
export function TalkToOren({ user, onBack }: Props) {
  const supabase = createClient()
  const [messages, setMessages] = useState([{ role:'assistant', content:`Hey! Ich bin OREN. Wie kann ich dir heute helfen, Leon?` }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  async function send() {
    if (!input.trim() || loading) return
    const userMsg = { role:'user', content:input.trim() }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs); setInput(''); setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ messages: newMsgs }),
      })
      const data = await res.json()
      const reply = { role:'assistant', content: data.content || 'Fehler beim Laden der Antwort.' }
      setMessages(p => [...p, reply])
      // save to db
      await supabase.from('chat_messages').insert([
        { user_id:user.id, role:'user', content:userMsg.content },
        { user_id:user.id, role:'assistant', content:reply.content },
      ])
    } catch {
      setMessages(p => [...p, { role:'assistant', content:'Verbindungsfehler. Bitte erneut versuchen.' }])
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', flexDirection:'column' }}>
      <div style={{ display:'flex', alignItems:'center', gap:14, padding:'20px 20px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg)' }}>
        <button onClick={onBack} style={{ width:34, height:34, borderRadius:'50%', background:'var(--card)', border:'1px solid var(--border)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted2)', fontSize:18 }}>‹</button>
        <div style={{ width:40, height:40, borderRadius:11, background:'linear-gradient(135deg, #006688, #00aadd)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🎙️</div>
        <div>
          <div style={{ fontFamily:'var(--mono)', fontSize:15, fontWeight:700, letterSpacing:2, color:'var(--cyan)' }}>TALK TO OREN</div>
          <div style={{ fontSize:10, letterSpacing:3, color:'var(--muted)' }}>AI · REAL-TIME</div>
        </div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display:'flex', justifyContent: m.role==='user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth:'85%', padding:'12px 16px', borderRadius:16, fontSize:14, lineHeight:1.6, background: m.role==='user' ? 'var(--cyan2)' : 'var(--card2)', border: m.role==='user' ? 'none' : '1px solid var(--border)', borderBottomRightRadius: m.role==='user' ? 4 : 16, borderBottomLeftRadius: m.role==='user' ? 16 : 4, color: m.role==='user' ? 'white' : 'var(--text)' }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display:'flex', justifyContent:'flex-start' }}>
            <div style={{ padding:'14px 16px', borderRadius:16, background:'var(--card2)', border:'1px solid var(--border)', display:'flex', gap:4, alignItems:'center' }}>
              {[0,0.2,0.4].map((d,i) => <span key={i} style={{ width:6, height:6, borderRadius:'50%', background:'var(--muted)', display:'inline-block', animation:`typing 1.2s ease-in-out ${d}s infinite` }} />)}
            </div>
          </div>
        )}
      </div>
      <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', display:'flex', gap:10, background:'var(--bg)' }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==='Enter'&&send()} placeholder="Frag mich alles..." style={{ flex:1, background:'var(--card)', border:'1px solid var(--border)', borderRadius:24, padding:'12px 18px', color:'var(--text)', fontSize:14, outline:'none' }} />
        <button onClick={send} disabled={loading} style={{ width:44, height:44, borderRadius:'50%', background:'var(--cyan2)', border:'none', cursor:'pointer', color:'white', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>↑</button>
      </div>
      <style>{`@keyframes typing { 0%,60%,100%{transform:translateY(0);opacity:0.4} 30%{transform:translateY(-6px);opacity:1} }`}</style>
    </div>
  )
}
