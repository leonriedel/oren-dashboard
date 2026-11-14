import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// SECONDBRAIN · daily OREN briefing (admin only)
// Reads priorities, goals, habits, calendar and newest mails → Claude Haiku → cached per day in brain_days.briefing
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const supa = createClient(SUPA_URL, SUPA_KEY)
  const { data: u } = await supa.auth.getUser(token)
  const user = u?.user
  const role = user?.app_metadata?.role || user?.user_metadata?.role
  if (!user || role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (!ANTHROPIC_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 200 })

  const body = await req.json().catch(() => ({}))
  const day: string = body.day || new Date().toISOString().slice(0, 10)
  const localTime: string = body.localTime || ''
  const force: boolean = !!body.force

  // cached?
  const { data: existing } = await supa.from('brain_days').select('*').eq('user_id', user.id).eq('day', day).maybeSingle()
  if (existing?.briefing && !force) return NextResponse.json({ briefing: existing.briefing, cached: true })

  const yesterday = new Date(new Date(day + 'T12:00:00Z').getTime() - 86400000).toISOString().slice(0, 10)
  const [p, g, n, y] = await Promise.all([
    supa.from('priorities').select('text,done,sort_order,created_at').eq('user_id', user.id).order('sort_order').order('created_at'),
    supa.from('goals').select('text,done').eq('user_id', user.id),
    supa.from('non_negotiables').select('id,label').eq('user_id', user.id).order('sort_order'),
    supa.from('brain_days').select('nn_done,review_good,review_bad,review_tomorrow').eq('user_id', user.id).eq('day', yesterday).maybeSingle(),
  ])

  const origin = new URL(req.url).origin
  const [cal, mail] = await Promise.all([
    fetch(`${origin}/api/calendar`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
    fetch(`${origin}/api/mail`, { cache: 'no-store', headers: { authorization: auth } }).then(r => r.json()).catch(() => ({})),
  ])

  const todayDone: string[] = existing?.nn_done || []
  const habits = (n.data || []).map((h: any) => ({ habit: h.label, doneToday: todayDone.includes(h.id) }))
  const events = (cal.events || []).slice(0, 10).map((e: any) => ({ title: e.title, start: e.date }))
  const mails = (mail.mails || []).slice(0, 6).map((m: any) => ({ from: m.from, subject: m.subject, unread: m.unread }))

  const prompt = `You are OREN, Leon's personal AI operating system. Write his daily briefing for SecondBrain.
Local time now: ${localTime || 'unknown'} (day ${day}).
Be concrete and direct like a sharp chief of staff. No fluff, no motivational quotes, no generic advice. Reference his actual items by name.
If it's evening, shift toward wrapping up the day and setting up tomorrow.

Return ONLY JSON:
{
  "focus": "the ONE thing that matters most today, max 8 words",
  "briefing": "2-3 short sentences: what to do first, what to protect time for, what to watch (meetings, important mails).",
  "flags": ["0-3 very short alerts, e.g. 'Meeting 14:00 — prep deck', 'Unread mail from X'"]
}

PRIORITIES (ordered, top = most important): ${JSON.stringify(p.data || [])}
WEEKLY GOALS: ${JSON.stringify(g.data || [])}
HABITS TODAY: ${JSON.stringify(habits)}
CALENDAR: ${JSON.stringify(events)}
NEWEST MAILS: ${JSON.stringify(mails)}
YESTERDAY'S REVIEW: ${JSON.stringify(y.data || null)}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
    })
    if (!res.ok) throw new Error(`Claude HTTP ${res.status}`)
    const j = await res.json()
    const text: string = j?.content?.[0]?.text || ''
    const m = text.match(/\{[\s\S]*\}/)
    const parsed = m ? JSON.parse(m[0]) : { focus: '', briefing: text, flags: [] }
    const briefing = { ...parsed, generatedAt: new Date().toISOString(), localTime }

    await supa.from('brain_days').upsert(
      { user_id: user.id, day, briefing, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,day' },
    )
    return NextResponse.json({ briefing, cached: false })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 200 })
  }
}
