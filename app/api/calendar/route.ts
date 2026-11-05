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

// ─── iCal fallback parser (uses ical.js) ────────────────────────

import ICAL from 'ical.js'

async function fetchICal() {
  const res = await fetch(ICAL_URL, { next: { revalidate: 60 }, headers: { 'User-Agent': 'oren-dashboard/1.0' } })
  if (!res.ok) throw new Error(`iCal fetch failed: ${res.status}`)
  const text = await res.text()

  const jcal = ICAL.parse(text)
  const vcal = new ICAL.Component(jcal)
  const vevents = vcal.getAllSubcomponents('vevent')

  const now = ICAL.Time.fromJSDate(new Date(), false)
  const horizonJs = new Date(); horizonJs.setDate(horizonJs.getDate() + 30)
  const horizon = ICAL.Time.fromJSDate(horizonJs, false)

  const out: any[] = []

  for (const ve of vevents) {
    const event = new ICAL.Event(ve)
    const title = event.summary || 'Untitled'
    const loc   = event.location || null

    if (event.isRecurring()) {
      const iter = event.iterator()
      let occ
      let count = 0
      while ((occ = iter.next()) && count < 200) {
        if (occ.compare(horizon) > 0) break
        if (occ.compare(now) < 0) continue
        const details = event.getOccurrenceDetails(occ)
        const startDate = details.startDate.toJSDate()
        const endDate   = details.endDate ? details.endDate.toJSDate() : null
        out.push({
          id: `${event.uid}-${startDate.getTime()}`,
          title,
          date: startDate.toISOString(),
          dateEnd: endDate ? endDate.toISOString() : null,
          location: loc,
        })
        count++
      }
    } else {
      const startDate = event.startDate.toJSDate()
      const endDate   = event.endDate ? event.endDate.toJSDate() : null
      if (startDate >= new Date() && startDate <= horizonJs) {
        out.push({
          id: event.uid || `${startDate.getTime()}`,
          title,
          date: startDate.toISOString(),
          dateEnd: endDate ? endDate.toISOString() : null,
          location: loc,
        })
      }
    }
  }

  out.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  return out.slice(0, 100)
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
