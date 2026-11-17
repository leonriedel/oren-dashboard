import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { captureNote } from '@/lib/brain/capture'

// SECONDBRAIN · capture from anywhere (iPhone Shortcut / share sheet)
// POST /api/brain/ingest   Authorization: Bearer <BRAIN_INGEST_TOKEN>   body: { "text": "..." }
// Env (Vercel): BRAIN_INGEST_TOKEN = long random secret only Leon knows
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!
const INGEST_TOKEN = process.env.BRAIN_INGEST_TOKEN || ''

let ownerId: string | null = null
async function adminUserId(supa: any): Promise<string | null> {
  if (ownerId) return ownerId
  const { data } = await supa.auth.admin.listUsers({ page: 1, perPage: 200 })
  const admin = (data?.users || []).find((u: any) => (u.app_metadata?.role || u.user_metadata?.role) === 'admin')
  ownerId = admin?.id || null
  return ownerId
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!INGEST_TOKEN || INGEST_TOKEN.length < 24 || token !== INGEST_TOKEN) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  let raw = ''
  const ct = req.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    const b = await req.json().catch(() => ({}))
    raw = String(b.text || b.url || '').trim()
  } else {
    raw = (await req.text()).trim()
  }
  if (!raw) return NextResponse.json({ error: 'empty' }, { status: 400 })

  const supa = createClient(SUPA_URL, SUPA_KEY)
  const uid = await adminUserId(supa)
  if (!uid) return NextResponse.json({ error: 'no admin user' }, { status: 500 })
  try {
    const note = await captureNote(supa, uid, raw, { ai: true, source: 'ingest' })
    const msg = `🧠 ${note.type.toUpperCase()}: ${note.title}${note.project ? ` · ${note.project}` : ''}${note.due ? ` · due ${note.due}` : ''}`
    return NextResponse.json({ ok: true, message: msg, id: note.id })
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 200 })
  }
}
