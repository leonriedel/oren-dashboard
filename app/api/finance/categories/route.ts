import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// CRUD for investment_categories
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!

export async function GET() {
  const supa = createClient(SUPA_URL, KEY)
  const { data, error } = await supa.from('investment_categories').select('*').order('sort_order')
  if (error) return NextResponse.json({ categories: [], error: error.message }, { status: 200 })
  return NextResponse.json({ categories: data || [] })
}

export async function POST(req: Request) {
  const body = await req.json()
  const { name, icon, sort_order, user_id } = body
  if (!name) return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 })
  const supa = createClient(SUPA_URL, KEY)
  const row: any = { name: name.trim(), icon: icon || '◆', sort_order: sort_order ?? 10 }
  if (user_id) row.user_id = user_id
  const { data, error } = await supa.from('investment_categories').insert(row).select().single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
  return NextResponse.json({ ok: true, category: data })
}

export async function DELETE(req: Request) {
  const u = new URL(req.url)
  const id = u.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id query param required' }, { status: 400 })
  const supa = createClient(SUPA_URL, KEY)
  const { data: cat } = await supa.from('investment_categories').select('name').eq('id', id).single()
  if (cat) {
    // cascade: delete all items in this category
    await supa.from('investments_v2').delete().eq('category', cat.name)
  }
  const { error } = await supa.from('investment_categories').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 200 })
  return NextResponse.json({ ok: true })
}
