import { NextRequest, NextResponse } from 'next/server'

const BOT_TOKEN = '8751181916:AAEdnCMTjrADiP4Xosp0h1a0CaA-ppdMMq0'
const CHAT_ID = '7891571339'

export async function POST(req: NextRequest) {
  const { messages } = await req.json()
  const lastMessage = messages[messages.length - 1]?.content
  if (!lastMessage) return NextResponse.json({ content: 'Keine Nachricht.' })

  // Send to OREN via Telegram
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text: lastMessage }),
  })

  // Wait for OREN to respond (poll for 15 seconds)
  let reply = 'OREN hat die Nachricht empfangen. Antwort folgt auf Telegram.'
  const offset_res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?limit=1&allowed_updates=["message"]`)
  const offset_data = await offset_res.json()
  const lastUpdateId = offset_data.result?.slice(-1)[0]?.update_id || 0

  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1500))
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&limit=5`)
    const data = await res.json()
    const botReply = data.result?.find((u: any) => u.message?.from?.is_bot && u.message?.chat?.id === parseInt(CHAT_ID))
    if (botReply) {
      reply = botReply.message.text
      break
    }
  }

  return NextResponse.json({ content: reply })
}
