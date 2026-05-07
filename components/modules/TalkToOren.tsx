'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../lib/supabase'

const supabase = createClient()

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

type SpeechRecognitionEvent = any

export default function TalkToOren(props: any) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [orbState, setOrbState] = useState<'idle' | 'thinking' | 'speaking' | 'listening'>('idle')
  const [userId, setUserId] = useState<string | null>(null)
  const [showChat, setShowChat] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: any) => {
      if (data.user) setUserId(data.user.id)
    })
  }, [])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Particle animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = canvas.width = window.innerWidth
    let h = canvas.height = window.innerHeight
    const handleResize = () => {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)

    const cx = () => w / 2
    const cy = () => h / 2

    type Particle = {
      angle: number
      radius: number
      speed: number
      size: number
      opacity: number
      ringIndex: number
    }

    const particles: Particle[] = []
    const numParticles = 220
    for (let i = 0; i < numParticles; i++) {
      const ringIndex = Math.floor(Math.random() * 4)
      const baseRadius = 90 + ringIndex * 35 + Math.random() * 25
      particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: baseRadius,
        speed: (0.0008 + Math.random() * 0.0015) * (Math.random() > 0.5 ? 1 : -1),
        size: Math.random() * 1.8 + 0.5,
        opacity: Math.random() * 0.6 + 0.2,
        ringIndex
      })
    }

    let animId: number
    let pulse = 0

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      pulse += 0.02

      const stateMultiplier = orbState === 'thinking' ? 1.4 : orbState === 'speaking' ? 1.6 : orbState === 'listening' ? 1.8 : 1
      const intensityBoost = orbState !== 'idle' ? 1 : 0

      // Central orb glow
      const orbRadius = 50 + Math.sin(pulse * 1.2) * 4 * stateMultiplier
      const gradient = ctx.createRadialGradient(cx(), cy(), 0, cx(), cy(), orbRadius * 3.5)
      gradient.addColorStop(0, `rgba(120, 180, 255, ${0.45 + intensityBoost * 0.2})`)
      gradient.addColorStop(0.3, `rgba(80, 140, 240, ${0.25 + intensityBoost * 0.15})`)
      gradient.addColorStop(0.6, 'rgba(60, 100, 200, 0.08)')
      gradient.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(cx(), cy(), orbRadius * 3.5, 0, Math.PI * 2)
      ctx.fill()

      // Inner core
      const coreGrad = ctx.createRadialGradient(cx(), cy(), 0, cx(), cy(), orbRadius)
      coreGrad.addColorStop(0, `rgba(200, 230, 255, ${0.9 + intensityBoost * 0.1})`)
      coreGrad.addColorStop(0.5, `rgba(100, 160, 255, ${0.6 + intensityBoost * 0.2})`)
      coreGrad.addColorStop(1, 'rgba(40, 80, 180, 0.2)')
      ctx.fillStyle = coreGrad
      ctx.beginPath()
      ctx.arc(cx(), cy(), orbRadius, 0, Math.PI * 2)
      ctx.fill()

      // Particles
      for (const p of particles) {
        p.angle += p.speed * stateMultiplier
        const wobble = Math.sin(pulse * 0.5 + p.ringIndex) * 3
        const r = p.radius + wobble
        const x = cx() + Math.cos(p.angle) * r
        const y = cy() + Math.sin(p.angle) * r * 0.6 // ellipse

        const alpha = p.opacity * (0.7 + Math.sin(pulse + p.angle) * 0.3) * (1 + intensityBoost * 0.3)
        ctx.fillStyle = `rgba(150, 200, 255, ${Math.min(1, alpha)})`
        ctx.beginPath()
        ctx.arc(x, y, p.size * (1 + intensityBoost * 0.4), 0, Math.PI * 2)
        ctx.fill()

        // glow trail for some particles
        if (p.size > 1.5) {
          ctx.fillStyle = `rgba(180, 220, 255, ${alpha * 0.15})`
          ctx.beginPath()
          ctx.arc(x, y, p.size * 4, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      animId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
    }
  }, [orbState])

  // Voice recognition setup
  useEffect(() => {
    if (typeof window === 'undefined') return
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.lang = 'de-DE'
    recognition.interimResults = false
    recognition.continuous = false

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript
      setInput(transcript)
      setListening(false)
      setOrbState('idle')
      setTimeout(() => sendMessage(transcript), 100)
    }

    recognition.onerror = () => {
      setListening(false)
      setOrbState('idle')
    }

    recognition.onend = () => {
      setListening(false)
      if (orbState === 'listening') setOrbState('idle')
    }

    recognitionRef.current = recognition
  }, [])

  function toggleListen() {
    if (!recognitionRef.current) {
      alert('Voice nicht unterstützt im Browser. Nimm Chrome/Safari.')
      return
    }
    if (listening) {
      recognitionRef.current.stop()
      setListening(false)
      setOrbState('idle')
    } else {
      try {
        recognitionRef.current.start()
        setListening(true)
        setOrbState('listening')
      } catch (e) {
        console.error(e)
      }
    }
  }

  function speakResponse(text: string) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const cleanText = text.replace(/```[\s\S]*?```/g, '').replace(/[*_#]/g, '').trim()
    if (!cleanText) return
    const utterance = new SpeechSynthesisUtterance(cleanText)
    utterance.lang = 'de-DE'
    utterance.rate = 1.05
    utterance.pitch = 0.95
    utterance.onstart = () => setOrbState('speaking')
    utterance.onend = () => setOrbState('idle')
    window.speechSynthesis.speak(utterance)
  }

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
        results.push(`✗ Fehler bei ${action.type}`)
      }
    }
    return results
  }

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return
    const userMsg: Message = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setOrbState('thinking')
    setShowChat(true)

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

      const newMsg: Message = {
        role: 'assistant',
        content: data.content,
        actions: data.actions,
        executedActions
      }
      setMessages([...newMessages, newMsg])
      speakResponse(data.content)
    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', content: 'Fehler. Probier nochmal.' }])
      setOrbState('idle')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at center, #0a1530 0%, #050810 70%, #000 100%)',
      color: '#e0e8ff',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'DM Sans, system-ui, sans-serif'
    }}>
      <canvas
        ref={canvasRef}
        style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}
      />

      {/* Top bar */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px 24px'
      }}>
        <div style={{ fontSize: '14px', letterSpacing: '0.3em', color: '#7a9fdc', fontFamily: 'Space Mono, monospace' }}>
          OREN
        </div>
        <button
          onClick={() => props.onBack && props.onBack()}
          style={{
            background: 'rgba(120,180,255,0.08)',
            border: '1px solid rgba(120,180,255,0.2)',
            color: '#a0c0ff',
            padding: '8px 14px',
            borderRadius: '999px',
            fontSize: '12px',
            cursor: 'pointer',
            backdropFilter: 'blur(12px)',
            letterSpacing: '0.1em'
          }}
        >
          MODULES
        </button>
      </div>

      {/* Center spacer for orb */}
      <div style={{
        position: 'relative',
        zIndex: 2,
        height: showChat ? '40vh' : '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'height 0.5s ease'
      }}>
        <div style={{
          marginTop: '40px',
          fontSize: '12px',
          letterSpacing: '0.4em',
          color: '#5a7ab5',
          fontFamily: 'Space Mono, monospace',
          textTransform: 'uppercase'
        }}>
          {orbState === 'thinking' ? 'Processing' : orbState === 'speaking' ? 'Speaking' : orbState === 'listening' ? 'Listening' : 'Standby'}
        </div>
      </div>

      {/* Chat overlay */}
      {showChat && messages.length > 0 && (
        <div style={{
          position: 'relative',
          zIndex: 2,
          maxWidth: '720px',
          margin: '0 auto',
          padding: '0 20px 200px'
        }}>
          <div ref={scrollRef} style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            maxHeight: '40vh',
            overflowY: 'auto',
            padding: '8px'
          }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                padding: '12px 16px',
                borderRadius: '16px',
                background: m.role === 'user'
                  ? 'rgba(120,180,255,0.15)'
                  : 'rgba(20,30,60,0.6)',
                border: m.role === 'user'
                  ? '1px solid rgba(120,180,255,0.3)'
                  : '1px solid rgba(120,180,255,0.15)',
                backdropFilter: 'blur(20px)',
                fontSize: '14px',
                lineHeight: 1.55,
                whiteSpace: 'pre-wrap',
                color: '#dde7ff'
              }}>
                {m.content}
                {m.executedActions && m.executedActions.length > 0 && (
                  <div style={{
                    marginTop: '10px',
                    paddingTop: '10px',
                    borderTop: '1px solid rgba(120,180,255,0.2)',
                    fontSize: '12px',
                    color: '#7dd3a0',
                    fontFamily: 'Space Mono, monospace'
                  }}>
                    {m.executedActions.map((a, j) => <div key={j}>{a}</div>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Input bar at bottom */}
      <div style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 3,
        width: 'calc(100% - 40px)',
        maxWidth: '600px',
        display: 'flex',
        gap: '10px',
        padding: '10px',
        background: 'rgba(15,25,50,0.7)',
        border: '1px solid rgba(120,180,255,0.2)',
        borderRadius: '999px',
        backdropFilter: 'blur(24px)',
        boxShadow: '0 8px 40px rgba(0,30,80,0.5)'
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendMessage(input) }}
          placeholder={listening ? 'Listening...' : 'Sprich mit Oren...'}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#e0e8ff',
            fontSize: '15px',
            padding: '8px 14px',
            fontFamily: 'inherit'
          }}
        />
        <button
          onClick={toggleListen}
          style={{
            background: listening ? 'rgba(255,100,100,0.25)' : 'rgba(120,180,255,0.15)',
            border: listening ? '1px solid rgba(255,100,100,0.5)' : '1px solid rgba(120,180,255,0.3)',
            color: listening ? '#ff8080' : '#a0c0ff',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s'
          }}
          aria-label="Voice"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="2" width="6" height="12" rx="3"/>
            <path d="M5 10v2a7 7 0 0014 0v-2M12 19v3"/>
          </svg>
        </button>
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          style={{
            background: loading || !input.trim() ? 'rgba(120,180,255,0.1)' : 'linear-gradient(135deg, #6090ff, #a060ff)',
            border: 'none',
            color: '#fff',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !input.trim() ? 0.4 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12h14M13 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
