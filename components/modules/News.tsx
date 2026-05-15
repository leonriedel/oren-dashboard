'use client'
import { useEffect, useState } from 'react'
import ModuleLayout from '@/components/ModuleLayout'
import { Card, SectionTitle } from '@/components/UI'
import type { User } from '@supabase/supabase-js'

interface Props { user: User; onBack: () => void }

type NewsItem = { source: string; headline: string; link: string; time: string; date: string }
type NewsData = { general?: NewsItem[]; business?: NewsItem[]; f1?: NewsItem[] }

export default function News({ user, onBack }: Props) {
  const [data, setData] = useState<NewsData>({})
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState<'all'|'general'|'business'|'f1'>('all')

  useEffect(() => {
    fetch('/api/news')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const categories = [
    { key: 'general',  label: 'INTEL · NEWS',  icon: '◉', color: '#80c0ff' },
    { key: 'business', label: 'BUSINESS',      icon: '◈', color: '#34d399' },
    { key: 'f1',       label: 'FORMULA 1',     icon: '🏎', color: '#f87171' },
  ] as const

  const totalCount = (data.general?.length || 0) + (data.business?.length || 0) + (data.f1?.length || 0)

  return (
    <ModuleLayout
      onBack={onBack}
      icon="📰"
      title="NEWS"
      titleColor="#80c0ff"
      sub="Intel & Headlines"
      iconBg="linear-gradient(135deg, rgba(80,160,255,0.4), rgba(40,100,180,0.2))"
      rightAction={
        <div style={{ display: 'flex', gap: 8 }}>
          {(['all','general','business','f1'] as const).map(f => (
            <button key={f} onClick={() => setActiveFilter(f)} style={{
              padding: '6px 12px',
              background: activeFilter === f ? 'rgba(80,180,255,0.20)' : 'rgba(20,40,80,0.55)',
              border: `1px solid ${activeFilter === f ? 'rgba(120,200,255,0.55)' : 'rgba(80,180,255,0.20)'}`,
              borderRadius: 3,
              color: activeFilter === f ? '#fff' : 'rgba(160,210,255,0.7)',
              fontFamily: 'Space Mono, monospace',
              fontSize: 9, letterSpacing: 1.5,
              cursor: 'pointer',
            }}>
              {f === 'all' ? 'ALL' : f === 'general' ? 'NEWS' : f === 'business' ? 'BIZ' : 'F1'}
            </button>
          ))}
        </div>
      }
    >
      {loading ? (
        <Card>
          <div style={{ padding: 40, textAlign: 'center', color: 'rgba(120,180,230,0.55)', fontFamily: 'Space Mono, monospace', fontSize: 11, letterSpacing: 2 }}>
            ◌ LADE FEEDS...
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: activeFilter === 'all' ? '1fr 1fr 1fr' : '1fr', gap: 18 }}>
          {categories
            .filter(c => activeFilter === 'all' || activeFilter === c.key)
            .map(cat => {
              const items = data[cat.key as keyof NewsData] || []
              return (
                <Card key={cat.key}>
                  <SectionTitle color={cat.color} action={
                    <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, color: 'rgba(120,180,230,0.55)' }}>
                      {items.length} ITEMS
                    </span>
                  }>
                    {cat.icon} {cat.label}
                  </SectionTitle>
                  {items.length === 0 ? (
                    <div style={{ color: 'rgba(120,180,230,0.5)', fontSize: 13, padding: '12px 0' }}>
                      Keine News verfügbar
                    </div>
                  ) : (
                    items.map((n, i) => (
                      <a
                        key={i}
                        href={n.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'block',
                          padding: '12px 0',
                          borderBottom: i < items.length - 1 ? '1px solid rgba(80,180,255,0.06)' : 'none',
                          cursor: 'pointer',
                          textDecoration: 'none',
                          transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={(e: any) => { e.currentTarget.style.background = 'rgba(80,180,255,0.04)'; e.currentTarget.style.paddingLeft = '8px' }}
                        onMouseLeave={(e: any) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.paddingLeft = '0' }}
                      >
                        <div style={{
                          fontFamily: 'Space Mono, monospace', fontSize: 9, color: cat.color,
                          letterSpacing: 1.5, marginBottom: 5, display: 'flex', gap: 8, alignItems: 'center',
                        }}>
                          <span style={{ fontWeight: 700 }}>{n.source}</span>
                          <span style={{ color: 'rgba(120,180,230,0.5)' }}>·</span>
                          <span style={{ color: 'rgba(120,180,230,0.6)' }}>{n.time}</span>
                          <span style={{ marginLeft: 'auto', color: 'rgba(120,180,230,0.4)', fontSize: 8 }}>↗</span>
                        </div>
                        <div style={{ fontSize: 13, lineHeight: 1.45, color: '#d0e5ff' }}>
                          {n.headline}
                        </div>
                      </a>
                    ))
                  )}
                </Card>
              )
            })}
        </div>
      )}

      <div style={{
        marginTop: 18,
        padding: '12px 16px',
        background: 'rgba(8,20,48,0.45)',
        border: '1px solid rgba(80,180,255,0.12)',
        borderLeft: '2px solid #fbbf24',
        borderRadius: 3,
        fontFamily: 'Space Mono, monospace', fontSize: 10, letterSpacing: 1.5,
        color: 'rgba(120,180,230,0.6)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>◇ FEEDS: TAGESSCHAU · SPIEGEL · ZEIT · HANDELSBLATT · MANAGER MAGAZIN · FAZ · MOTORSPORT.COM</span>
        <span style={{ color: '#34d399' }}>● LIVE · {totalCount} ITEMS</span>
      </div>
    </ModuleLayout>
  )
}
