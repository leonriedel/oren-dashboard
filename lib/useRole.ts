'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export type Role = 'admin' | 'viewer' | null

export function useRole(): { role: Role; name: string | null; loading: boolean } {
  const [role, setRole] = useState<Role>(null)
  const [name, setName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      const r = (user.app_metadata?.role || user.user_metadata?.role || 'viewer') as Role
      const n = user.user_metadata?.name || user.email?.split('@')[0] || null
      setRole(r)
      setName(n)
      setLoading(false)
    })
  }, [])

  return { role, name, loading }
}
