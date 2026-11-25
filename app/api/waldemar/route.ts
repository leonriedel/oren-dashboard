import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { adminOnly } from '@/lib/apiAuth'
import { waldemarSummary } from '@/lib/waldemar'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const denied = await adminOnly(req); if (denied) return denied
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!)
  try {
    return NextResponse.json(await waldemarSummary(supa))
  } catch (e) {
    return NextResponse.json({ available: false, error: String(e) })
  }
}
