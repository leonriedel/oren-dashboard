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

  const subtitle = loading ? 'LOADING' : `${cities.length.toString().padStart(2, '0')} CITIES`

  return (
    <div style={{
      background: 'rgba(5, 10, 18, 0.75)',
      border: '1px solid rgba(80, 140, 220, 0.15)',
      borderRadius: 10,
      padding: '14px 16px',
      backdropFilter: 'blur(10px)',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        paddingBottom: 10,
        borderBottom: '1px solid rgba(80, 140, 220, 0.1)',
      }}>
        <div style={{
          fontFamily: 'monospace',
          fontSize: 11,
          letterSpacing: 2.5,
          color: '#80c0ff',
          fontWeight: 500,
        }}>
          ◇ WEATHER
        </div>
        <div style={{
          fontFamily: 'monospace',
          fontSize: 9,
          letterSpacing: 2,
          color: 'rgba(128, 192, 255, 0.5)',
        }}>
          {subtitle}
        </div>
      </div>

      {loading ? (
        <div style={{
          fontFamily: 'monospace',
          fontSize: 11,
          color: 'rgba(128, 192, 255, 0.4)',
          padding: '12px 0',
          textAlign: 'center',
        }}>
          scanning atmosphere...
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cities.map(city => (
            <div
              key={city.id}
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto auto',
                alignItems: 'center',
                gap: 12,
                padding: '8px 10px',
                background: city.home ? 'rgba(201, 169, 97, 0.06)' : 'rgba(10, 20, 35, 0.4)',
                border: city.home ? '1px solid rgba(201, 169, 97, 0.3)' : '1px solid rgba(80, 140, 220, 0.08)',
                borderRadius: 6,
                position: 'relative',
              }}
            >
              <div style={{
                fontFamily: 'monospace',
                fontSize: 9,
                letterSpacing: 1.5,
                color: city.home ? '#c9a961' : 'rgba(128, 192, 255, 0.5)',
                width: 90,
                fontWeight: 500,
              }}>
                {city.name.toUpperCase()}
                {city.home && (
                  <span style={{
                    marginLeft: 6,
                    fontSize: 7,
                    color: '#c9a961',
                    letterSpacing: 1,
                  }}>
                    ●
                  </span>
                )}
              </div>

              <div style={{
                fontFamily: 'monospace',
                fontSize: 10,
                color: 'rgba(180, 210, 240, 0.6)',
                letterSpacing: 0.5,
              }}>
                {city.condition}
              </div>

              <div style={{
                fontFamily: 'monospace',
                fontSize: 9,
                color: 'rgba(128, 192, 255, 0.4)',
                letterSpacing: 1,
                minWidth: 60,
                textAlign: 'right',
              }}>
                H{city.high}° L{city.low}°
              </div>

              <div style={{
                fontFamily: 'monospace',
                fontSize: 18,
                fontWeight: 300,
                color: city.home ? '#f5e6c0' : '#ffffff',
                minWidth: 42,
                textAlign: 'right',
              }}>
                {city.temp}°
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
