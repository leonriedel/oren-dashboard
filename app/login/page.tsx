'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('leon@riedel.ai')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'login'|'magic'>('login')
  const [sent, setSent] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    if (mode === 'magic') {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/dashboard` } })
      if (error) setError(error.message)
      else setSent(true)
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else router.replace('/dashboard')
    }
    setLoading(false)
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.avatar} />
        <h1 style={styles.title}>OREN</h1>
        <p style={styles.sub}>PERSONAL AI OPERATING SYSTEM</p>

        {sent ? (
          <div style={styles.card}>
            <p style={{ color:'var(--cyan)', fontFamily:'var(--mono)', fontSize:13, textAlign:'center', lineHeight:1.6 }}>
              ✓ Magic Link gesendet<br/>
              <span style={{ color:'var(--muted2)', fontSize:12 }}>Prüfe deine Email: {email}</span>
            </p>
          </div>
        ) : (
          <form onSubmit={handleLogin} style={styles.card}>
            <div style={styles.tabs}>
              <button type="button" onClick={() => setMode('login')} style={{ ...styles.tab, ...(mode==='login' ? styles.tabActive : {}) }}>PASSWORD</button>
              <button type="button" onClick={() => setMode('magic')} style={{ ...styles.tab, ...(mode==='magic' ? styles.tabActive : {}) }}>MAGIC LINK</button>
            </div>
            <input
              style={styles.input}
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            {mode === 'login' && (
              <input
                style={styles.input}
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            )}
            {error && <p style={{ color:'var(--red)', fontSize:12, fontFamily:'var(--mono)', marginBottom:8 }}>{error}</p>}
            <button type="submit" style={styles.btn} disabled={loading}>
              {loading ? '...' : mode === 'magic' ? 'SEND MAGIC LINK' : 'LOGIN'}
            </button>
          </form>
        )}

        <p style={{ color:'var(--muted)', fontSize:11, fontFamily:'var(--mono)', marginTop:24, letterSpacing:1 }}>
          riedel.ai · secured by supabase
        </p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(0,212,255,0.07) 0%, transparent 70%)',
    padding: 20,
  },
  container: { display:'flex', flexDirection:'column', alignItems:'center', width:'100%', maxWidth:360 },
  avatar: {
    width:64, height:64, borderRadius:'50%',
    background:'radial-gradient(circle at 35% 35%, #00d4ff, #0044aa)',
    boxShadow:'0 0 40px rgba(0,212,255,0.35), 0 0 80px rgba(0,212,255,0.1)',
    marginBottom:16,
  },
  title: { fontFamily:'var(--mono)', fontSize:28, fontWeight:700, color:'var(--cyan)', letterSpacing:4, marginBottom:6 },
  sub: { fontFamily:'var(--mono)', fontSize:10, letterSpacing:5, color:'var(--muted)', marginBottom:32 },
  card: {
    width:'100%', background:'var(--card)', border:'1px solid var(--border)',
    borderRadius:16, padding:24, display:'flex', flexDirection:'column', gap:10,
  },
  tabs: { display:'flex', gap:6, marginBottom:4 },
  tab: {
    flex:1, padding:'8px 0', borderRadius:8, border:'1px solid var(--border)',
    background:'transparent', color:'var(--muted2)', fontFamily:'var(--mono)',
    fontSize:10, letterSpacing:1, cursor:'pointer', transition:'all 0.2s',
  },
  tabActive: { background:'rgba(0,212,255,0.1)', borderColor:'rgba(0,212,255,0.3)', color:'var(--cyan)' },
  input: {
    background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:10,
    padding:'12px 14px', color:'var(--text)', fontSize:14, outline:'none', width:'100%',
  },
  btn: {
    background:'var(--cyan2)', border:'none', borderRadius:10, padding:'13px',
    color:'white', fontFamily:'var(--mono)', fontSize:12, letterSpacing:2,
    cursor:'pointer', marginTop:4, transition:'all 0.2s',
  },
}
