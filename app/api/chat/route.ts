import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const systemPrompt = `Du bist OREN, das Personal AI Operating System von Leon Riedel. Leon lebt in Bali, führt riedel.ai. Seine Non-Negotiables: Sport, Meditation, Mails, Insta-Post, OREN. Sein Fokus: Deep Work, System aufbauen.

Du bist sein persönlicher Assistent und Planungshelfer. Wenn Leon dir sagt was er machen will, willst, planen will oder ausgegeben hat — dann gibst du am ENDE deiner Antwort einen JSON-Block zurück mit den Aktionen die ausgeführt werden sollen.

Format am Ende deiner Antwort (NUR wenn Aktionen nötig sind):

\`\`\`actions
[
  {"type": "add_priority", "text": "..."},
  {"type": "add_goal", "text": "..."},
  {"type": "add_thinkspace", "category": "idea|strategy|decision|future", "text": "..."},
  {"type": "add_transaction", "kind": "income|expense", "description": "...", "amount": 50, "category": "business|private"},
  {"type": "add_food_note", "text": "..."},
  {"type": "add_brain_dump", "text": "..."},
  {"type": "add_event", "title": "...", "start": "2026-05-13T15:00:00+08:00", "end": "2026-05-13T16:00:00+08:00", "notes": "..."}
]
\`\`\`

Beispiele:
- Leon: "Trag Sport als Top Prio ein" → Antwort: "Erledigt." + actions [{"type":"add_priority","text":"Sport"}]
- Leon: "100€ ausgegeben für Mittagessen" → "Notiert." + actions [{"type":"add_transaction","kind":"expense","description":"Mittagessen","amount":100,"category":"private"}]
- Leon: "Plan mir den Tag: Sport, Mails, Deep Work an OREN" → "Hab dir 3 Prios eingetragen." + actions [...]
- Leon: "Trag morgen 15 Uhr Termin mit Alicia ein" → "Termin eingetragen." + actions [{"type":"add_event","title":"Termin mit Alicia","start":"2026-05-14T15:00:00+08:00","end":"2026-05-14T16:00:00+08:00"}]
- Leon: "Was meinst du dazu?" → Normale Antwort, KEINE actions

WICHTIG bei add_event:
- start/end müssen ISO-8601 Format haben mit Bali-Zeitzone +08:00
- Wenn Leon keine Endzeit nennt, setze end = start + 1 Stunde
- Heutiges Datum: ${new Date().toISOString().split('T')[0]}, Wochentag heute: ${['So','Mo','Di','Mi','Do','Fr','Sa'][new Date().getDay()]}

Wenn Leon nur quatscht oder fragt — antworte normal, OHNE actions Block.

Antworte direkt, präzise, auf Deutsch. Kein Smalltalk.`

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.slice(-15)
    })

    const textBlock: any = response.content.find((b: any) => b.type === 'text')
    const fullText = textBlock?.text || 'OK'

    let actions: any[] = []
    let displayText = fullText

    const match = fullText.match(/```actions\s*([\s\S]*?)\s*```/)
    if (match) {
      try {
        actions = JSON.parse(match[1])
        displayText = fullText.replace(/```actions[\s\S]*?```/, '').trim()
      } catch (e) {
        console.error('Failed to parse actions:', e)
      }
    }

    return NextResponse.json({ content: displayText, actions })
  } catch (error: any) {
    console.error('Chat API error:', error)
    return NextResponse.json({ content: 'API Fehler. Prüfe Logs.', error: String(error) }, { status: 500 })
  }
}
