'use client'
import { useState } from 'react'
import { authFetch } from '@/lib/authFetch'

type Item = {
  id: string
  category: string
  name: string
  invested: number
  current_value: number
  monthly_return: number
  yearly_return: number
  notes?: string
}
type Cat = { id: string; name: string; icon: string; sort_order: number; items: Item[]; invested: number; current: number; monthly: number; yearly: number }

type Props = {
  category: Cat
  grandTotal: number
  userId: string
  onChange: () => void
}

export default function CategorySection({ category, grandTotal, userId, onChange }: Props) {
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<Item>>({})

  const fmt = (n: number) => '€' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  const sign = (n: number) => n >= 0 ? '+' : ''
  const col = (n: number) => n > 0 ? '#34d399' : n < 0 ? '#f87171' : '#d8e9ff'
  const catPct = grandTotal ? ((category.current / grandTotal) * 100).toFixed(1) : '0.0'

  const resetDraft = () => setDraft({ name: '', invested: 0, current_value: 0, monthly_return: 0, yearly_return: 0 })

  const addItem = async () => {
    if (!draft.name) return
    await authFetch('/api/finance/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...draft, category: category.name, user_id: userId }),
    })
    resetDraft(); setAdding(false); onChange()
  }

  const saveItem = async (id: string) => {
    await authFetch('/api/finance/items', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, ...draft }),
    })
    setEditId(null); resetDraft(); onChange()
  }

  const delItem = async (id: string) => {
    if (!confirm('Delete this item?')) return
    await authFetch(`/api/finance/items?id=${id}`, { method: 'DELETE' })
    onChange()
  }

  const delCategory = async () => {
    if (!confirm(`Delete category "${category.name}" and all its items?`)) return
    await authFetch(`/api/finance/categories?id=${category.id}`, { method: 'DELETE' })
    onChange()
  }

  return (
    <div style={{
      background: 'rgba(0,10,25,0.5)',
      border: '1px solid rgba(80,180,255,0.12)',
      borderRadius: 4,
      fontFamily: 'Space Mono, monospace',
      marginBottom: 12,
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid rgba(80,180,255,0.08)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(80,180,255,0.04)',
      }}>
        <span style={{ fontSize: 11, letterSpacing: 2.5, color: '#5db8ff', fontWeight: 700 }}>
          {category.icon} {category.name.toUpperCase()}
        </span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: 'rgba(126,166,213,0.6)', letterSpacing: 1 }}>
            {category.items.length} items · {catPct}% of NAV
          </span>
          <button onClick={() => { setAdding(true); resetDraft() }} style={btnPrimary}>+ ADD</button>
          <button onClick={delCategory} style={btnDanger} title="Delete category">×</button>
        </div>
      </div>

      {/* Totals bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        padding: '8px 14px', gap: 12,
        borderBottom: '1px solid rgba(80,180,255,0.08)',
        fontSize: 10,
      }}>
        <Cell label="INVESTED" value={fmt(category.invested)} />
        <Cell label="CURRENT" value={fmt(category.current)} bold color="#d8e9ff" />
        <Cell label="MONTHLY" value={`${sign(category.monthly)}€${Math.abs(category.monthly).toFixed(0)}`} color={col(category.monthly)} />
        <Cell label="YEARLY" value={`${sign(category.yearly)}€${Math.abs(category.yearly).toFixed(0)}`} color={col(category.yearly)} />
      </div>

      {/* Items */}
      <div>
        {category.items.length === 0 && !adding && (
          <div style={{ padding: 16, textAlign: 'center', color: 'rgba(126,166,213,0.4)', fontSize: 11 }}>
            no items yet
          </div>
        )}

        {category.items.map(it => (
          <div key={it.id}>
            {editId === it.id ? (
              <EditRow
                draft={draft}
                setDraft={setDraft}
                onSave={() => saveItem(it.id)}
                onCancel={() => { setEditId(null); resetDraft() }}
              />
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.6fr) 100px 100px 100px 100px 60px',
                gap: 10, alignItems: 'center',
                padding: '7px 14px',
                borderBottom: '1px solid rgba(80,180,255,0.04)',
                fontSize: 11,
              }}>
                <span style={{ color: '#d8e9ff', fontWeight: 500 }}>{it.name}</span>
                <span style={{ textAlign: 'right', color: 'rgba(126,166,213,0.7)' }}>{fmt(it.invested)}</span>
                <span style={{ textAlign: 'right', color: '#d8e9ff', fontWeight: 700 }}>{fmt(it.current_value)}</span>
                <span style={{ textAlign: 'right', color: col(it.monthly_return) }}>
                  {sign(it.monthly_return)}€{Math.abs(it.monthly_return).toFixed(0)}
                </span>
                <span style={{ textAlign: 'right', color: col(it.yearly_return) }}>
                  {sign(it.yearly_return)}€{Math.abs(it.yearly_return).toFixed(0)}
                </span>
                <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => { setEditId(it.id); setDraft(it) }}
                    style={btnIcon}
                    title="Edit"
                  >✎</button>
                  <button
                    onClick={() => delItem(it.id)}
                    style={{ ...btnIcon, color: 'rgba(248,113,113,0.7)' }}
                    title="Delete"
                  >×</button>
                </span>
              </div>
            )}
          </div>
        ))}

        {adding && (
          <EditRow
            draft={draft}
            setDraft={setDraft}
            onSave={addItem}
            onCancel={() => { setAdding(false); resetDraft() }}
          />
        )}
      </div>
    </div>
  )
}

function Cell({ label, value, color = 'rgba(216,233,255,0.7)', bold }: any) {
  return (
    <div>
      <div style={{ fontSize: 8, letterSpacing: 1.5, color: 'rgba(126,166,213,0.55)' }}>{label}</div>
      <div style={{ color, fontWeight: bold ? 700 : 500, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function EditRow({ draft, setDraft, onSave, onCancel }: any) {
  const inp: any = {
    background: 'rgba(80,180,255,0.05)',
    border: '1px solid rgba(80,180,255,0.2)',
    color: '#d8e9ff', padding: '4px 8px',
    fontFamily: 'Space Mono, monospace', fontSize: 11,
    textAlign: 'right' as const,
    width: '100%',
  }
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1.6fr) 100px 100px 100px 100px 100px',
      gap: 10, alignItems: 'center',
      padding: '8px 14px',
      borderBottom: '1px solid rgba(80,180,255,0.1)',
      background: 'rgba(80,180,255,0.04)',
    }}>
      <input
        autoFocus
        placeholder="Name (z.B. BTC Hardware Wallet)"
        value={draft.name || ''}
        onChange={e => setDraft({ ...draft, name: e.target.value })}
        style={{ ...inp, textAlign: 'left' }}
      />
      <input type="number" placeholder="invested" value={draft.invested ?? ''} onChange={e => setDraft({ ...draft, invested: Number(e.target.value) })} style={inp} />
      <input type="number" placeholder="current" value={draft.current_value ?? ''} onChange={e => setDraft({ ...draft, current_value: Number(e.target.value) })} style={inp} />
      <input type="number" placeholder="monthly" value={draft.monthly_return ?? ''} onChange={e => setDraft({ ...draft, monthly_return: Number(e.target.value) })} style={inp} />
      <input type="number" placeholder="yearly" value={draft.yearly_return ?? ''} onChange={e => setDraft({ ...draft, yearly_return: Number(e.target.value) })} style={inp} />
      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
        <button onClick={onSave} style={btnSave}>SAVE</button>
        <button onClick={onCancel} style={btnCancel}>×</button>
      </div>
    </div>
  )
}

const btnPrimary: any = {
  background: 'transparent', border: '1px solid rgba(80,180,255,0.3)',
  color: '#7ea6d5', padding: '3px 10px', fontSize: 9, letterSpacing: 2,
  fontFamily: 'Space Mono, monospace', cursor: 'pointer',
}
const btnDanger: any = {
  background: 'transparent', border: '1px solid rgba(248,113,113,0.3)',
  color: 'rgba(248,113,113,0.7)', padding: '3px 8px', fontSize: 11,
  cursor: 'pointer',
}
const btnIcon: any = {
  background: 'transparent', border: 'none',
  color: 'rgba(126,166,213,0.7)', cursor: 'pointer',
  fontSize: 14, padding: '0 4px',
}
const btnSave: any = {
  background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.4)',
  color: '#34d399', padding: '3px 8px', fontSize: 9, letterSpacing: 2, cursor: 'pointer',
}
const btnCancel: any = {
  background: 'transparent', border: '1px solid rgba(248,113,113,0.3)',
  color: 'rgba(248,113,113,0.7)', padding: '3px 8px', fontSize: 12, cursor: 'pointer',
}
