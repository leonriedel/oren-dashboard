import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `Du bist OREN, das Personal AI Operating System von Leon Riedel (leon@riedel.ai). Du bist präzise, direkt und hilfreich. Leon lebt in Bali und führt Projekte wie riedel.ai. Seine Non-Negotiables sind: Sport, Meditation, Mails, Insta-Post, tägliches OREN-Check-in. Sein Fokus: Deep Work, System aufbauen, Prozesse automatisieren. Antworte kurz, präzise und auf Deutsch. Kein Smalltalk.`,
      messages: messages.filter((m: any) => m.role !== 'system').slice(-20),
    })
    return NextResponse.json({ content: response.content[0].type === 'text' ? response.content[0].text : '' })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json({ content: 'API Fehler. Prüfe deinen Anthropic API Key.' }, { status: 500 })
  }
}
