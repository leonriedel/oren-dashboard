'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

interface Props { user: User; onBack: () => void }

export default function TalkToOren({ user, onBack }: Props) {
  const supabase = createClient()
  const [messages, setMessages] = useState<any[]>([{ role:'assistant', content:'Hey Leon! Ich bin OREN. Sag mir was zu tun ist — Prios, Notizen, Ausgaben, Ideen. Ich trag es direkt ein.' }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  async function send() {
    if (!input.trim() || loading) return
    const userMsg = { role: 'user', content: input.trim() }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)
    setInput('')
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMsgs,
          userId: user.id,
          accessToken: session?.access_token
        })
      })
      const data = await res.json()
      const reply = { role: 'assistant', content: data.content || 'Fehler.', actions: data.actions || [] }
      setMessages(p => [...p, reply])
    } catch {
      setMessages(p => [...p, { role: 'assistant', content: 'Verbindungsfehler.' }])
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', flexDirection:'column' }}>
      <div style={{ display:'flex', alignItems:'center', gap:14, padding:'20px 20px 16px', borderBottom:'1px solid var(--border)', background:'var(--bg)' }}>
        <button onClick={onBack} style={{ width:34, height:34, borderRadius:'50%', background:'var(--card)', border:'1px solid var(--border)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted2)', fontSize:18 }}>‹</button>
        <div style={{ width:40, height:40, borderRadius:11, background:'linear-gradient(135deg, #006688, #00aadd)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🎙️</div>
        <div>
          <div style={{ fontFamily:'var(--mono)', fontSize:15, fontWeight:700, letterSpacing:2, color:'var(--cyan)' }}>TALK TO OREN</div>
          <div style={{ fontSize:10, letterSpacing:3, color:'var(--muted)' }}>AI · ASSISTANT</div>
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:12 }}>
        {messages.map((m, i) => (
          <div key={i}>
            <div style={{ display:'flex', justifyContent: m.role==='user' ? 'flex-end' : 'flex-start' }}>
              <div style={{ maxWidth:'85%', padding:'12px 16px', borderRadius:16, fontSize:14, lineHeight:1.6, background: m.role==='user' ? 'var(--cyan2)' : 'var(--card2)', border: m.role==='user' ? 'none' : '1px solid var(--border)', borderBottomRightRadius: m.role==='user' ? 4 : 16, borderBottomLeftRadius: m.role==='user' ? 16 : 4, color: m.role==='user' ? 'white' : 'var(--text)', whiteSpace:'pre-wrap' }}>
                {m.content}
              </div>
            </div>
            {m.actions && m.actions.length > 0 && (
              <div style={{ marginTop:6, paddingLeft:8 }}>
                {m.actions.map((a: string, j: number) => (
                  <div key={j} style={{ fontFamily:'var(--mono)', fontSize:11, color:'var(--green)', padding:'3px 0' }}>{a}</div>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ display:'flex', justifyContent:'flex-start' }}>
            <div style={{ padding:'14px 16px', borderRadius:16, background:'var(--card2)', border:'1px solid var(--border)', display:'flex', gap:4, alignItems:'center' }}>
              {[0,0.2,0.4].map((d,i) => <span key={i} style={{ width:6, height:6, borderRadius:'50%', background:'var(--muted)', display:'inline-block', animation:`typing 1.2s ease-in-out ${d}s infinite` }} />)}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', display:'flex', gap:10, background:'var(--bg)' }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==='Enter'&&send()} placeholder="Sag mir was zu tun ist..." style={{ flex:1, background:'var(--card)', border:'1px solid var(--border)', borderRadius:24, padding:'12px 18px', color:'var(--text)', fontSize:14, outline:'none' }} />
        <button onClick={send} disabled={loading} style={{ width:44, height:44, borderRadius:'50%', background:'var(--cyan2)', border:'none', cursor:'pointer', color:'white', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' }}>↑</button>
      </div>

      <style>{`@keyframes typing { 0%,60%,100%{transform:translateY(0);opacity:0.4} 30%{transform:translateY(-6px);opacity:1} }`}</style>
    </div>
  )
}
