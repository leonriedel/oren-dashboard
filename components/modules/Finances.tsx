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
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({ biz_assets: '', priv_liquidity: '', avail_cash: '' })

  useEffect(() => { load() }, [])

  async function load() {
    const [snap, txs] = await Promise.all([
      supabase.from('finance_snapshot').select('*').eq('user_id', user.id).single(),
      supabase.from('transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])
    if (snap.data) setSnapshot(snap.data)
    else {
      const { data } = await supabase.from('finance_snapshot').insert({ user_id: user.id, biz_assets: 1500000, priv_liquidity: 4800, avail_cash: 2800 }).select().single()
      if (data) setSnapshot(data)
    }
    setTransactions(txs.data || [])
  }

  async function saveWealthEdit() {
    const updated = {
      biz_assets: parseFloat(editForm.biz_assets) || snapshot.biz_assets,
      priv_liquidity: parseFloat(editForm.priv_liquidity) || snapshot.priv_liquidity,
      avail_cash: parseFloat(editForm.avail_cash) || snapshot.avail_cash,
    }
    await supabase.from('finance_snapshot').update(updated).eq('user_id', user.id)
    setSnapshot({ ...snapshot, ...updated })
    setEditMode(false)
  }

  function startEdit() {
    setEditForm({
      biz_assets: String(snapshot.biz_assets),
      priv_liquidity: String(snapshot.priv_liquidity),
      avail_cash: String(snapshot.avail_cash),
    })
    setEditMode(true)
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
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M €'
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K €'
    return n.toFixed(0) + ' €'
  }

  const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

  const editBtn = (
    <button onClick={() => editMode ? saveWealthEdit() : startEdit()} style={{
      padding: '6px 14px',
      background: editMode ? 'rgba(52,211,153,0.20)' : 'rgba(80,180,255,0.12)',
      border: `1px solid ${editMode ? 'rgba(52,211,153,0.5)' : 'rgba(80,180,255,0.30)'}`,
      borderRadius: 3,
      color: editMode ? '#34d399' : '#80c0ff',
      fontFamily: 'Space Mono, monospace',
      fontSize: 9.5, letterSpacing: 2,
      cursor: 'pointer',
    }}>
      {editMode ? '✓ SAVE' : '✎ EDIT'}
    </button>
  )

  return (
    <ModuleLayout onBack={onBack} icon="💰" title="FINANCES" titleColor="#34d399" sub="Wealth & Liquidity" iconBg="linear-gradient(135deg, rgba(52,211,153,0.4), rgba(20,140,90,0.2))" rightAction={editBtn}>

      {/* TOTAL WEALTH HERO */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(52,211,153,0.06), rgba(20,140,90,0.10))',
        border: '1px solid rgba(52,211,153,0.20)',
        borderLeft: '2px solid #34d399',
        borderRadius: 4, padding: 28, marginBottom: 18, position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: 3, left: 3, width: 8, height: 8, borderTop: '1px solid rgba(52,211,153,0.5)', borderLeft: '1px solid rgba(52,211,153,0.5)' }} />
        <div style={{ position: 'absolute', top: 3, right: 3, width: 8, height: 8, borderTop: '1px solid rgba(52,211,153,0.5)', borderRight: '1px solid rgba(52,211,153,0.5)' }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 36, alignItems: 'center' }}>
          {/* Total */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, letterSpacing: 3, color: 'rgba(120,180,230,0.6)', textTransform: 'uppercase', marginBottom: 10 }}>TOTAL WEALTH</div>
            <div style={{
              fontFamily: 'Space Mono, monospace', fontSize: 48, fontWeight: 700, color: '#34d399',
              textShadow: '0 0 30px rgba(52,211,153,0.5)', letterSpacing: 1,
            }}>{fmt(total)}</div>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: 'rgba(120,180,230,0.5)', marginTop: 6 }}>{total.toLocaleString('de-DE')} €</div>
          </div>

          {/* Breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {[
              { label: 'BUSINESS', val: snapshot.biz_assets, key: 'biz_assets' },
              { label: 'LIQUIDITY', val: snapshot.priv_liquidity, key: 'priv_liquidity' },
              { label: 'CASH', val: snapshot.avail_cash, key: 'avail_cash' },
            ].map(b => (
              <div key={b.key} style={{
                background: 'rgba(8,20,48,0.65)',
                border: '1px solid rgba(52,211,153,0.18)',
                borderLeft: '2px solid #34d399',
                borderRadius: 3, padding: '18px 14px', textAlign: 'center',
              }}>
                <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, letterSpacing: 2, color: 'rgba(120,180,230,0.55)', textTransform: 'uppercase', marginBottom: 10 }}>{b.label}</div>
                {editMode ? (
                  <input
                    type="number"
                    value={editForm[b.key as keyof typeof editForm]}
                    onChange={e => setEditForm(p => ({ ...p, [b.key]: e.target.value }))}
                    style={{
                      width: '100%', background: 'rgba(8,20,48,0.7)',
                      border: '1px solid rgba(52,211,153,0.4)', borderRadius: 3,
                      padding: '6px 8px', color: '#34d399',
                      fontFamily: 'Space Mono, monospace', fontSize: 14, fontWeight: 700,
                      textAlign: 'center', outline: 'none',
                    }}
                  />
                ) : (
                  <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 18, color: '#34d399', fontWeight: 700, letterSpacing: 0.5 }}>{fmt(b.val)}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ADD BUTTONS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <button onClick={() => setShowAdd('expense')} style={{
          padding: 14, borderRadius: 3,
          border: '1px solid rgba(248,113,113,0.30)',
          borderLeft: '2px solid #f87171',
          background: 'rgba(248,113,113,0.06)',
          color: '#f87171',
          fontFamily: 'Space Mono, monospace', fontSize: 11, letterSpacing: 2, cursor: 'pointer',
        }}>+ ADD EXPENSE</button>
        <button onClick={() => setShowAdd('income')} style={{
          padding: 14, borderRadius: 3,
          border: '1px solid rgba(52,211,153,0.30)',
          borderLeft: '2px solid #34d399',
          background: 'rgba(52,211,153,0.06)',
          color: '#34d399',
          fontFamily: 'Space Mono, monospace', fontSize: 11, letterSpacing: 2, cursor: 'pointer',
        }}>+ ADD INCOME</button>
      </div>

      {showAdd && (
        <Card style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, letterSpacing: 2, color: showAdd === 'income' ? '#34d399' : '#f87171', marginBottom: 14 }}>
            {showAdd === 'income' ? '+ INCOME HINZUFÜGEN' : '+ EXPENSE HINZUFÜGEN'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 10, alignItems: 'center' }}>
            <input placeholder="Beschreibung" value={form.desc} onChange={e => setForm(p => ({...p, desc: e.target.value}))} style={inputStyle} />
            <input placeholder="Betrag (€)" type="number" value={form.amount} onChange={e => setForm(p => ({...p, amount: e.target.value}))} style={inputStyle} />
            {showAdd === 'income' && (
              <select value={form.category} onChange={e => setForm(p => ({...p, category: e.target.value}))} style={{ ...inputStyle, gridColumn: '1 / span 2' }}>
                <option value="business">Business Income</option>
                <option value="private">Private Income</option>
              </select>
            )}
            <button onClick={addTransaction} style={{
              padding: '10px 18px', borderRadius: 3,
              border: 'none',
              background: showAdd === 'income' ? '#34d399' : '#f87171',
              color: 'white', fontFamily: 'Space Mono, monospace', fontSize: 10, letterSpacing: 2,
              cursor: 'pointer',
            }}>SAVE</button>
          </div>
          <button onClick={() => setShowAdd(null)} style={{
            marginTop: 10, padding: '8px 14px', borderRadius: 3,
            border: '1px solid rgba(80,180,255,0.20)',
            background: 'transparent', color: 'rgba(120,180,230,0.6)',
            fontFamily: 'Space Mono, monospace', fontSize: 9.5, letterSpacing: 2, cursor: 'pointer',
          }}>ABBRECHEN</button>
        </Card>
      )}

      {/* 2 COLUMN: OVERVIEW + RECENT */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <Card>
          <SectionTitle color="#80c0ff">MONTHLY OVERVIEW · {months[now.getMonth()].toUpperCase()} {now.getFullYear()}</SectionTitle>
          <MetricGrid items={[
            { label:'INCOME', value: monthIncome.toFixed(0)+' €', color:'#34d399' },
            { label:'EXPENSES', value: monthExpenses.toFixed(0)+' €', color:'#f87171' },
            { label:'NET FLOW', value: (netFlow >= 0 ? '+' : '')+netFlow.toFixed(0)+' €', color: netFlow >= 0 ? '#80c0ff' : '#f87171' },
          ]} />
          <div style={{ marginTop: 16, padding: '12px 0', borderTop: '1px solid rgba(80,180,255,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Space Mono, monospace', fontSize: 11 }}>
              <span style={{ color: 'rgba(120,180,230,0.55)', letterSpacing: 1 }}>YEARLY EST.</span>
              <span style={{ color: '#34d399', letterSpacing: 1 }}>{(netFlow * 12).toLocaleString('de-DE')} €</span>
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle color="#fbbf24">RECENT TRANSACTIONS</SectionTitle>
          {!transactions.length && <div style={{ color: 'rgba(120,180,230,0.5)', fontSize: 13, padding: '8px 0' }}>Keine Transaktionen</div>}
          {transactions.slice(0,8).map(t => (
            <ItemRow key={t.id}>
              <span style={{ fontSize: 13, flex: 1, color: '#d0e5ff' }}>{t.description}</span>
              <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 12, color: t.type === 'income' ? '#34d399' : '#f87171', letterSpacing: 0.5 }}>
                {t.type === 'income' ? '+' : '-'}{Number(t.amount).toFixed(2)} €
              </span>
            </ItemRow>
          ))}
        </Card>
      </div>
    </ModuleLayout>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(8,20,48,0.7)',
  border: '1px solid rgba(80,180,255,0.20)',
  borderRadius: 3,
  padding: '10px 12px',
  color: '#d8eaff',
  fontSize: 12.5,
  outline: 'none',
  fontFamily: 'DM Sans, system-ui, sans-serif',
}
