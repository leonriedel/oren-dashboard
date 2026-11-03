'use client'
import { useEffect, useState } from 'react'

type City = {
  id: string
  name: string
  country: string
  home: boolean
  temp: number
  high: number
  low: number
  condition: string
  icon: string
  precipitation: number
  isDay: boolean
}

export default function Weather() {
  const [cities, setCities] = useState<City[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/weather')
      .then(r => r.json())
      .then(data => {
        setCities(data.cities || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))

    const id = setInterval(() => {
      fetch('/api/weather').then(r => r.json()).then(data => setCities(data.cities || []))
    }, 30 * 60 * 1000)

    return () => clearInterval(id)
  }, [])

  if (loading) {
    return (
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 3, color: 'var(--muted)' }}>WEATHER · LOADING</div>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 5, height: 5, background: '#5db8ff', borderRadius: '50%', boxShadow: '0 0 6px #5db8ff' }} />
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: 3, color: 'var(--muted)' }}>WEATHER</div>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: 2, color: 'var(--muted2)' }}>LIVE</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {cities.map(city => (
          <div
            key={city.id}
            style={{
              background: 'rgba(10,15,22,0.5)',
              border: city.home ? '1px solid #c9a961' : '1px solid var(--border)',
              borderRadius: 12,
              padding: '14px 12px',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            {city.home && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  background: '#c9a961',
                  color: '#000',
                  fontSize: 8,
                  padding: '2px 6px',
                  letterSpacing: 2,
                  fontWeight: 600,
                  fontFamily: 'var(--mono)'
                }}
              >
                HOME
              </div>
            )}
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                letterSpacing: 2,
                color: city.home ? '#c9a961' : '#5db8ff',
                marginBottom: 10,
                fontWeight: 500
              }}
            >
              {city.name.toUpperCase()}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
              <div style={{ fontSize: 26, fontWeight: 300, color: 'var(--text)', lineHeight: 1 }}>{city.temp}°</div>
              <div style={{ fontSize: 14 }}>{city.icon}</div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted2)', marginBottom: 10 }}>{city.condition}</div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 10,
                color: 'var(--muted)',
                borderTop: '1px solid var(--border)',
                paddingTop: 8,
                fontFamily: 'var(--mono)'
              }}
            >
              <span>H {city.high}°</span>
              <span>L {city.low}°</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4, fontFamily: 'var(--mono)' }}>
              💧 {city.precipitation}%
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
