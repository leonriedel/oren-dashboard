import { NextRequest, NextResponse } from 'next/server'

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID || ''
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || ''
const CALENDAR_ID   = process.env.GOOGLE_CALENDAR_ID || 'primary'
const ICAL_URL      = process.env.GOOGLE_CAL_ICAL_URL || ''

const OAUTH_READY = Boolean(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN)

// Simple access-token cache
let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`)
  const data = await res.json()
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 }
  return cachedToken.token
}

// ─── iCal fallback parser ────────────────────────────────────────

function parseICalDate(raw: string): Date | null {
  if (!raw) return null
  if (/^\d{8}$/.test(raw)) {
    return new Date(Date.UTC(+raw.slice(0,4), +raw.slice(4,6) - 1, +raw.slice(6,8)))
  }
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (!m) return null
  const [, y, mo, d, hh, mm, ss, z] = m
  return z === 'Z'
    ? new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm, +ss))
    : new Date(+y, +mo - 1, +d, +hh, +mm, +ss)
}

function unfold(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  for (const l of lines) {
    if ((l.startsWith(' ') || l.startsWith('\t')) && out.length) out[out.length - 1] += l.slice(1)
    else out.push(l)
  }
  return out
}

function decodeText(s: string): string {
  return s.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim()
}

async function fetchICal() {
  const res = await fetch(ICAL_URL, { next: { revalidate: 300 }, headers: { 'User-Agent': 'oren-dashboard/1.0' } })
  if (!res.ok) throw new Error(`iCal fetch failed: ${res.status}`)
  const text = await res.text()
  const lines = unfold(text)

  const now = new Date()
  const horizon = new Date(); horizon.setDate(now.getDate() + 30)
  const events: any[] = []
  let inEv = false, cur: any = {}

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { inEv = true; cur = {}; continue }
    if (line === 'END:VEVENT') {
      inEv = false
      if (cur._start && cur.title) {
        const s: Date = cur._start
        if (s >= now && s <= horizon) {
          events.push({
            id: cur.id || `${s.getTime()}`,
            title: cur.title,
            date: s.toISOString(),
            dateEnd: cur.dateEnd || null,
            location: cur.location || null,
          })
        }
      }
      continue
    }
    if (!inEv) continue
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).split(';')[0].toUpperCase()
    const value = line.slice(idx + 1)
    if (key === 'SUMMARY') cur.title = decodeText(value)
    else if (key === 'UID') cur.id = value
    else if (key === 'LOCATION') cur.location = decodeText(value)
    else if (key === 'DTSTART') cur._start = parseICalDate(value)
    else if (key === 'DTEND') { const d = parseICalDate(value); cur.dateEnd = d ? d.toISOString() : null }
  }
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  return events.slice(0, 50)
}

// ─── Google Calendar API ─────────────────────────────────────────

async function fetchGoogleEvents() {
  const token = await getAccessToken()
  const now = new Date()
  const horizon = new Date(); horizon.setDate(now.getDate() + 30)
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: horizon.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  })
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 60 } }
  )
  if (!res.ok) throw new Error(`Google API: ${res.status} ${await res.text()}`)
  const data = await res.json()
  return (data.items || []).map((item: any) => ({
    id: item.id,
    title: item.summary || 'Untitled',
    date: item.start?.dateTime || item.start?.date,
    dateEnd: item.end?.dateTime || item.end?.date || null,
    location: item.location || null,
    htmlLink: item.htmlLink || null,
  }))
}

// ─── Handlers ────────────────────────────────────────────────────

export async function GET() {
  try {
    if (OAUTH_READY) {
      return NextResponse.json({ events: await fetchGoogleEvents(), source: 'google-api' })
    }
    if (ICAL_URL) {
      return NextResponse.json({ events: await fetchICal(), source: 'ical' })
    }
    return NextResponse.json({ events: [], error: 'No calendar source configured (need GOOGLE_CAL_ICAL_URL or OAuth creds)' }, { status: 200 })
  } catch (error) {
    console.error('Calendar GET error:', error)
    return NextResponse.json({ events: [], error: String(error) }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const OREN_PIN = process.env.OREN_ACCESS_PIN
    if (OREN_PIN && req.headers.get('x-api-key') !== OREN_PIN) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    if (!OAUTH_READY) {
      return NextResponse.json({
        ok: false,
        error: 'Writes require Google OAuth setup. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN in Vercel.'
      }, { status: 200 })
    }

    const { title, start, end, notes, location } = await req.json()
    if (!title || !start) return NextResponse.json({ ok: false, error: 'title and start are required' }, { status: 400 })

    const token = await getAccessToken()
    const startDate = new Date(start)
    const endDate = end ? new Date(end) : new Date(startDate.getTime() + 60 * 60 * 1000)

    const body = {
      summary: title,
      description: notes || undefined,
      location: location || undefined,
      start: { dateTime: startDate.toISOString(), timeZone: 'Asia/Makassar' },
      end:   { dateTime: endDate.toISOString(),   timeZone: 'Asia/Makassar' },
    }

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    )
    if (!res.ok) return NextResponse.json({ ok: false, error: `Google POST: ${res.status} ${await res.text()}` }, { status: 200 })
    const data = await res.json()
    return NextResponse.json({ ok: true, id: data.id, htmlLink: data.htmlLink, title, start, end: endDate.toISOString() })
  } catch (error) {
    console.error('Calendar POST error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 200 })
  }
}
