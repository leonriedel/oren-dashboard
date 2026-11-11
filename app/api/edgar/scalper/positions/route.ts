import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!

export async function GET() {
  try {
    const supa = createClient(URL, KEY)

    // Open positions = trades without closed_at
    const { data, error } = await supa
      .from('edgar_trades')
      .select('*')
      .is('closed_at', null)
      .order('opened_at', { ascending: false })

    if (error) {
      return NextResponse.json({ positions: [], error: error.message }, { status: 200 })
    }

    return NextResponse.json({ positions: data || [] })
  } catch (e) {
    return NextResponse.json({ positions: [], error: String(e) }, { status: 200 })
  }
}
