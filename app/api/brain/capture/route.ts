import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// SECONDBRAIN · capture anything → OREN classifies, tags and links it (AI for admin only)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''
const TYPES = ['idea', 'note', 'link', 'task', 'goal', 'person', 'quote']

async function pageMeta(url: string) {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 4000)
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 OREN' } })
    clearTimeout(t)
    const html = (await r.text()).slice(0, 200_000)
    const pick = (re: RegExp) => html.match(re)?.[1]?.replace(/\s+/g, ' ').trim() || ''
    return {
      title: pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || pick(/<title[^>]*>([^<]+)<\/title>/i),
      description: pick(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]+content=["']([^"']+)/i),
    }
  } catch { return { title: '', description: '' } }
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const supa = createClient(SUPA_URL, SUPA_KEY)
  const { data: u } = await supa.auth.getUser(token)
  const user = u?.user
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const isAdmin = (user.app_metadata?.role || user.user_metadata?.role) === 'admin'

  const { text } = await req.json().catch(() => ({ text: '' }))
  const raw = String(text || '').trim()
  if (!raw) return NextResponse.json({ error: 'empty' }, { status: 400 })

  const url = raw.match(/https?:\/\/[^\s]+/)?.[0] || null
  const hashtags = Array.from(raw.matchAll(/#([A-Za-z0-9À-ɏ_-]+)/g)).map(m => m[1].toLowerCase())
  const meta = url ? await pageMeta(url) : { title: '', description: '' }

  // fallback (no AI)
  let note: any = {
    type: url ? 'link' : 'note',
    title: (meta.title || raw.replace(/#[A-Za-z0-9À-ɏ_-]+/g, '').trim()).slice(0, 90) || 'Untitled',
    body: raw, url, summary: meta.description || null, tags: hashtags, related: [] as string[],
  }
  let alsoCreate: 'task' | 'goal' | null = null

  if (isAdmin && ANTHROPIC_KEY) {
    const { data: existing } = await supa.from('brain_notes').select('id,title,tags,type').eq('user_id', user.id).order('created_at', { ascending: false }).limit(150)
    const prompt = `You are OREN, Leon's second brain. File this capture.
CAPTURE: """${raw}"""
${url ? `LINKED PAGE: title="${meta.title}" description="${meta.description}"` : ''}

EXISTING NOTES (id | type | title | tags):
${(existing || []).map(n => `${n.id} | ${n.type} | ${n.title} | ${(n.tags || []).join(',')}`).join('\n') || '(none yet)'}

Return ONLY JSON:
{
  "type": one of ${JSON.stringify(TYPES)} (task = concrete action to do soon, goal = outcome to reach, idea = new concept/opportunity, link = mainly a URL, person = about someone, quote = a quote, note = knowledge/info),
  "title": "crisp title, max 8 words, same language as capture",
  "summary": "one sentence: what it is and why it matters",
  "tags": ["2-4 lowercase single-word tags; REUSE existing tags when they fit"],
  "related": ["ids of up to 4 existing notes that are genuinely related"]
}`
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
      })
      const j = await r.json()
      const m = String(j?.content?.[0]?.text || '').match(/\{[\s\S]*\}/)
      if (m) {
        const ai = JSON.parse(m[0])
        const ids = new Set((existing || []).map(n => n.id))
        note = {
          ...note,
          type: TYPES.includes(ai.type) ? ai.type : note.type,
          title: String(ai.title || note.title).slice(0, 90),
          summary: ai.summary || note.summary,
          tags: Array.from(new Set([...hashtags, ...((ai.tags || []) as string[]).map(t => String(t).toLowerCase().replace(/^#/, ''))])).slice(0, 6),
          related: ((ai.related || []) as string[]).filter(id => ids.has(id)).slice(0, 4),
        }
        if (note.type === 'task' || note.type === 'goal') alsoCreate = note.type
      }
    } catch { /* keep fallback */ }
  }

  const { data: saved, error } = await supa.from('brain_notes').insert({ ...note, user_id: user.id }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 200 })

  // back-link related notes
  for (const rid of note.related) {
    const { data: r } = await supa.from('brain_notes').select('related').eq('id', rid).single()
    const rel = Array.from(new Set([...(r?.related || []), saved.id]))
    await supa.from('brain_notes').update({ related: rel }).eq('id', rid)
  }
  // tasks → priorities, goals → goals
  if (alsoCreate === 'task') await supa.from('priorities').insert({ user_id: user.id, text: note.title, done: false, sort_order: 999 })
  if (alsoCreate === 'goal') await supa.from('goals').insert({ user_id: user.id, text: note.title, done: false })

  return NextResponse.json({ note: saved, alsoCreated: alsoCreate })
}
