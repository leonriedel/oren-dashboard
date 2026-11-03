import { NextRequest, NextResponse } from 'next/server'
import ical from 'node-ical'

const ICAL_URL = process.env.GOOGLE_CAL_ICAL_URL || ''

export async function GET() {
  try {
    if (!ICAL_URL) {
      return NextResponse.json({ events: [], error: 'GOOGLE_CAL_ICAL_URL not set' }, { status: 200 })
    }

    const res = await fetch(ICAL_URL, {
      next: { revalidate: 300 },
      headers: { 'User-Agent': 'oren-dashboard/1.0' }
    })

    if (!res.ok) {
      return NextResponse.json({ events: [], error: `iCal fetch failed: ${res.status}` }, { status: 200 })
    }

    const icsText = await res.text()
    const data = ical.sync.parseICS(icsText)

    const now = new Date()
    const horizon = new Date()
    horizon.setDate(now.getDate() + 30)

    const events: any[] = []

    for (const key of Object.keys(data)) {
      const item: any = data[key]
      if (item.type !== 'VEVENT') continue

      // Handle recurring events: get next instance within horizon
      if (item.rrule) {
        try {
          const occurrences = item.rrule.between(now, horizon, true)
          for (const occ of occurrences) {
            const duration = item.end && item.start ? (item.end.getTime() - item.start.getTime()) : 60 * 60 * 1000
            const end = new Date(occ.getTime() + duration)
            events.push({
              id: `${item.uid}-${occ.getTime()}`,
              title: item.summary || 'Kein Titel',
              date: occ.toISOString(),
              dateEnd: end.toISOString(),
              location: item.location || null
            })
          }
        } catch (e) {
          // skip broken recurrence
        }
        continue
      }

      const start: Date = item.start
      if (!start) continue
      if (start < now) continue
      if (start > horizon) continue

      events.push({
        id: item.uid || `${key}-${start.getTime()}`,
        title: item.summary || 'Kein Titel',
        date: start.toISOString(),
        dateEnd: item.end ? item.end.toISOString() : null,
        location: item.location || null
      })
    }

    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    return NextResponse.json({ events: events.slice(0, 50) })
  } catch (error) {
    console.error('Calendar API error:', error)
    return NextResponse.json({ events: [], error: String(error) }, { status: 200 })
  }
}

// Legacy POST kept as no-op (Notion write disabled since switch to iCal)
export async function POST() {
  return NextResponse.json({ ok: false, error: 'Write disabled — using Google Calendar read-only via iCal' }, { status: 200 })
}
