import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!

// Note: service-role key bypasses RLS. Admin-only route on client side (page gated).

export async function GET() {
  const supa = createClient(SUPA_URL, KEY)
  const { data, error } = await supa
    .from('finance_manual_entries')
    .select('*')
    .order('bucket')
    .order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ entries: [], error: error.message }, { status: 200 })
  return NextResponse.json({ entries: data || [] })
}

export async function POST(req: Request) {
  const body = await req.json()
  const { bucket, label, amount_eur, note, owner } = body
  if (!bucket || !label || amount_eur === undefined) {
    return NextResponse.json({ ok: false, error: 'bucket, label, amount_eur required' }, { status: 400 })
  }
  const supa = createClient(SUPA_URL, KEY)
  const row: any = { bucket, label, amount_eur: Number(amount_eur), note: note || null }
  if (owner) row.owner = owner
  const { data, error } = await supa.from('finance_manual_entries').insert(row).select().single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
  return NextResponse.json({ ok: true, entry: data })
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
  const supa = createClient(SUPA_URL, KEY)
  if (fields.amount_eur !== undefined) fields.amount_eur = Number(fields.amount_eur)
  fields.updated_at = new Date().toISOString()
  const { data, error } = await supa.from('finance_manual_entries').update(fields).eq('id', id).select().single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
  return NextResponse.json({ ok: true, entry: data })
}

export async function DELETE(req: Request) {
  const u = new URL(req.url)
  const id = u.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id query param required' }, { status: 400 })
  const supa = createClient(SUPA_URL, KEY)
  const { error } = await supa.from('finance_manual_entries').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
  return NextResponse.json({ ok: true })
}
