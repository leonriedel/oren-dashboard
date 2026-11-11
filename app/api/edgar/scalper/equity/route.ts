import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!

export async function GET(req: Request) {
  try {
    const u = new URL(req.url)
    const days = Math.min(Number(u.searchParams.get('days') || 7), 90)
    const supa = createClient(SUPA_URL, KEY)
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supa
      .from('edgar_equity')
      .select('*')
      .gte('ts', since)
      .order('ts', { ascending: true })

    if (error) {
      return NextResponse.json({ equity: [], error: error.message }, { status: 200 })
    }

    return NextResponse.json({ equity: data || [] })
  } catch (e) {
    return NextResponse.json({ equity: [], error: String(e) }, { status: 200 })
  }
}
