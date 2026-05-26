'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import ModuleLayout from '@/components/ModuleLayout'
import { Card, SectionTitle } from '@/components/UI'
import type { User } from '@supabase/supabase-js'

interface Props { user: User; onBack: () => void }

type Cat = { id: string; name: string; icon: string; sort_order: number }
type Inv = {
  id: string; category: string; name: string;
  invested: number; current_value: number;
  monthly_return: number; yearly_return: number;
  notes?: string;
}

export default function Investments({ user, onBack }: Props) {
  const supabase = createClient()
  const [cats, setCats] = useState<Cat[]>([])
  const [invs, setInvs] = useState<Inv[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<Inv>>({})
  const [adding, setAdding] = useState<string | null>(null)
  const [addDraft, setAddDraft] = useState<Partial<Inv>>({ name: '', invested: 0, current_value: 0, monthly_return: 0, yearly_return: 0 })
  const [addingCat, setAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [edgar, setEdgar] = useState<any>(null)

  useEffect(() => {
    load()
    fetch('/api/edgar').then(r => r.json()).then(setEdgar).catch(() => {})
  }, [])

  async function load() {
    setLoading(true)
    const [c, i] = await Promise.all([
      supabase.from('investment_categories').select('*').eq('user_id', user.id).order('sort_order'),
      supabase.from('investments_v2').select('*').eq('user_id', user.id).order('created_at'),
    ])
    setCats(c.data || [])
    setInvs(i.data || [])
    setLoading(false)
  }

  async function saveEdit(id: string) {
    await supabase.from('investments_v2').update({
      name: editDraft.name,
      invested: Number(editDraft.invested) || 0,
      current_value: Number(editDraft.current_value) || 0,
      monthly_return: Number(editDraft.monthly_return) || 0,
      yearly_return: Number(editDraft.yearly_return) || 0,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    setEditId(null)
    load()
  }

  async function addInvestment(cat: string) {
    if (!addDraft.name) return
    await supabase.from('investments_v2').insert({
      user_id: user.id, category: cat,
      name: addDraft.name,
      invested: Number(addDraft.invested) || 0,
      current_value: Number(addDraft.current_value) || 0,
      monthly_return: Number(addDraft.monthly_return) || 0,
      yearly_return: Number(addDraft.yearly_return) || 0,
    })
    setAddDraft({ name: '', invested: 0, current_value: 0, monthly_return: 0, yearly_return: 0 })
    setAdding(null)
    load()
  }

  async function delInvestment(id: string) {
    if (!confirm('Investment wirklich löschen?')) return
    await supabase.from('investments_v2').delete().eq('id', id)
    load()
  }

  async function addCategory() {
    if (!newCatName.trim()) return
    await supabase.from('investment_categories').insert({
      user_id: user.id, name: newCatName.trim(), icon: '◆', sort_order: cats.length + 10,
    })
    setNewCatName('')
    setAddingCat(false)
    load()
  }

  async function delCategory(id: string) {
    if (!confirm('Kategorie und alle Investments darin löschen?')) return
    const cat = cats.find(c => c.id === id)
    if (cat) await supabase.from('investments_v2').delete().eq('user_id', user.id).eq('category', cat.name)
    await supabase.from('investment_categories').delete().eq('id', id)
    load()
  }

  function fmt(n: number) {
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(2) + 'M'
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'K'
    return n.toFixed(0)
  }
  function fmtEur(n: number) { return n.toLocaleString('de-DE', { maximumFractionDigits: 0 }) }
  function color(n: number) {
    if (n > 0) return 'var(--green)'
    if (n < 0) return 'var(--red)'
    return 'var(--muted2)'
  }
  function prefix(n: number) { return n > 0 ? '+' : '' }

  // totals
  const allUserInv = invs.reduce((a, b) => a + Number(b.invested), 0)
  const allUserCur = invs.reduce((a, b) => a + Number(b.current_value), 0)
  const allUserMonthly = invs.reduce((a, b) => a + Number(b.monthly_return), 0)
  const allUserYearly = invs.reduce((a, b) => a + Number(b.yearly_return), 0)

  const edgarPv = edgar?.latest?.portfolio_value || 0
  const edgarMonth = edgar?.pnl?.monthly?.value || 0
  const edgarYear = edgar?.pnl?.monthly?.value ? edgar.pnl.monthly.value * 12 : 0

  const totalCurrent = allUserCur + edgarPv
  const totalMonthly = allUserMonthly + edgarMonth
  const totalYearly = allUserYearly + edgarYear

  return (
    <ModuleLayout
      onBack={onBack}
      icon="💰"
      title="INVESTMENTS"
      titleColor="var(--cyan)"
      sub="Wealth & Portfolio"
      iconBg="linear-gradient(135deg, rgba(60,120,200,0.4), rgba(100,180,255,0.2))"
    >
      {/* HERO */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(80,160,255,0.06), rgba(40,100,200,0.10))',
        border: '1px solid rgba(80,180,255,0.20)',
        borderLeft: '2px solid var(--cyan)',
        borderRadius: 4, padding: 24, marginBottom: 18,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 32 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 3, color: 'var(--muted2)', marginBottom: 8 }}>TOTAL CURRENT</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 32, color: 'var(--cyan)', fontWeight: 700 }}>€{fmtEur(totalCurrent)}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>Invested €{fmtEur(allUserInv)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 3, color: 'var(--muted2)', marginBottom: 8 }}>MONTHLY RETURN</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 28, color: color(totalMonthly), fontWeight: 700 }}>{prefix(totalMonthly)}€{fmt(totalMonthly)}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>{totalCurrent ? (totalMonthly / totalCurrent * 100).toFixed(2) : '0'}%</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 3, color: 'var(--muted2)', marginBottom: 8 }}>YEARLY RETURN</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 28, color: color(totalYearly), fontWeight: 700 }}>{prefix(totalYearly)}€{fmt(totalYearly)}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>{totalCurrent ? (totalYearly / totalCurrent * 100).toFixed(2) : '0'}%</div>
          </div>
        </div>
      </div>

      {/* EDGAR ROW */}
      <Card style={{ borderLeft: '2px solid #10b981' }}>
        <SectionTitle color="#10b981" action={<span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted2)' }}>LIVE FROM EDGAR</span>}>
          🤖 EDGAR · AUTONOMOUS TRADING
        </SectionTitle>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr',
          gap: 14, padding: '8px 14px', alignItems: 'center',
          fontFamily: 'var(--mono)', fontSize: 12,
          background: 'rgba(4,28,20,0.45)', borderRadius: 3,
          border: '1px solid rgba(16,185,129,0.18)',
        }}>
          <span style={{ color: '#fff', fontWeight: 700 }}>Paper Trading · Multi-Asset</span>
          <span style={{ color: '#10b981' }}>${fmtEur(edgarPv)}</span>
          <span style={{ color: color(edgarMonth) }}>{prefix(edgarMonth)}${fmt(edgarMonth)}</span>
          <span style={{ color: color(edgarYear) }}>{prefix(edgarYear)}${fmt(edgarYear)}</span>
          <span style={{ color: 'var(--muted2)', fontSize: 10, textAlign: 'right' }}>auto-tracked</span>
        </div>
      </Card>

      {/* CATEGORIES */}
      {loading ? (
        <Card><div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)' }}>Lade...</div></Card>
      ) : (
        cats.map(cat => {
          const items = invs.filter(i => i.category === cat.name)
          const catInv = items.reduce((a, b) => a + Number(b.invested), 0)
          const catCur = items.reduce((a, b) => a + Number(b.current_value), 0)
          const catMon = items.reduce((a, b) => a + Number(b.monthly_return), 0)
          const catYr = items.reduce((a, b) => a + Number(b.yearly_return), 0)

          return (
            <Card key={cat.id}>
              <SectionTitle
                color="var(--cyan)"
                action={
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted2)' }}>
                      €{fmtEur(catCur)} · {prefix(catMon)}€{fmt(catMon)}/mo
                    </span>
                    <button onClick={() => { setAdding(cat.name); setAddDraft({ name: '', invested: 0, current_value: 0, monthly_return: 0, yearly_return: 0 }) }} style={btn('cyan')}>+ ADD</button>
                    <button onClick={() => delCategory(cat.id)} style={btn('red')}>×</button>
                  </div>
                }
              >
                {cat.icon} {cat.name.toUpperCase()}
              </SectionTitle>

              {/* table header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr 60px',
                gap: 14, padding: '8px 14px',
                fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 1.5,
                color: 'var(--muted)', borderBottom: '1px solid rgba(80,180,255,0.10)',
              }}>
                <span>NAME</span><span>INVESTED</span><span>CURRENT</span><span>MONTH</span><span>YEAR</span><span></span>
              </div>

              {items.length === 0 && adding !== cat.name && (
                <div style={{ color: 'var(--muted)', fontSize: 12, padding: '20px 14px', textAlign: 'center' }}>
                  Keine Investments — + ADD klicken
                </div>
              )}

              {items.map(i => (
                <div key={i.id} style={{
                  display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr 60px',
                  gap: 14, padding: '10px 14px', alignItems: 'center',
                  borderBottom: '1px solid rgba(80,180,255,0.06)',
                  fontFamily: 'var(--mono)', fontSize: 12,
                }}>
                  {editId === i.id ? (
                    <>
                      <input value={editDraft.name as string ?? ''} onChange={e => setEditDraft(p => ({ ...p, name: e.target.value }))} style={editInput} />
                      <input type="number" value={editDraft.invested ?? ''} onChange={e => setEditDraft(p => ({ ...p, invested: parseFloat(e.target.value) }))} style={editInput} />
                      <input type="number" value={editDraft.current_value ?? ''} onChange={e => setEditDraft(p => ({ ...p, current_value: parseFloat(e.target.value) }))} style={editInput} />
                      <input type="number" value={editDraft.monthly_return ?? ''} onChange={e => setEditDraft(p => ({ ...p, monthly_return: parseFloat(e.target.value) }))} style={editInput} />
                      <input type="number" value={editDraft.yearly_return ?? ''} onChange={e => setEditDraft(p => ({ ...p, yearly_return: parseFloat(e.target.value) }))} style={editInput} />
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => saveEdit(i.id)} style={iconBtn('green')}>✓</button>
                        <button onClick={() => setEditId(null)} style={iconBtn('muted')}>×</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span style={{ color: '#fff', fontWeight: 600 }}>{i.name}</span>
                      <span style={{ color: 'var(--muted2)' }}>€{fmtEur(Number(i.invested))}</span>
                      <span style={{ color: 'var(--cyan)' }}>€{fmtEur(Number(i.current_value))}</span>
                      <span style={{ color: color(Number(i.monthly_return)) }}>{prefix(Number(i.monthly_return))}€{fmt(Number(i.monthly_return))}</span>
                      <span style={{ color: color(Number(i.yearly_return)) }}>{prefix(Number(i.yearly_return))}€{fmt(Number(i.yearly_return))}</span>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setEditId(i.id); setEditDraft(i) }} style={iconBtn('cyan')}>✎</button>
                        <button onClick={() => delInvestment(i.id)} style={iconBtn('red')}>×</button>
                      </div>
                    </>
                  )}
                </div>
              ))}

              {adding === cat.name && (
                <div style={{
                  display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr 1fr 60px',
                  gap: 14, padding: '12px 14px', marginTop: 8,
                  background: 'rgba(80,180,255,0.05)',
                  border: '1px solid rgba(80,180,255,0.20)',
                  borderRadius: 3,
                }}>
                  <input placeholder="Name (z.B. NVDA)" value={addDraft.name as string ?? ''} onChange={e => setAddDraft(p => ({ ...p, name: e.target.value }))} style={editInput} />
                  <input type="number" placeholder="Invested" value={addDraft.invested ?? ''} onChange={e => setAddDraft(p => ({ ...p, invested: parseFloat(e.target.value) }))} style={editInput} />
                  <input type="number" placeholder="Current" value={addDraft.current_value ?? ''} onChange={e => setAddDraft(p => ({ ...p, current_value: parseFloat(e.target.value) }))} style={editInput} />
                  <input type="number" placeholder="Monthly" value={addDraft.monthly_return ?? ''} onChange={e => setAddDraft(p => ({ ...p, monthly_return: parseFloat(e.target.value) }))} style={editInput} />
                  <input type="number" placeholder="Yearly" value={addDraft.yearly_return ?? ''} onChange={e => setAddDraft(p => ({ ...p, yearly_return: parseFloat(e.target.value) }))} style={editInput} />
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => addInvestment(cat.name)} style={iconBtn('green')}>✓</button>
                    <button onClick={() => setAdding(null)} style={iconBtn('muted')}>×</button>
                  </div>
                </div>
              )}
            </Card>
          )
        })
      )}

      {/* ADD CATEGORY */}
      <Card>
        {addingCat ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <input placeholder="Neue Kategorie..." value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCategory()} style={{ ...editInput, flex: 1 }} />
            <button onClick={addCategory} style={btn('green')}>HINZUFÜGEN</button>
            <button onClick={() => setAddingCat(false)} style={btn('muted')}>ABBRECHEN</button>
          </div>
        ) : (
          <button onClick={() => setAddingCat(true)} style={{
            width: '100%', padding: 14, borderRadius: 3,
            border: '1px dashed rgba(80,180,255,0.30)',
            background: 'transparent', color: 'var(--cyan)',
            fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: 2, cursor: 'pointer',
          }}>+ NEUE KATEGORIE</button>
        )}
      </Card>
    </ModuleLayout>
  )
}

const editInput: React.CSSProperties = {
  background: 'rgba(8,20,48,0.7)',
  border: '1px solid rgba(80,180,255,0.30)',
  borderRadius: 3, padding: '6px 10px',
  color: '#fff', fontSize: 12, outline: 'none',
  fontFamily: 'var(--mono)', width: '100%',
}

function btn(c: 'cyan' | 'green' | 'red' | 'muted'): React.CSSProperties {
  const map = {
    cyan:   { bg: 'rgba(80,180,255,0.15)', border: 'rgba(80,180,255,0.40)', color: 'var(--cyan)' },
    green:  { bg: 'rgba(52,211,153,0.15)', border: 'rgba(52,211,153,0.40)', color: 'var(--green)' },
    red:    { bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.40)', color: 'var(--red)' },
    muted:  { bg: 'rgba(120,180,230,0.10)', border: 'rgba(120,180,230,0.30)', color: 'var(--muted2)' },
  }[c]
  return {
    padding: '5px 10px',
    background: map.bg, border: `1px solid ${map.border}`, color: map.color,
    borderRadius: 3, fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: 1.5,
    cursor: 'pointer',
  }
}

function iconBtn(c: 'cyan' | 'green' | 'red' | 'muted'): React.CSSProperties {
  return { ...btn(c), padding: '4px 8px', fontSize: 11 }
}
