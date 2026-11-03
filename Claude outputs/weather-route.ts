import { NextRequest, NextResponse } from 'next/server'

const CITIES = [
  { id: 'tallinn', name: 'Tallinn', country: 'EE', lat: 59.437, lon: 24.7536 },
  { id: 'mallorca', name: 'Mallorca', country: 'ES', lat: 39.5696, lon: 2.6502 },
  { id: 'canggu', name: 'Canggu', country: 'ID', lat: -8.6478, lon: 115.1385, home: true },
  { id: 'wildeshausen', name: 'Wildeshausen', country: 'DE', lat: 52.8946, lon: 8.4321 }
]

const CODE_MAP: Record<number, { text: string; icon: string }> = {
  0: { text: 'Klar', icon: '☀' },
  1: { text: 'Fast klar', icon: '🌤' },
  2: { text: 'Teils bewölkt', icon: '⛅' },
  3: { text: 'Bewölkt', icon: '☁' },
  45: { text: 'Nebel', icon: '🌫' },
  48: { text: 'Nebel', icon: '🌫' },
  51: { text: 'Nieselregen', icon: '🌦' },
  53: { text: 'Nieselregen', icon: '🌦' },
  55: { text: 'Starker Niesel', icon: '🌧' },
  61: { text: 'Leichter Regen', icon: '🌧' },
  63: { text: 'Regen', icon: '🌧' },
  65: { text: 'Starker Regen', icon: '🌧' },
  71: { text: 'Leichter Schnee', icon: '🌨' },
  73: { text: 'Schnee', icon: '🌨' },
  75: { text: 'Starker Schnee', icon: '❄' },
  80: { text: 'Regenschauer', icon: '🌦' },
  81: { text: 'Regenschauer', icon: '🌧' },
  82: { text: 'Starke Schauer', icon: '⛈' },
  95: { text: 'Gewitter', icon: '⛈' },
  96: { text: 'Gewitter + Hagel', icon: '⛈' },
  99: { text: 'Schweres Gewitter', icon: '⛈' }
}

export async function GET(req: NextRequest) {
  try {
    const results = await Promise.all(
      CITIES.map(async (city) => {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`
        
        const res = await fetch(url, { next: { revalidate: 1800 } })
        
        if (!res.ok) {
          return { ...city, error: 'fetch failed' }
        }

        const data = await res.json()
        const code = data.current?.weather_code ?? 0
        const info = CODE_MAP[code] || { text: '—', icon: '•' }

        return {
          id: city.id,
          name: city.name,
          country: city.country,
          home: city.home || false,
          temp: Math.round(data.current?.temperature_2m ?? 0),
          high: Math.round(data.daily?.temperature_2m_max?.[0] ?? 0),
          low: Math.round(data.daily?.temperature_2m_min?.[0] ?? 0),
          condition: info.text,
          icon: info.icon,
          precipitation: Math.round(data.daily?.precipitation_probability_max?.[0] ?? 0),
          isDay: data.current?.is_day === 1
        }
      })
    )

    return NextResponse.json({ cities: results })
  } catch (error) {
    console.error('Weather API error:', error)
    return NextResponse.json({ cities: [], error: String(error) }, { status: 200 })
  }
}
