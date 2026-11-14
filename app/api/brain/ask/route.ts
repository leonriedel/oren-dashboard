import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// SECONDBRAIN · ask your brain (admin only) → answer grounded in your notes, with cited note ids
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
  if (!user || (user.app_metadata?.role || user.user_metadata?.role) !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (!ANTHROPIC_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 200 })

  const { question } = await req.json().catch(() => ({ question: '' }))
  const q = String(question || '').trim()
  if (!q) return NextResponse.json({ error: 'empty' }, { status: 400 })

  const { data: notes } = await supa.from('brain_notes')
    .select('id,type,title,summary,body,tags,url,created_at').eq('user_id', user.id)
    .order('created_at', { ascending: false }).limit(400)

  // keyword relevance → top 40 into context
  const words = q.toLowerCase().split(/[^A-Za-z0-9À-ɏ]+/).filter(w => w.length > 2)
  const scored = (notes || []).map(n => {
    const hay = `${n.title} ${n.summary || ''} ${n.body || ''} ${(n.tags || []).join(' ')}`.toLowerCase()
    return { n, s: words.reduce((acc, w) => acc + (hay.includes(w) ? 1 : 0), 0) }
  }).sort((a, b) => b.s - a.s)
  const ctx = scored.slice(0, 40).map(({ n }) =>
    `[${n.id}] (${n.type}, ${String(n.created_at).slice(0, 10)}) ${n.title} — ${n.summary || ''} ${n.body && n.body !== n.title ? '| ' + String(n.body).slice(0, 400) : ''} ${(n.tags || []).map((t: string) => '#' + t).join(' ')}`)

  const prompt = `You are OREN, Leon's second brain. Answer his question using ONLY his notes below. Be direct and concise (max 5 sentences or a short list). Connect dots between notes when useful. If the notes don't cover it, say so briefly and suggest what to capture.
Answer in the language of the question.

QUESTION: ${q}

NOTES:
${ctx.join('\n') || '(no notes yet)'}

Return ONLY JSON: { "answer": "...", "cited": ["note ids you used"] }`

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 700, messages: [{ role: 'user', content: prompt }] }),
    })
    const j = await r.json()
    const text = String(j?.content?.[0]?.text || '')
    const m = text.match(/\{[\s\S]*\}/)
    const out = m ? JSON.parse(m[0]) : { answer: text, cited: [] }
    const ids = new Set((notes || []).map(n => n.id))
    return NextResponse.json({ answer: out.answer, cited: (out.cited || []).filter((id: string) => ids.has(id)) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 200 })
  }
}
