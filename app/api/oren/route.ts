import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY!
const OREN_PIN = process.env.OREN_ACCESS_PIN!
const LEON_USER_ID = '453d97b5-1e01-48c5-9f0b-8345039b3dca'

// Whitelist: only these tables + fields can be written by OREN
const SCHEMA: Record<string, string[]> = {
  thinkspace:    ['type', 'text'],
  priorities:    ['text', 'done'],
  goals:         ['text', 'done'],
  food_notes:    ['text'],
  brain_dump:    ['text'],
  investments:   ['category', 'name', 'invested', 'current_value'],
  content_items: ['type', 'text', 'is_today', 'pipeline_status'],
}

function checkAuth(req: NextRequest) {
  return req.headers.get('x-api-key') === OREN_PIN
}

function sb() {
  return createClient(SUPABASE_URL, SUPABASE_SECRET)
}

// GET /api/oren?table=thinkspace  → list rows
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const table = req.nextUrl.searchParams.get('table')
  if (!table || !SCHEMA[table]) {
    return NextResponse.json({ error: 'invalid table', allowed: Object.keys(SCHEMA) }, { status: 400 })
  }
  const { data, error } = await sb()
    .from(table)
    .select('*')
    .eq('user_id', LEON_USER_ID)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ table, count: data?.length || 0, rows: data })
}

// POST /api/oren  body: { table, fields:{...} }  → insert row
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const { table, fields } = body
  if (!table || !SCHEMA[table]) {
    return NextResponse.json({ error: 'invalid table', allowed: Object.keys(SCHEMA) }, { status: 400 })
  }
  if (!fields || typeof fields !== 'object') {
    return NextResponse.json({ error: 'fields object required', schema: SCHEMA[table] }, { status: 400 })
  }

  // only allow whitelisted fields
  const clean: Record<string, any> = { user_id: LEON_USER_ID }
  for (const key of SCHEMA[table]) {
    if (key in fields) clean[key] = fields[key]
  }
  if (Object.keys(clean).length === 1) {
    return NextResponse.json({ error: 'no valid fields', schema: SCHEMA[table] }, { status: 400 })
  }

  const { data, error } = await sb().from(table).insert(clean).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, table, inserted: data })
}

// PATCH /api/oren  body: { table, id, fields:{...} }  → update row
export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const { table, id, fields } = body
  if (!table || !SCHEMA[table]) {
    return NextResponse.json({ error: 'invalid table', allowed: Object.keys(SCHEMA) }, { status: 400 })
  }
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const clean: Record<string, any> = {}
  for (const key of SCHEMA[table]) {
    if (fields && key in fields) clean[key] = fields[key]
  }
  const { data, error } = await sb()
    .from(table).update(clean).eq('id', id).eq('user_id', LEON_USER_ID).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, table, updated: data })
}
