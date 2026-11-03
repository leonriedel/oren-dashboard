import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return htmlPage(`<h1 style="color:#ff6b6b">OAuth Error</h1><pre>${escape(error)}</pre>`)
  }

  if (!code) {
    return htmlPage('<h1>No code received</h1>')
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return htmlPage('<h1 style="color:#ff6b6b">Server not configured</h1><p>GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing in Vercel env.</p>')
  }

  const redirectUri = `${req.nextUrl.origin}/api/auth/google/callback`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  const data = await tokenRes.json()

  if (!tokenRes.ok) {
    return htmlPage(`<h1 style="color:#ff6b6b">Token exchange failed</h1><pre>${escape(JSON.stringify(data, null, 2))}</pre>`)
  }

  const refreshToken = data.refresh_token
  if (!refreshToken) {
    return htmlPage(`<h1 style="color:#fbbf24">No refresh_token returned</h1>
      <p>Google only returns refresh_token on first consent. Revoke app access at
      <a href="https://myaccount.google.com/permissions" style="color:#80c0ff">myaccount.google.com/permissions</a>
      and try again.</p>
      <pre>${escape(JSON.stringify(data, null, 2))}</pre>`)
  }

  return htmlPage(`
    <h1 style="color:#34d399">✓ Auth Success</h1>
    <p>Copy this refresh token and add it to Vercel as <code>GOOGLE_REFRESH_TOKEN</code>, then redeploy.</p>
    <div style="margin:20px 0;padding:20px;background:#0a1422;border:1px solid #80c0ff33;border-radius:8px;font-family:monospace;word-break:break-all;color:#80c0ff;font-size:14px">
      ${escape(refreshToken)}
    </div>
    <p style="color:#5a80b5;font-size:12px">After adding the env var, click 'Redeploy' in Vercel (uncheck 'Use existing Build Cache').</p>
  `)
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!))
}

function htmlPage(body: string) {
  return new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><title>Google OAuth</title></head>
<body style="background:#000;color:#d0e5ff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:40px;max-width:720px;margin:0 auto">
${body}
</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
