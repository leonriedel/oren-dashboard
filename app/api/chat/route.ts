import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const tools: Anthropic.Tool[] = [
  {
    name: 'add_priority',
    description: 'Fügt eine neue Top Priorität in SecondBrain hinzu',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Die Aufgabe' } },
      required: ['text']
    }
  },
  {
    name: 'add_goal',
    description: 'Fügt ein neues Weekly Goal hinzu',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Das Wochenziel' } },
      required: ['text']
    }
  },
  {
    name: 'add_thinkspace_entry',
    description: 'Speichert eine Idee, Strategie, Entscheidung oder Future Plan in ThinkSpace',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['idea','strategy','decision','future'] },
        text: { type: 'string' }
      },
      required: ['type','text']
    }
  },
  {
    name: 'add_transaction',
    description: 'Fügt eine Einnahme oder Ausgabe in Finances hinzu',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['income','expense'] },
        description: { type: 'string' },
        amount: { type: 'number' },
        category: { type: 'string', enum: ['business','private'] }
      },
      required: ['type','description','amount']
    }
  },
  {
    name: 'add_food_note',
    description: 'Fügt eine Ernährungsnotiz hinzu',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text']
    }
  },
  {
    name: 'add_brain_dump',
    description: 'Speichert eine schnelle Idee/Notiz in Social Media Brain Dump',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text']
    }
  }
]

export async function POST(req: NextRequest) {
  try {
    const { messages, userId, accessToken } = await req.json()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    )

    const systemPrompt = `Du bist OREN, das Personal AI Operating System von Leon Riedel. Leon lebt in Bali, führt riedel.ai. Seine Non-Negotiables: Sport, Meditation, Mails, Insta-Post, OREN. Sein Fokus: Deep Work, System aufbauen.

Du bist sein persönlicher Assistent. Wenn Leon dir sagt "trag X als Prio ein" oder "ich hab 50€ ausgegeben" oder "merk dir die Idee Y" — dann nutze die Tools und führe es aus. Bestätige kurz was du gemacht hast.

Antworte direkt, präzise, auf Deutsch. Kein Smalltalk.`

    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages: messages.slice(-15)
    })

    const actions: string[] = []
    let conversationMessages = [...messages.slice(-15)]

    while (response.stop_reason === 'tool_use') {
      const toolUses = response.content.filter((b: any) => b.type === 'tool_use')
      const toolResults: any[] = []

      for (const tool of toolUses as any[]) {
        let result = 'OK'
        try {
          const input = tool.input
          if (tool.name === 'add_priority') {
            await supabase.from('priorities').insert({ user_id: userId, text: input.text, done: false })
            actions.push(`✓ Prio hinzugefügt: ${input.text}`)
          } else if (tool.name === 'add_goal') {
            await supabase.from('goals').insert({ user_id: userId, text: input.text, done: false })
            actions.push(`✓ Goal: ${input.text}`)
          } else if (tool.name === 'add_thinkspace_entry') {
            await supabase.from('thinkspace').insert({ user_id: userId, type: input.type, text: input.text })
            actions.push(`✓ ThinkSpace (${input.type}): ${input.text}`)
          } else if (tool.name === 'add_transaction') {
            await supabase.from('transactions').insert({
              user_id: userId,
              type: input.type,
              description: input.description,
              amount: input.amount,
              category: input.category || (input.type === 'expense' ? 'expense' : 'business'),
              date: new Date().toISOString().split('T')[0]
            })
            actions.push(`✓ ${input.type === 'income' ? 'Einnahme' : 'Ausgabe'}: ${input.description} (${input.amount}€)`)
          } else if (tool.name === 'add_food_note') {
            await supabase.from('food_notes').insert({ user_id: userId, text: input.text })
            actions.push(`✓ Ernährung: ${input.text}`)
          } else if (tool.name === 'add_brain_dump') {
            await supabase.from('brain_dump').insert({ user_id: userId, text: input.text })
            actions.push(`✓ Brain Dump: ${input.text}`)
          }
        } catch (err) {
          console.error('Tool error:', err)
          result = 'Fehler beim Speichern'
        }
        toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: result })
      }

      conversationMessages = [
        ...conversationMessages,
        { role: 'assistant', content: response.content },
        { role: 'user', content: toolResults }
      ]

      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        tools,
        messages: conversationMessages
      })
    }

    const textBlock = response.content.find((b: any) => b.type === 'text') as any
    const text = textBlock?.text || (actions.length ? actions.join('\n') : 'OK')
    return NextResponse.json({ content: text, actions })
  } catch (error: any) {
    console.error('Chat API error:', error)
    return NextResponse.json({ content: 'API Fehler. Prüfe Logs.', error: String(error) }, { status: 500 })
  }
}
