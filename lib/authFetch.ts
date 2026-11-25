'use client'
import { createClient } from '@/lib/supabase'

/** fetch() that sends the signed-in user's Supabase access token (needed for admin-only API routes) */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await createClient().auth.getSession()
  const token = data?.session?.access_token || ''
  const headers = new Headers(init.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}
