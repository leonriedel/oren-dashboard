import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET() {
  const sb = createClient(SUPABASE_URL, SUPABASE_SECRET)
  const [hb, edgar, leonAct] = await Promise.all([
    sb.from('system_heartbeat').select('*'),
    sb.from('edgar_portfolio').select('created_at').order('created_at', { ascending: false }).limit(1).single(),
    sb.from('priorities').select('created_at').order('created_at', { ascending: false }).limit(1).single(),
  ])

  const now = Date.now()
  const ageMin = (iso: string | null) => iso ? Math.floor((now - new Date(iso).getTime()) / 60000) : 99999

  const hbMap: Record<string, any> = {}
  for (const row of hb.data || []) hbMap[row.system] = row

  const orenAge = hbMap.oren ? ageMin(hbMap.oren.last_seen) : 99999
  const leonAge = leonAct.data ? ageMin(leonAct.data.created_at) : 99999
  const edgarAge = edgar.data ? ageMin(edgar.data.created_at) : 99999

  return NextResponse.json({
    leon:  { status: leonAge  < 60 ? 'ONLINE'  : leonAge  < 720 ? 'AWAY'    : 'OFFLINE', age: leonAge,  color: leonAge  < 60 ? 'green' : leonAge  < 720 ? 'amber' : 'red' },
    oren:  { status: orenAge  < 10 ? 'ACTIVE'  : orenAge  < 60  ? 'IDLE'    : 'OFFLINE', age: orenAge,  color: orenAge  < 10 ? 'green' : orenAge  < 60  ? 'amber' : 'red' },
    edgar: { status: edgarAge < 10 ? 'ACTIVE'  : edgarAge < 60  ? 'STANDBY' : 'OFFLINE', age: edgarAge, color: edgarAge < 10 ? 'green' : edgarAge < 60  ? 'amber' : 'red' },
  })
}
