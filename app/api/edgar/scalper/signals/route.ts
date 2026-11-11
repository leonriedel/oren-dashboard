import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!

export async function GET(req: Request) {
  try {
    const u = new URL(req.url)
    const limit = Math.min(Number(u.searchParams.get('limit') || 30), 100)
    const supa = createClient(URL, KEY)

    const { data, error } = await supa
      .from('edgar_signals')
      .select('*')
      .order('ts', { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ signals: [], error: error.message }, { status: 200 })
    }

    return NextResponse.json({ signals: data || [] })
  } catch (e) {
    return NextResponse.json({ signals: [], error: String(e) }, { status: 200 })
  }
}
