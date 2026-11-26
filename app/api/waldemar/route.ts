import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { adminOnly } from '@/lib/apiAuth'
import { waldemarSummary } from '@/lib/waldemar'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const denied = await adminOnly(req); if (denied) return denied
  // read with the signed-in admin's own token → works with RLS policies, independent of which server key Vercel has
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '')
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  try {
    return NextResponse.json(await waldemarSummary(supa))
  } catch (e) {
    return NextResponse.json({ available: false, error: String(e) })
  }
}
