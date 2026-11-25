'use client'
import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/authFetch'

type Entry = {
  id: string
  bucket: 'liquid' | 'investments' | 'physical' | 'other'
  label: string
  amount_eur: number
  note: string | null
  updated_at: string
}

const BUCKETS = ['liquid', 'investments', 'physical', 'other'] as const
const BUCKET_COLORS: Record<string, string> = {
  liquid: '#5db8ff', investments: '#34d399', physical: '#c9a961', other: '#a78bfa',
}

export default function ManualEntriesEditor({ onChange }: { onChange?: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState<null | { bucket: string }>(null)
  const [newLabel, setNewLabel] = useState('')
  const [newAmount, setNewAmount] = useState('')

  const load = async () => {
    setLoading(true)
    const r = await authFetch('/api/finance/manual').then(r => r.json()).catch(() => ({}))
    setEntries(r.entries || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const add = async () => {
    if (!adding || !newLabel || !newAmount) return
    await authFetch('/api/finance/manual', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bucket: adding.bucket, label: newLabel, amount_eur: Number(newAmount) }),
    })
    setAdding(null); setNewLabel(''); setNewAmount('')
    await load()
    onChange?.()
  }

  const remove = async (id: string) => {
    if (!confirm('Eintrag löschen?')) return
    await authFetch(`/api/finance/manual?id=${id}`, { method: 'DELETE' })
    await load()
    onChange?.()
  }

  const updateAmount = async (id: string, amount: number) => {
    await authFetch('/api/finance/manual', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, amount_eur: amount }),
    })
    await load()
    onChange?.()
  }

  return (
    <div style={{
      background: 'rgba(0,10,25,0.5)',
      border: '1px solid rgba(80,180,255,0.12)',
      borderRadius: 4,
      fontFamily: 'Space Mono, monospace',
    }}>
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid rgba(80,180,255,0.08)',
        background: 'rgba(80,180,255,0.04)',
      }}>
        <span style={{ fontSize: 10, letterSpacing: 3, color: '#7ea6d5', fontWeight: 700 }}>
          ▸ MANUAL ENTRIES
        </span>
        <span style={{ fontSize: 9, color: 'rgba(126,166,213,0.55)', marginLeft: 10 }}>
          Cash, Crypto, Misc Assets — alles was keine API hat
        </span>
      </div>

      <div style={{ padding: 14 }}>
        {loading && <div style={{ fontSize: 10, color: 'rgba(126,166,213,0.5)' }}>loading…</div>}

        {BUCKETS.map(bucket => {
          const items = entries.filter(e => e.bucket === bucket)
          return (
            <div key={bucket} style={{ marginBottom: 14 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 6,
              }}>
                <span style={{
                  fontSize: 9, letterSpacing: 2, color: BUCKET_COLORS[bucket], fontWeight: 700,
                }}>
                  {bucket.toUpperCase()}
                </span>
                <button
                  onClick={() => setAdding({ bucket })}
                  style={{
                    background: 'transparent', border: '1px solid rgba(80,180,255,0.3)',
                    color: '#7ea6d5', padding: '2px 10px', fontSize: 10,
                    letterSpacing: 2, cursor: 'pointer',
                  }}
                >+ ADD</button>
              </div>

              {items.length === 0 && adding?.bucket !== bucket && (
                <div style={{ fontSize: 10, color: 'rgba(126,166,213,0.35)', padding: '4px 0' }}>—</div>
              )}

              {items.map(e => (
                <div key={e.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 0', fontSize: 11,
                  borderBottom: '1px solid rgba(80,180,255,0.04)',
                }}>
                  <span style={{ flex: 1, color: 'rgba(216,233,255,0.78)' }}>{e.label}</span>
                  <input
                    type="number"
                    defaultValue={e.amount_eur}
                    onBlur={ev => {
                      const v = Number(ev.target.value)
                      if (v !== e.amount_eur) updateAmount(e.id, v)
                    }}
                    style={{
                      width: 100, textAlign: 'right',
                      background: 'rgba(80,180,255,0.05)',
                      border: '1px solid rgba(80,180,255,0.15)',
                      color: '#d8e9ff', padding: '3px 6px',
                      fontFamily: 'Space Mono, monospace', fontSize: 11,
                    }}
                  />
                  <span style={{ color: 'rgba(126,166,213,0.55)', fontSize: 10 }}>€</span>
                  <button
                    onClick={() => remove(e.id)}
                    style={{
                      background: 'transparent', border: 'none',
                      color: 'rgba(248,113,113,0.6)', cursor: 'pointer',
                      fontSize: 14,
                    }}
                    title="löschen"
                  >×</button>
                </div>
              ))}

              {adding?.bucket === bucket && (
                <div style={{
                  display: 'flex', gap: 8, padding: '6px 0',
                  borderTop: '1px dashed rgba(80,180,255,0.15)',
                  marginTop: 6,
                }}>
                  <input
                    autoFocus
                    placeholder="Label (z.B. Wise EUR)"
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    style={{
                      flex: 1, background: 'rgba(80,180,255,0.05)',
                      border: '1px solid rgba(80,180,255,0.15)',
                      color: '#d8e9ff', padding: '4px 8px',
                      fontFamily: 'Space Mono, monospace', fontSize: 11,
                    }}
                  />
                  <input
                    type="number"
                    placeholder="EUR"
                    value={newAmount}
                    onChange={e => setNewAmount(e.target.value)}
                    style={{
                      width: 100, textAlign: 'right',
                      background: 'rgba(80,180,255,0.05)',
                      border: '1px solid rgba(80,180,255,0.15)',
                      color: '#d8e9ff', padding: '4px 8px',
                      fontFamily: 'Space Mono, monospace', fontSize: 11,
                    }}
                  />
                  <button onClick={add} style={{
                    background: 'rgba(52,211,153,0.15)',
                    border: '1px solid rgba(52,211,153,0.4)',
                    color: '#34d399', padding: '4px 10px',
                    fontSize: 10, letterSpacing: 2, cursor: 'pointer',
                  }}>SAVE</button>
                  <button onClick={() => { setAdding(null); setNewLabel(''); setNewAmount('') }} style={{
                    background: 'transparent', border: '1px solid rgba(248,113,113,0.3)',
                    color: 'rgba(248,113,113,0.6)', padding: '4px 10px',
                    fontSize: 10, letterSpacing: 2, cursor: 'pointer',
                  }}>CANCEL</button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
