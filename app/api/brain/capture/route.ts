import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { captureNote } from '@/lib/brain/capture'

// SECONDBRAIN · capture from the web UI (AI filing for admin only)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const supa = createClient(SUPA_URL, SUPA_KEY)
  const { data: u } = await supa.auth.getUser(token)
  const user = u?.user
  if (!user) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const isAdmin = (user.app_metadata?.role || user.user_metadata?.role) === 'admin'
  if (!isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const { text, today } = await req.json().catch(() => ({ text: '' }))
  const raw = String(text || '').trim()
  if (!raw) return NextResponse.json({ error: 'empty' }, { status: 400 })
  try {
    const note = await captureNote(supa, user.id, raw, { ai: isAdmin, today })
    return NextResponse.json({ note })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 200 })
  }
}
