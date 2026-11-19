import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ThinkSpace · link preview (title, description, image) for link blocks. Any signed-in user.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!

export async function GET(req: Request) {
  const h = req.headers.get('authorization') || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { data } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token)
  if (!data?.user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const url = new URL(req.url).searchParams.get('url') || ''
  if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: 'bad url' }, { status: 400 })
  const site = (() => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' } })()
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 5000)
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) OREN LinkPreview', 'Accept-Language': 'en,de' } })
    clearTimeout(t)
    const html = (await r.text()).slice(0, 300_000)
    const meta = (prop: string) => {
      const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)`, 'i')
      const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i')
      return (html.match(re1)?.[1] || html.match(re2)?.[1] || '').replace(/&amp;/g, '&').trim()
    }
    let image = meta('og:image') || meta('twitter:image')
    if (image && image.startsWith('/')) image = new URL(image, url).toString()
    return NextResponse.json({
      title: meta('og:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || site,
      description: meta('og:description') || meta('description'),
      image, site,
    })
  } catch {
    return NextResponse.json({ title: site, description: '', image: '', site })
  }
}
