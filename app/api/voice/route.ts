import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { captureNote } from '@/lib/brain/capture'

// OREN VOICE · understands a spoken command, answers briefly (to be spoken) and returns actions.
// Data actions (capture, priority) run here; navigation runs in the browser.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''

const TARGETS = ['home', 'brain', 'think', 'radar', 'finance', 'news', 'sport', 'estate', 'calendar', 'scalper']

export async function POST(req: Request) {
  const h = req.headers.get('authorization') || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const supa = createClient(SUPA_URL, SUPA_KEY)
  const { data: u } = await supa.auth.getUser(token)
  const user = u?.user
  if (!user || (user.app_metadata?.role || user.user_metadata?.role) !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (!ANTHROPIC_KEY) return NextResponse.json({ reply: 'Mir fehlt der Anthropic API Key.', actions: [] })

  const { text, lang, path, history, localTime } = await req.json().catch(() => ({}))
  const said = String(text || '').trim()
  if (!said) return NextResponse.json({ reply: '', actions: [] })

  const origin = new URL(req.url).origin
  const today = new Date().toISOString().slice(0, 10)
  const [prios, cal, mail, notes] = await Promise.all([
    supa.from('priorities').select('text,done').eq('user_id', user.id).eq('done', false).order('sort_order').limit(8),
    fetch(`${origin}/api/calendar`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({})),
    fetch(`${origin}/api/mail`, { cache: 'no-store', headers: { authorization: h } }).then(r => r.json()).catch(() => ({})),
    supa.from('brain_notes').select('title,type,project,due,status').eq('user_id', user.id).neq('status', 'archived').order('created_at', { ascending: false }).limit(40),
  ])
  const events = (cal.events || []).filter((e: any) => String(e.date).slice(0, 10) >= today).slice(0, 8).map((e: any) => ({ title: e.title, start: e.date }))
  const mails = (mail.mails || []).slice(0, 5).map((m: any) => ({ from: m.from, subject: m.subject, unread: m.unread }))

  const prompt = `You are OREN, Leon's personal AI operating system, speaking out loud through his dashboard (like JARVIS). Leon: entrepreneur (OREN, trading bot Edgar, real estate, investments), lives between Bali and Europe.
Local time: ${localTime || 'unknown'}. Current page: ${path || '/dashboard'}. Voice language: ${lang === 'en' ? 'English' : 'German'}.

Leon said: "${said}"

Rules for "reply": it will be SPOKEN. Reply in ${lang === 'en' ? 'English' : 'German'} (if he clearly spoke the other language, use that and set "lang"). Max 2 short sentences, natural, confident, a little dry wit is fine. No markdown, no lists, no emojis, no URLs. Never read out IDs.

Possible actions (only when he asks for them):
- {"type":"navigate","target": one of ${JSON.stringify(TARGETS)}}  (brain = SecondBrain, think = ThinkSpace, estate = Real Estate, scalper = Edgar trading bot, home = main page)
- {"type":"capture","text":"..."}  — save a thought/idea/task/reminder to his SecondBrain
- {"type":"priority","text":"..."} — add to today's priorities
- {"type":"stop"} — he says stop / sleep / that's all

CONTEXT
Open priorities: ${JSON.stringify((prios.data || []).map(p => p.text))}
Calendar (upcoming): ${JSON.stringify(events)}
Newest mails: ${JSON.stringify(mails)}
Recent SecondBrain notes: ${JSON.stringify(notes.data || [])}
Recent conversation: ${JSON.stringify((history || []).slice(-6))}

Return ONLY JSON: {"reply":"...","lang":"de"|"en","actions":[...]}`

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
    })
    const j = await r.json()
    const m = String(j?.content?.[0]?.text || '').match(/\{[\s\S]*\}/)
    const out = m ? JSON.parse(m[0]) : { reply: lang === 'en' ? 'Sorry, I missed that.' : 'Das habe ich nicht verstanden.', actions: [] }
    const actions: any[] = Array.isArray(out.actions) ? out.actions : []
    const clientActions: any[] = []
    for (const a of actions) {
      if (a?.type === 'navigate' && TARGETS.includes(a.target)) clientActions.push({ type: 'navigate', target: a.target })
      else if (a?.type === 'stop') clientActions.push({ type: 'stop' })
      else if (a?.type === 'capture' && a.text) { await captureNote(supa, user.id, String(a.text), { ai: true, today }).catch(() => null); clientActions.push({ type: 'captured' }) }
      else if (a?.type === 'priority' && a.text) { await supa.from('priorities').insert({ user_id: user.id, text: String(a.text).slice(0, 140), done: false, sort_order: 999 }); clientActions.push({ type: 'prioritized' }) }
    }
    return NextResponse.json({ reply: String(out.reply || ''), lang: out.lang === 'en' ? 'en' : out.lang === 'de' ? 'de' : (lang || 'de'), actions: clientActions })
  } catch (e) {
    return NextResponse.json({ reply: lang === 'en' ? 'Something went wrong.' : 'Da ist etwas schiefgelaufen.', actions: [], error: String(e) })
  }
}
