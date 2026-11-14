'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Mail = {
  uid: number
  from: string
  address: string
  subject: string
  date: string
  unread: boolean
  messageId: string
}

// message://%3c<id>%3e opens the exact mail in Apple Mail; message:// opens the app
const mailLink = (id: string) => {
  if (!id) return 'message://'
  const clean = id.replace(/^</, '').replace(/>$/, '')
  return `message://%3c${encodeURIComponent(clean)}%3e`
}

function timeLabel(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export default function MailPanel() {
  const [mails, setMails] = useState<Mail[]>([])
  const [unread, setUnread] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supa = createClient()
    const load = async () => {
      try {
        const { data } = await supa.auth.getSession()
        const token = data?.session?.access_token
        const r = await fetch('/api/mail', {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const j = await r.json()
        if (j.error) setError(j.error); else setError(null)
        setMails(j.mails || [])
        setUnread(j.unread || 0)
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 2 * 60 * 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{
      background: 'linear-gradient(180deg, rgba(8,20,48,0.6) 0%, rgba(8,20,48,0.4) 100%)',
      border: '1px solid rgba(80,180,255,0.16)',
      borderRadius: 4, padding: 12,
      backdropFilter: 'blur(10px)',
      position: 'relative',
      boxShadow: 'inset 0 1px 0 rgba(120,200,255,0.06)',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 1,
        background: 'linear-gradient(90deg, transparent, rgba(120,200,255,0.55), transparent)',
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, letterSpacing: 2, color: '#80c0ff', fontWeight: 700 }}>
          ✉ MAIL
        </div>
        <a href="message://" style={{
          fontFamily: 'Space Mono, monospace', fontSize: 8.5, letterSpacing: 1.5,
          color: unread ? '#a0e0ff' : 'rgba(120,180,230,0.6)', padding: '1px 6px',
          border: `1px solid ${unread ? 'rgba(120,200,255,0.45)' : 'rgba(80,180,255,0.18)'}`,
          borderRadius: 2, textDecoration: 'none',
        }}>
          {unread ? `${unread} NEW · OPEN ↗` : 'OPEN ↗'}
        </a>
      </div>

      {loading && (
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: 'rgba(120,180,230,0.45)', padding: '6px 0' }}>
          syncing inbox…
        </div>
      )}

      {!loading && error && (
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 9.5, color: 'rgba(255,200,120,0.75)', lineHeight: 1.5 }}>
          {error.includes('not set') ? 'Setup: STRATO_IMAP_USER + STRATO_IMAP_PASS in Vercel env' : 'Inbox nicht erreichbar'}
        </div>
      )}

      {!loading && !error && mails.length === 0 && (
        <div style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: 'rgba(120,180,230,0.45)' }}>
          inbox zero ✓
        </div>
      )}

      {mails.map(m => (
        <a
          key={m.uid}
          href={mailLink(m.messageId)}
          style={{
            display: 'block', textDecoration: 'none',
            padding: '7px 0',
            borderTop: '1px solid rgba(80,180,255,0.06)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span style={{
              display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
              fontFamily: 'Space Mono, monospace', fontSize: 10,
              color: m.unread ? '#d8ecff' : 'rgba(180,210,240,0.6)',
              fontWeight: m.unread ? 700 : 400,
            }}>
              {m.unread && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#5db8ff', boxShadow: '0 0 6px #5db8ff', flexShrink: 0 }} />}
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.from}</span>
            </span>
            <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, color: 'rgba(120,180,230,0.5)', flexShrink: 0 }}>
              {timeLabel(m.date)}
            </span>
          </div>
          <div style={{
            fontSize: 11, marginTop: 2,
            color: m.unread ? 'rgba(200,225,250,0.85)' : 'rgba(160,190,225,0.5)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            paddingLeft: m.unread ? 11 : 0,
          }}>
            {m.subject}
          </div>
        </a>
      ))}
    </div>
  )
}
