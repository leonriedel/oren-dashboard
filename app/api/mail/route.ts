import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ImapFlow } from 'imapflow'

// MAIL · newest messages from Strato via IMAP (admin-only)
// Env (Vercel): STRATO_IMAP_USER, STRATO_IMAP_PASS, optional STRATO_IMAP_HOST
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!
const HOST = process.env.STRATO_IMAP_HOST || 'imap.strato.de'
const USER = process.env.STRATO_IMAP_USER || ''
const PASS = process.env.STRATO_IMAP_PASS || ''

let cache: { ts: number; data: any } = { ts: 0, data: null }

async function isAdmin(req: Request) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return false
  const supa = createClient(SUPA_URL, SUPA_KEY)
  const { data } = await supa.auth.getUser(token)
  return data?.user?.user_metadata?.role === 'admin'
}

export async function GET(req: Request) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  if (!USER || !PASS) {
    return NextResponse.json({ mails: [], error: 'STRATO_IMAP_USER / STRATO_IMAP_PASS not set' }, { status: 200 })
  }
  if (cache.data && Date.now() - cache.ts < 60_000) {
    return NextResponse.json(cache.data)
  }

  const client = new ImapFlow({
    host: HOST, port: 993, secure: true,
    auth: { user: USER, pass: PASS },
    logger: false,
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    const mails: any[] = []
    let unreadCount = 0
    try {
      const mb: any = client.mailbox
      const total = mb?.exists || 0
      if (total > 0) {
        const from = Math.max(1, total - 7)
        for await (const msg of client.fetch(`${from}:*`, { envelope: true, flags: true, internalDate: true })) {
          const env: any = msg.envelope || {}
          const sender = env.from?.[0] || {}
          const unread = !msg.flags?.has('\\Seen')
          mails.push({
            uid: msg.uid,
            from: sender.name || sender.address || 'Unknown',
            address: sender.address || '',
            subject: env.subject || '(no subject)',
            date: (env.date || msg.internalDate || new Date()).toISOString(),
            unread,
            messageId: env.messageId || '',
          })
        }
      }
      const status: any = await client.status('INBOX', { unseen: true })
      unreadCount = status?.unseen || 0
    } finally {
      lock.release()
    }
    await client.logout()

    mails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    const data = { mails: mails.slice(0, 6), unread: unreadCount, updatedAt: new Date().toISOString() }
    cache = { ts: Date.now(), data }
    return NextResponse.json(data)
  } catch (e) {
    try { await client.logout() } catch { /* noop */ }
    return NextResponse.json({ mails: [], error: String(e) }, { status: 200 })
  }
}
