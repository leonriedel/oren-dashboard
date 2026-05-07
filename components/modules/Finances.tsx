'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import ModuleLayout from '@/components/ModuleLayout'
import { Card, SectionTitle, ItemRow, MetricGrid } from '@/components/UI'
import type { User } from '@supabase/supabase-js'

interface Props { user: User; onBack: () => void }

export default function Finances({ user, onBack }: Props) {
  const supabase = createClient()
  const [snapshot, setSnapshot] = useState({ biz_assets: 1500000, priv_liquidity: 4800, avail_cash: 2800 })
  const [transactions, setTransactions] = useState<any[]>([])
  const [showAdd, setShowAdd] = useState<'expense'|'income'|null>(null)
  const [form, setForm] = useState({ desc: '', amount: '', category: 'business' })

  useEffect(() => { load() }, [])

  async function load() {
    const [snap, txs] = await Promise.all([
      supabase.from('finance_snapshot').select('*').eq('user_id', user.id).single(),
      supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])
    if (snap.data) setSnapshot(snap.data)
    else {
      // seed initial snapshot
      const { data } = await supabase.from('finance_snapshot').insert({ user_id: user.id, biz_assets: 1500000, priv_liquidity: 4800, avail_cash: 2800 }).select().single()
      if (data) setSnapshot(data)
    }
    setTransactions(txs.data || [])
  }

  async function addTransaction() {
    if (!form.desc || !form.amount) return
    const { data } = await supabase.from('transactions').insert({
      user_id: user.id,
      type: showAdd,
      description: form.desc,
      amount: parseFloat(form.amount),
      category: showAdd === 'income' ? form.category : 'expense',
      date: new Date().toISOString().split('T')[0],
    }).select().single()
    if (data) setTransactions(prev => [data, ...prev])
    setForm({ desc: '', amount: '', category: 'business' })
    setShowAdd(null)
  }

  const now = new Date()
  const monthTxs = transactions.filter(t => {
    const d = new Date(t.date)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const monthIncome = monthTxs.filter(t => t.type === 'income').reduce((a, b) => a + Number(b.amount), 0)
  const monthExpenses = monthTxs.filter(t => t.type === 'expense').reduce((a, b) => a + Number(b.amount), 0)
  const netFlow = monthIncome - monthExpenses
  const total = snapshot.biz_assets + snapshot.priv_liquidity + snapshot.avail_cash

  function fmt(n: number) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M €'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K €'
    return n.toFixed(0) + ' €'
  }

  const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

  return (
    <ModuleLayout onBack={onBack} icon="💰" title="FINANCES" titleColor="var(--green)" sub="Wealth & Liquidity" iconBg="linear-gradient(135deg, #1a5c2a, #2d9e48)">
      <Card>
        <SectionTitle color="var(--green)">FINANCIAL SNAPSHOT</SectionTitle>
        <div style={{ textAlign:'center', padding:'8px 0 20px' }}>
          <div style={{ fontSize:11, letterSpacing:3, color:'var(--muted)', textTransform:'uppercase', marginBottom:8 }}>TOTAL WEALTH</div>
          <div style={{ fontFamily:'var(--mono)', fontSize:40, fontWeight:700, color:'var(--green)' }}>{fmt(total)}</div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
          {[['BUSINESS',snapshot.biz_assets],['LIQUIDITY',snapshot.priv_liquidity],['CASH',snapshot.avail_cash]].map(([l,v]) => (
            <div key={l} style={{ background:'rgba(0,230,118,0.06)', border:'1px solid rgba(0,230,118,0.15)', borderRadius:12, padding:'14px 10px', textAlign:'center' }}>
              <div style={{ fontSize:10, letterSpacing:2, color:'rgba(0,230,118,0.6)', textTransform:'uppercase', marginBottom:8 }}>{l}</div>
              <div style={{ fontFamily:'var(--mono)', fontSize:15, color:'var(--green)', fontWeight:700 }}>{fmt(Number(v))}</div>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
        <button onClick={() => setShowAdd('expense')} style={{ padding:13, borderRadius:12, border:'1px solid rgba(255,68,68,0.3)', background:'rgba(255,68,68,0.08)', color:'#ff6666', fontFamily:'var(--mono)', fontSize:11, letterSpacing:1.5, cursor:'pointer' }}>+ ADD EXPENSE</button>
        <button onClick={() => setShowAdd('income')} style={{ padding:13, borderRadius:12, border:'1px solid rgba(0,230,118,0.3)', background:'rgba(0,230,118,0.08)', color:'var(--green)', fontFamily:'var(--mono)', fontSize:11, letterSpacing:1.5, cursor:'pointer' }}>+ ADD INCOME</button>
      </div>

      {showAdd && (
        <Card style={{ border:'1px solid var(--border2)', marginBottom:12 }}>
          <div style={{ fontFamily:'var(--mono)', fontSize:12, color:showAdd==='income'?'var(--green)':'var(--red)', marginBottom:12 }}>{showAdd === 'income' ? 'INCOME HINZUFÜGEN' : 'EXPENSE HINZUFÜGEN'}</div>
          <input placeholder="Beschreibung" value={form.desc} onChange={e => setForm(p => ({...p, desc:e.target.value}))} style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', color:'var(--text)', fontSize:13, outline:'none', marginBottom:8 }} />
          <input placeholder="Betrag (€)" type="number" value={form.amount} onChange={e => setForm(p => ({...p, amount:e.target.value}))} style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', color:'var(--text)', fontSize:13, outline:'none', marginBottom:8 }} />
          {showAdd === 'income' && (
            <select value={form.category} onChange={e => setForm(p => ({...p, category:e.target.value}))} style={{ width:'100%', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', color:'var(--text)', fontSize:13, outline:'none', marginBottom:8 }}>
              <option value="business">Business Income</option>
              <option value="private">Private Income</option>
            </select>
          )}
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setShowAdd(null)} style={{ flex:1, padding:10, borderRadius:10, border:'1px solid var(--border)', background:'transparent', color:'var(--muted2)', cursor:'pointer', fontFamily:'var(--mono)', fontSize:11 }}>ABBRECHEN</button>
            <button onClick={addTransaction} style={{ flex:1, padding:10, borderRadius:10, border:'none', background: showAdd==='income'?'var(--green)':'var(--red)', color:'white', cursor:'pointer', fontFamily:'var(--mono)', fontSize:11 }}>SPEICHERN</button>
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle color="var(--cyan)">MONTHLY OVERVIEW — {months[now.getMonth()].toUpperCase()} {now.getFullYear()}</SectionTitle>
        <MetricGrid items={[
          { label:'INCOME', value: monthIncome.toFixed(0)+' €', color:'var(--green)' },
          { label:'EXPENSES', value: monthExpenses.toFixed(0)+' €', color:'var(--red)' },
          { label:'NET FLOW', value: (netFlow >= 0 ? '+' : '')+netFlow.toFixed(0)+' €', color: netFlow >= 0 ? 'var(--cyan)' : 'var(--red)' },
        ]} />
      </Card>

      <Card>
        <SectionTitle color="var(--amber)">RECENT TRANSACTIONS</SectionTitle>
        {!transactions.length && <div style={{ color:'var(--muted)', fontSize:13 }}>Keine Transaktionen</div>}
        {transactions.slice(0,10).map(t => (
          <ItemRow key={t.id}>
            <span style={{ fontSize:13, flex:1 }}>{t.description}</span>
            <span style={{ fontFamily:'var(--mono)', fontSize:12, color: t.type==='income' ? 'var(--green)' : 'var(--red)' }}>
              {t.type==='income' ? '+' : '-'}{Number(t.amount).toFixed(2)} €
            </span>
          </ItemRow>
        ))}
      </Card>
    </ModuleLayout>
  )
}
