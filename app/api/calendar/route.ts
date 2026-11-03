import { NextRequest, NextResponse } from 'next/server'

const ICAL_URL = process.env.GOOGLE_CAL_ICAL_URL || ''

// Parse iCal date string: "20261104T090000Z" or "20261104T090000" or "20261104"
function parseICalDate(raw: string): Date | null {
  if (!raw) return null
  // All-day: YYYYMMDD
  if (/^\d{8}$/.test(raw)) {
    const y = parseInt(raw.slice(0, 4))
    const m = parseInt(raw.slice(4, 6)) - 1
    const d = parseInt(raw.slice(6, 8))
    return new Date(Date.UTC(y, m, d))
  }
  // With time: YYYYMMDDTHHMMSS[Z]
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (!match) return null
  const [, y, m, d, hh, mm, ss, z] = match
  if (z === 'Z') {
    return new Date(Date.UTC(+y, +m - 1, +d, +hh, +mm, +ss))
  }
  // Floating/local time → treat as local
  return new Date(+y, +m - 1, +d, +hh, +mm, +ss)
}

// Unfold iCal lines (lines starting with space/tab are continuations)
function unfold(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

// Decode iCal text (unescape commas, newlines, backslashes)
function decodeText(s: string): string {
  return s.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim()
}

type Event = {
  id: string
  title: string
  date: string
  dateEnd: string | null
  location: string | null
}

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
    const lines = unfold(icsText)

    const events: Event[] = []
    const now = new Date()
    const horizon = new Date()
    horizon.setDate(now.getDate() + 30)

    let inEvent = false
    let cur: Partial<Event> & { _start?: Date | null; _rrule?: string } = {}

    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') {
        inEvent = true
        cur = {}
        continue
      }
      if (line === 'END:VEVENT') {
        inEvent = false
        if (cur._start && cur.title) {
          const start = cur._start
          const hasRrule = Boolean(cur._rrule)
          // skip non-recurring past events; keep recurring for simple handling
          if (hasRrule || (start >= now && start <= horizon)) {
            // For recurring events, we naively show the base event if its start is in range
            // Full RRULE expansion skipped for simplicity (would need rrule lib)
            if (!hasRrule || (start >= now && start <= horizon)) {
              events.push({
                id: cur.id || `${start.getTime()}`,
                title: cur.title,
                date: start.toISOString(),
                dateEnd: cur.dateEnd || null,
                location: cur.location || null,
              })
            }
          }
        }
        continue
      }
      if (!inEvent) continue

      // key[;params]:value
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue
      const keyPart = line.slice(0, colonIdx)
      const value = line.slice(colonIdx + 1)
      const key = keyPart.split(';')[0].toUpperCase()

      if (key === 'SUMMARY') cur.title = decodeText(value)
      else if (key === 'UID') cur.id = value
      else if (key === 'LOCATION') cur.location = decodeText(value)
      else if (key === 'DTSTART') cur._start = parseICalDate(value)
      else if (key === 'DTEND') {
        const d = parseICalDate(value)
        cur.dateEnd = d ? d.toISOString() : null
      }
      else if (key === 'RRULE') cur._rrule = value
    }

    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    return NextResponse.json({ events: events.slice(0, 50) })
  } catch (error) {
    console.error('Calendar API error:', error)
    return NextResponse.json({ events: [], error: String(error) }, { status: 200 })
  }
}

export async function POST() {
  return NextResponse.json({ ok: false, error: 'Write disabled — using Google Calendar read-only via iCal' }, { status: 200 })
}
