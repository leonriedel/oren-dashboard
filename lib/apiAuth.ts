import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || ''

/** true if the request carries a Supabase access token of a user with role "admin" */
export async function isAdminRequest(req: Request): Promise<boolean> {
  const h = req.headers.get('authorization') || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token || !SUPA_KEY) return false
  try {
    const { data } = await createClient(SUPA_URL, SUPA_KEY).auth.getUser(token)
    const u = data?.user
    return !!u && (u.app_metadata?.role || u.user_metadata?.role) === 'admin'
  } catch {
    return false
  }
}

/** returns a 401 response for non-admins, or null when the caller is an admin */
export async function adminOnly(req: Request): Promise<NextResponse | null> {
  return (await isAdminRequest(req)) ? null : NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}
