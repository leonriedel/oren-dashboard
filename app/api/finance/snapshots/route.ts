import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { adminOnly } from '@/lib/apiAuth'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!

export async function GET(req: Request) {
  const denied = await adminOnly(req); if (denied) return denied
  const u = new URL(req.url)
  const days = Math.min(Number(u.searchParams.get('days') || 90), 365)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const supa = createClient(SUPA_URL, KEY)
  const { data, error } = await supa
    .from('finance_snapshots')
    .select('ts, total_eur, liquid_eur, investments_eur, physical_eur, other_eur')
    .gte('ts', since)
    .order('ts', { ascending: true })

  if (error) return NextResponse.json({ snapshots: [], error: error.message }, { status: 200 })
  return NextResponse.json({ snapshots: data || [] })
}
