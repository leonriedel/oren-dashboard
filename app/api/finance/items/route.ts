import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { adminOnly } from '@/lib/apiAuth'

// CRUD for investments_v2 (items inside categories)
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!

async function requireUserId(req: Request): Promise<string | null> {
  // Expect x-user-id header from client (set via browser session user.id)
  const uid = req.headers.get('x-user-id')
  return uid || null
}

export async function GET(req: Request) {
  const denied = await adminOnly(req); if (denied) return denied
  const supa = createClient(SUPA_URL, KEY)
  const { data, error } = await supa.from('investments_v2').select('*').order('created_at')
  if (error) return NextResponse.json({ items: [], error: error.message }, { status: 200 })
  return NextResponse.json({ items: data || [] })
}

export async function POST(req: Request) {
  const denied = await adminOnly(req); if (denied) return denied
  const body = await req.json()
  const { category, name, invested, current_value, monthly_return, yearly_return, notes, user_id } = body
  if (!category || !name) {
    return NextResponse.json({ ok: false, error: 'category + name required' }, { status: 400 })
  }
  const supa = createClient(SUPA_URL, KEY)
  const row: any = {
    category, name,
    invested:       Number(invested) || 0,
    current_value:  Number(current_value) || 0,
    monthly_return: Number(monthly_return) || 0,
    yearly_return:  Number(yearly_return) || 0,
    notes: notes || null,
  }
  if (user_id) row.user_id = user_id
  const { data, error } = await supa.from('investments_v2').insert(row).select().single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
  return NextResponse.json({ ok: true, item: data })
}

export async function PATCH(req: Request) {
  const denied = await adminOnly(req); if (denied) return denied
  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
  const supa = createClient(SUPA_URL, KEY)
  ;['invested','current_value','monthly_return','yearly_return'].forEach(k => {
    if (fields[k] !== undefined) fields[k] = Number(fields[k])
  })
  fields.updated_at = new Date().toISOString()
  const { data, error } = await supa.from('investments_v2').update(fields).eq('id', id).select().single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
  return NextResponse.json({ ok: true, item: data })
}

export async function DELETE(req: Request) {
  const denied = await adminOnly(req); if (denied) return denied
  const u = new URL(req.url)
  const id = u.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id query param required' }, { status: 400 })
  const supa = createClient(SUPA_URL, KEY)
  const { error } = await supa.from('investments_v2').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
  return NextResponse.json({ ok: true })
}
