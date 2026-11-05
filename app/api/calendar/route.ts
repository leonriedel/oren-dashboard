import { NextRequest, NextResponse } from 'next/server'

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || ''
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary'

// Simple in-memory access token cache (resets per cold start; fine for our scale)
let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token
  }
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error('Google OAuth not configured: missing CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN')
  }
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
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`)
  }
  const data = await res.json()
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  }
  return cachedToken.token
}

export async function GET() {
  try {
    const token = await getAccessToken()
    const now = new Date()
    const horizon = new Date()
    horizon.setDate(now.getDate() + 30)

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

    if (!res.ok) {
      return NextResponse.json({ events: [], error: `Google API: ${res.status} ${await res.text()}` }, { status: 200 })
    }

    const data = await res.json()

    const events = (data.items || []).map((item: any) => ({
      id: item.id,
      title: item.summary || 'Kein Titel',
      date: item.start?.dateTime || item.start?.date,
      dateEnd: item.end?.dateTime || item.end?.date || null,
      location: item.location || null,
      htmlLink: item.htmlLink || null,
    }))

    return NextResponse.json({ events })
  } catch (error) {
    console.error('Calendar GET error:', error)
    return NextResponse.json({ events: [], error: String(error) }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    // Only Oren (bot) may write events — same PIN as /api/oren
    const OREN_PIN = process.env.OREN_ACCESS_PIN
    if (OREN_PIN && req.headers.get('x-api-key') !== OREN_PIN) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const { title, start, end, notes, location } = await req.json()
    if (!title || !start) {
      return NextResponse.json({ ok: false, error: 'title and start are required' }, { status: 400 })
    }

    const token = await getAccessToken()

    // Default: 1h duration if no end provided
    const startDate = new Date(start)
    const endDate = end ? new Date(end) : new Date(startDate.getTime() + 60 * 60 * 1000)

    const body = {
      summary: title,
      description: notes || undefined,
      location: location || undefined,
      start: { dateTime: startDate.toISOString(), timeZone: 'Asia/Makassar' },
      end: { dateTime: endDate.toISOString(), timeZone: 'Asia/Makassar' },
    }

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ ok: false, error: `Google POST: ${res.status} ${err}` }, { status: 200 })
    }

    const data = await res.json()
    return NextResponse.json({ ok: true, id: data.id, htmlLink: data.htmlLink, title, start, end: endDate.toISOString() })
  } catch (error) {
    console.error('Calendar POST error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 200 })
  }
}
