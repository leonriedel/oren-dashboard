import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!

export async function GET() {
  try {
    const supa = createClient(URL, KEY)
    const { data, error } = await supa
      .from('edgar_bot_status')
      .select('*')
      .eq('id', 1)
      .single()

    if (error) {
      return NextResponse.json({ status: null, error: error.message }, { status: 200 })
    }

    const now = Date.now()
    const hb = data?.last_heartbeat ? new Date(data.last_heartbeat).getTime() : 0
    const alive = hb > 0 && now - hb < 15 * 60 * 1000 // 15 min window

    return NextResponse.json({
      alive,
      lastHeartbeat: data?.last_heartbeat,
      lastSignalScan: data?.last_signal_scan,
      lastError: data?.last_error,
      lastErrorAt: data?.last_error_at,
      mode: data?.mode || 'paper',
      universe: data?.universe || [],
      version: data?.version || 'v0',
    })
  } catch (e) {
    return NextResponse.json({ alive: false, error: String(e) }, { status: 200 })
  }
}
