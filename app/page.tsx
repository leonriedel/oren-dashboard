'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function Home() {
  const router = useRouter()
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/dashboard')
      else router.replace('/login')
    })
  }, [router])
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg)' }}>
      <div style={{ width:40, height:40, borderRadius:'50%', background:'radial-gradient(circle at 35% 35%, #00d4ff, #0044aa)', animation:'pulse 1.5s ease-in-out infinite' }} />
    </div>
  )
}
