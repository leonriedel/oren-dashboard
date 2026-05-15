import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY!
const OREN_PIN = process.env.OREN_ACCESS_PIN!

function checkAuth(req: NextRequest) {
  const key = req.headers.get('x-api-key')
  return key === OREN_PIN
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET)
  const { data, error } = await supabase.from('thinkspace').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries: data })
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  const { type, text, user_id } = body
  if (!type || !text || !user_id) {
    return NextResponse.json({ error: 'type, text and user_id required' }, { status: 400 })
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET)
  const { data, error } = await supabase.from('thinkspace').insert({ user_id, type, text }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, entry: data })
}
