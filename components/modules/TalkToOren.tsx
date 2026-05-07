'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

type Action = {
  type: string
  text?: string
  category?: string
  kind?: string
  description?: string
  amount?: number
}

type Message = {
  role: 'user' | 'assistant'
  content: string
  actions?: Action[]
  executedActions?: string[]
}

export function TalkToOren() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id)
    })
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  async function executeActions(actions: Action[]): Promise<string[]> {
    if (!userId) return []
    const results: string[] = []
    for (const action of actions) {
      try {
        if (action.type === 'add_priority' && action.text) {
          await supabase.from('priorities').insert({ user_id: userId, text: action.text, done: false })
          results.push(`✓ Prio: ${action.text}`)
        } else if (action.type === 'add_goal' && action.text) {
          await supabase.from('goals').insert({ user_id: userId, text: action.text, done: false })
          results.push(`✓ Goal: ${action.text}`)
        } else if (action.type === 'add_thinkspace' && action.text) {
          await supabase.from('thinkspace').insert({ user_id: userId, type: action.category || 'idea', text: action.text })
          results.push(`✓ ThinkSpace (${action.category}): ${action.text}`)
        } else if (action.type === 'add_transaction' && action.description && action.amount) {
          await supabase.from('transactions').insert({
            user_id: userId,
            type: action.kind || 'expense',
            description: action.description,
            amount: action.amount,
            category: action.category || (action.kind === 'expense' ? 'private' : 'business'),
            date: new Date().toISOString().split('T')[0]
          })
          results.push(`✓ ${action.kind === 'income' ? 'Einnahme' : 'Ausgabe'}: ${action.description} (${action.amount}€)`)
        } else if (action.type === 'add_food_note' && action.text) {
          await supabase.from('food_notes').insert({ user_id: userId, text: action.text })
          results.push(`✓ Ernährung: ${action.text}`)
        } else if (action.type === 'add_brain_dump' && action.text) {
          await supabase.from('brain_dump').insert({ user_id: userId, text: action.text })
          results.push(`✓ Brain Dump: ${action.text}`)
        }
      } catch (err) {
        console.error('Action error:', err)
        results.push(`✗ Fehler bei ${action.type}`)
      }
    }
    return results
  }

  async function send() {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages.map(m => ({ role: m.role, content: m.content })) })
      })
      const data = await res.json()

      let executedActions: string[] = []
      if (data.actions && data.actions.length > 0) {
        executedActions = await executeActions(data.actions)
      }

      setMessages([...newMessages, {
        role: 'assistant',
        content: data.content,
        actions: data.actions,
        executedActions
      }])
    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', content: 'Fehler. Probier nochmal.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', padding: '20px', maxWidth: '480px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <a href="/dashboard" style={{ color: '#888', textDecoration: 'none', fontSize: '14px' }}>← Dashboard</a>
        <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Talk to Oren</h1>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', height: '80vh', border: '1px solid #2a2a2a', borderRadius: '12px' }}>
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {messages.length === 0 && (
            <div style={{ color: '#666', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>
              Sprich mit Oren. Sag ihm was du planst, ausgegeben hast oder dir merken willst.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              padding: '10px 14px',
              borderRadius: '12px',
              background: m.role === 'user' ? '#2a2a2a' : '#1a1a1a',
              border: '1px solid #333',
              fontSize: '14px',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap'
            }}>
              {m.content}
              {m.executedActions && m.executedActions.length > 0 && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #333', fontSize: '12px', color: '#7dd3a0', fontFamily: 'Space Mono, monospace' }}>
                  {m.executedActions.map((a, j) => <div key={j}>{a}</div>)}
                </div>
              )}
            </div>
          ))}
          {loading && <div style={{ color: '#666', fontSize: '13px', alignSelf: 'flex-start' }}>Oren denkt...</div>}
        </div>
        <div style={{ display: 'flex', gap: '8px', padding: '12px', borderTop: '1px solid #2a2a2a' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send() }}
            placeholder="Was planst du?"
            style={{
              flex: 1,
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: '8px',
              padding: '10px 12px',
              color: '#fff',
              fontSize: '14px',
              fontFamily: 'inherit'
            }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            style={{
              background: '#fff',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              padding: '0 18px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              opacity: !input.trim() ? 0.4 : 1
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
