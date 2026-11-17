import type { SupabaseClient } from '@supabase/supabase-js'

// SECONDBRAIN · shared capture logic (web capture bar + iPhone Shortcut ingest)
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''
export const TYPES = ['idea', 'note', 'link', 'task', 'goal', 'person', 'quote']
const SUGGESTIONS = ['today', 'project', 'reference', 'drop']
const TAG_RE = /#([A-Za-z0-9À-ɏ_-]+)/g

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

export async function captureNote(supa: SupabaseClient, userId: string, raw: string, opts: { ai: boolean; today?: string; source?: string }) {
  const url = raw.match(/https?:\/\/[^\s]+/)?.[0] || null
  const hashtags = Array.from(raw.matchAll(TAG_RE)).map(m => m[1].toLowerCase())
  const meta = url ? await pageMeta(url) : { title: '', description: '' }
  const today = opts.today || new Date().toISOString().slice(0, 10)

  let note: any = {
    type: url ? 'link' : 'note',
    title: (meta.title || raw.replace(TAG_RE, '').trim()).slice(0, 90) || 'Untitled',
    body: raw, url, summary: meta.description || null, tags: hashtags, related: [] as string[],
    status: 'inbox', project: null, due: null, next_action: null, suggestion: null,
  }

  if (opts.ai && ANTHROPIC_KEY) {
    const { data: existing } = await supa.from('brain_notes')
      .select('id,title,tags,type,project').eq('user_id', userId).neq('status', 'archived')
      .order('created_at', { ascending: false }).limit(150)
    const projects = Array.from(new Set((existing || []).map(n => n.project).filter(Boolean)))
    const prompt = `You are OREN, Leon's second brain. File this capture. Today is ${today} (${new Date(today + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long' })}).
Leon is an entrepreneur (AI OS "OREN", trading bot "Edgar", real estate, investments, lives between Bali and Europe).

CAPTURE: """${raw}"""
${url ? `LINKED PAGE: title="${meta.title}" description="${meta.description}"` : ''}

EXISTING PROJECTS: ${JSON.stringify(projects)}
EXISTING NOTES (id | type | project | title | tags):
${(existing || []).map(n => `${n.id} | ${n.type} | ${n.project || '-'} | ${n.title} | ${(n.tags || []).join(',')}`).join('\n') || '(none yet)'}

Return ONLY JSON:
{
  "type": one of ${JSON.stringify(TYPES)} (task = concrete action, goal = outcome, idea = new concept/opportunity, link = mainly a URL, person = about someone, quote, note = knowledge),
  "title": "crisp title, max 8 words, same language as capture",
  "summary": "one sentence: what it is and why it matters",
  "tags": ["2-4 lowercase single-word tags; reuse existing tags when they fit"],
  "related": ["ids of up to 4 genuinely related existing notes"],
  "project": "name of the project this belongs to — reuse an EXISTING PROJECT name exactly if it fits, else a short new name (1-3 words), or null if it's general",
  "due": "YYYY-MM-DD if a date/deadline is mentioned or clearly implied (resolve 'tomorrow', 'Friday' etc. from today), else null",
  "next_action": "for tasks/goals/ideas: the very next physical action, max 10 words, else null",
  "suggestion": one of ${JSON.stringify(SUGGESTIONS)} (today = should be done today/tomorrow, project = belongs to ongoing project work, reference = keep for later, drop = noise)
}`
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
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
          project: ai.project ? String(ai.project).slice(0, 40) : null,
          due: /^\d{4}-\d{2}-\d{2}$/.test(String(ai.due || '')) ? ai.due : null,
          next_action: ai.next_action ? String(ai.next_action).slice(0, 120) : null,
          suggestion: SUGGESTIONS.includes(ai.suggestion) ? ai.suggestion : null,
        }
      }
    } catch { /* keep fallback */ }
  }

  const { data: saved, error } = await supa.from('brain_notes').insert({ ...note, user_id: userId }).select().single()
  if (error) throw new Error(error.message)

  for (const rid of note.related) {
    const { data: r } = await supa.from('brain_notes').select('related').eq('id', rid).single()
    await supa.from('brain_notes').update({ related: Array.from(new Set([...(r?.related || []), saved.id])) }).eq('id', rid)
  }
  return saved
}
