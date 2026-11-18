import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { captureNote } from '@/lib/brain/capture'

// SECONDBRAIN · MIND — talk to your second brain.
// OREN decides per message: capture (file it), ask (answer from notes) or reflect (think along).
// GET  → conversation history      POST { text, today } → { me, oren, note? }
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''

async function auth(req: Request) {
  const h = req.headers.get('authorization') || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token) return null
  const supa = createClient(SUPA_URL, SUPA_KEY)
  const { data } = await supa.auth.getUser(token)
  if (!data?.user) return null
  const isAdmin = (data.user.app_metadata?.role || data.user.user_metadata?.role) === 'admin'
  return { supa, user: data.user, isAdmin }
}

export async function GET(req: Request) {
  const a = await auth(req)
  if (!a) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { data, error } = await a.supa.from('brain_mind').select('*').eq('user_id', a.user.id).order('created_at', { ascending: false }).limit(80)
  if (error) return NextResponse.json({ messages: [], error: error.message })
  return NextResponse.json({ messages: (data || []).reverse() })
}

export async function POST(req: Request) {
  const a = await auth(req)
  if (!a) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { supa, user, isAdmin } = a
  const { text, today, mode, context } = await req.json().catch(() => ({}))
  if (mode === 'plan') return planDay(req, supa, user.id, isAdmin, today, context)
  const raw = String(text || '').trim()
  if (!raw) return NextResponse.json({ error: 'empty' }, { status: 400 })

  const { data: meRow, error: meErr } = await supa.from('brain_mind').insert({ user_id: user.id, role: 'me', content: raw }).select().single()
  if (meErr) return NextResponse.json({ error: meErr.message }, { status: 200 })

  // non-admin: plain capture, no AI conversation
  if (!isAdmin || !ANTHROPIC_KEY) {
    const note = await captureNote(supa, user.id, raw, { ai: false, today }).catch(() => null)
    const { data: orenRow } = await supa.from('brain_mind').insert({ user_id: user.id, role: 'oren', content: 'Saved to your inbox.', intent: 'capture', note_id: note?.id || null }).select().single()
    return NextResponse.json({ me: meRow, oren: orenRow, note })
  }

  const [{ data: history }, { data: notes }] = await Promise.all([
    supa.from('brain_mind').select('role,content').eq('user_id', user.id).order('created_at', { ascending: false }).limit(12),
    supa.from('brain_notes').select('id,type,title,summary,body,tags,project,status,due,created_at').eq('user_id', user.id).neq('status', 'archived').order('created_at', { ascending: false }).limit(300),
  ])
  const words = raw.toLowerCase().split(/[^a-z0-9À-ɏ]+/).filter(w => w.length > 3)
  const scored = (notes || []).map(n => {
    const hay = `${n.title} ${n.summary || ''} ${n.body || ''} ${(n.tags || []).join(' ')} ${n.project || ''}`.toLowerCase()
    return { n, s: words.reduce((acc, w) => acc + (hay.includes(w) ? 1 : 0), 0) }
  }).sort((x, y) => y.s - x.s)
  const deep = scored.filter(x => x.s > 0).slice(0, 12).map(({ n }) =>
    `[${n.id}] ${n.type}${n.project ? ` · ${n.project}` : ''}${n.due ? ` · due ${n.due}` : ''} — ${n.title}: ${n.summary || ''} ${String(n.body || '').slice(0, 500)}`)
  const index = (notes || []).slice(0, 120).map(n => `[${n.id}] ${n.type} | ${n.project || '-'} | ${n.title}`)
  const convo = (history || []).reverse().map(m => `${m.role === 'me' ? 'Leon' : 'OREN'}: ${m.content}`).join('\n')

  const prompt = `You are OREN, Leon's second brain and thinking partner. Leon: entrepreneur (AI OS "OREN", trading bot "Edgar", real estate, investments), lives between Bali and Europe. Today: ${today || new Date().toISOString().slice(0, 10)}.

Leon just said: """${raw}"""

Decide the intent:
- "capture": he states an idea, task, plan, fact, link, contact or anything worth keeping → it will be filed.
- "ask": he asks about his own stuff / what he planned / what he knows → answer ONLY from his notes.
- "reflect": he thinks out loud, feels stuck, weighs options, wants a sparring partner → think with him. Set "capture" too if the thought is worth keeping as a journal note.

Reply rules: same language as Leon (usually German), warm but sharp like a brilliant co-founder, max 70 words, no fluff, no emojis. For capture: one short line acknowledging + ONE smart follow-up question or a connection to an existing note. For ask: the answer, concrete. For reflect: one insight + one question that moves him forward.

RECENT CONVERSATION:
${convo}

MOST RELEVANT NOTES:
${deep.join('\n') || '(none)'}

NOTE INDEX:
${index.join('\n') || '(empty brain)'}

Return ONLY JSON: { "intent": "capture"|"ask"|"reflect", "reply": "...", "cited": ["ids of notes you referenced"], "capture": "cleaned text to file, or null" }`

  let out: { intent: string; reply: string; cited: string[]; capture: string | null } = { intent: 'capture', reply: 'Notiert.', cited: [], capture: raw }
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
    })
    const j = await r.json()
    const m = String(j?.content?.[0]?.text || '').match(/\{[\s\S]*\}/)
    if (m) {
      const p = JSON.parse(m[0])
      const ids = new Set((notes || []).map(n => n.id))
      out = {
        intent: ['capture', 'ask', 'reflect'].includes(p.intent) ? p.intent : 'capture',
        reply: String(p.reply || 'Notiert.'),
        cited: ((p.cited || []) as string[]).filter(id => ids.has(id)),
        capture: p.capture ? String(p.capture) : (p.intent === 'capture' ? raw : null),
      }
    }
  } catch { /* fallback: capture */ }

  let note: any = null
  if (out.capture) note = await captureNote(supa, user.id, out.capture, { ai: true, today }).catch(() => null)

  const { data: orenRow } = await supa.from('brain_mind').insert({
    user_id: user.id, role: 'oren', content: out.reply, intent: out.intent, note_id: note?.id || null, cited: out.cited,
  }).select().single()
  return NextResponse.json({ me: meRow, oren: orenRow, note })
}

// ─── PLAN MY DAY ───
async function planDay(req: Request, supa: any, userId: string, isAdmin: boolean, today: string | undefined, context: any) {
  if (!isAdmin || !ANTHROPIC_KEY) return NextResponse.json({ error: 'planning needs admin + ANTHROPIC_API_KEY' }, { status: 200 })
  const day = today || new Date().toISOString().slice(0, 10)
  const { data: meRow } = await supa.from('brain_mind').insert({ user_id: userId, role: 'me', content: '☀ Plan my day', intent: 'plan' }).select().single()
  const origin = new URL(req.url).origin
  const cal = await fetch(`${origin}/api/calendar`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({}))
  const events = (cal.events || []).filter((e: any) => String(e.date).slice(0, 10) === day).map((e: any) => ({ title: e.title, start: e.date }))
  const { data: hist } = await supa.from('brain_mind').select('role,content').eq('user_id', userId).order('created_at', { ascending: false }).limit(8)

  const prompt = `You are OREN, Leon's chief of staff. Plan his day ${day} (${new Date(day + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long' })}).
Pick the 1-3 topics that deserve focus today (respect P1 priority, overdue/due items, momentum, calendar load). For each focus topic give 2-4 concrete tasks doable today.
Write the reply in German, direct, max 90 words: a short plan with the order of the day. No fluff.

TOPICS (sorted by heat; P1 = high priority):
${JSON.stringify(context?.topics || [], null, 1).slice(0, 7000)}

CURRENT PRIORITIES: ${JSON.stringify(context?.priorities || [])}
CALENDAR TODAY: ${JSON.stringify(events)}
RECENT CONVERSATION: ${(hist || []).reverse().map((m: any) => `${m.role}: ${m.content}`).join(' | ').slice(0, 1500)}

Return ONLY JSON: { "reply": "...", "focus": ["exact topic names"], "tasks": [{ "topic": "exact topic name", "text": "task" }] }`

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 900, messages: [{ role: 'user', content: prompt }] }),
    })
    const j = await r.json()
    const m = String(j?.content?.[0]?.text || '').match(/\{[\s\S]*\}/)
    const p = m ? JSON.parse(m[0]) : { reply: 'Konnte keinen Plan erstellen.', focus: [], tasks: [] }
    const names = new Set(((context?.topics || []) as any[]).map(t => t.name))
    const plan = {
      reply: String(p.reply || ''),
      focus: ((p.focus || []) as string[]).filter(n => names.has(n)).slice(0, 3),
      tasks: ((p.tasks || []) as any[]).filter(t => names.has(t.topic) && t.text).map(t => ({ topic: String(t.topic), text: String(t.text).slice(0, 140) })).slice(0, 12),
      at: new Date().toISOString(),
    }
    await supa.from('brain_days').upsert({ user_id: userId, day, focus_topics: plan.focus, plan, updated_at: new Date().toISOString() }, { onConflict: 'user_id,day' })
    const { data: orenRow } = await supa.from('brain_mind').insert({ user_id: userId, role: 'oren', content: plan.reply, intent: 'plan' }).select().single()
    return NextResponse.json({ me: meRow, oren: orenRow, plan })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 200 })
  }
}
