import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// SECONDBRAIN · think with OREN on a single note (admin only)
// modes: questions | expand | challenge | plan
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''

const MODES: Record<string, string> = {
  questions: 'Ask 5 sharp, specific questions that force deeper thinking about this. No preamble. Numbered list.',
  expand: 'Develop this further: 4-6 concrete angles, possibilities or ways it could work. Build on what is already written, do not repeat it. Bullet list, each with one bold lead phrase.',
  challenge: 'Play devil\'s advocate: the 4-5 weakest points, risks, blind spots or assumptions. Be honest and specific, not generic. Bullet list.',
  plan: 'Turn this into a concrete action plan: 4-7 next steps as a markdown checklist ("- [ ] ..."), ordered, each doable in one sitting. Add one line "Done when: ..." at the end.',
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const supa = createClient(SUPA_URL, SUPA_KEY)
  const { data: u } = await supa.auth.getUser(token)
  const user = u?.user
  if (!user || (user.app_metadata?.role || user.user_metadata?.role) !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (!ANTHROPIC_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 200 })

  const { noteId, mode, title, body } = await req.json().catch(() => ({}))
  if (!MODES[mode]) return NextResponse.json({ error: 'bad mode' }, { status: 400 })

  const { data: note } = await supa.from('brain_notes').select('*').eq('id', noteId).eq('user_id', user.id).single()
  if (!note) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const { data: related } = note.related?.length
    ? await supa.from('brain_notes').select('title,summary,type').in('id', note.related)
    : { data: [] as any[] }

  const prompt = `You are OREN, Leon's thinking partner inside his second brain. Leon is an entrepreneur (AI OS "OREN", trading bot "Edgar", real estate, investments; lives between Bali and Europe).
Write in the same language as the note (German or English). Be direct, smart and concrete — like a sharp co-founder, not a coach. Markdown only, no heading, max ~180 words.

TASK: ${MODES[mode]}

NOTE (${note.type}${note.project ? `, project: ${note.project}` : ''}):
Title: ${title || note.title}
${note.summary ? `Summary: ${note.summary}\n` : ''}Content:
${String(body ?? note.body ?? '').slice(0, 6000)}

RELATED NOTES: ${JSON.stringify(related || [])}`

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 700, messages: [{ role: 'user', content: prompt }] }),
    })
    const j = await r.json()
    const text = String(j?.content?.[0]?.text || '').trim()
    if (!text) throw new Error('empty answer')
    return NextResponse.json({ markdown: text })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 200 })
  }
}
