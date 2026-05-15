import { NextRequest, NextResponse } from 'next/server'

const NOTION_TOKEN = process.env.NOTION_TOKEN
const DATABASE_ID = '0db5af1e64c54d418d3c832e87f26097'

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0]

    const res = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: {
          property: 'Datum',
          date: { on_or_after: today }
        },
        sorts: [{ property: 'Datum', direction: 'ascending' }],
        page_size: 20,
      })
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Notion API error:', err)
      return NextResponse.json({ events: [], error: err }, { status: 200 })
    }

    const data = await res.json()

    const events = data.results.map((page: any) => {
      const props = page.properties

      const titleProp = Object.values(props).find((p: any) => p.type === 'title') as any
      const title = titleProp?.title?.[0]?.plain_text || 'Kein Titel'

      const dateProp = Object.values(props).find((p: any) => p.type === 'date') as any
      const date = dateProp?.date?.start || null
      const dateEnd = dateProp?.date?.end || null

      const timeStr = date && date.includes("T") ? date.split("T")[1].slice(0,5) : ""; return { id: page.id, title, date, dateEnd, time: timeStr }
    }).filter((e: any) => e.date)

    return NextResponse.json({ events })
  } catch (error) {
    console.error('Calendar API error:', error)
    return NextResponse.json({ events: [], error: String(error) }, { status: 200 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title, start, end, notes } = await req.json()

    if (!title || !start) {
      return NextResponse.json({ ok: false, error: 'title und start sind Pflicht' }, { status: 400 })
    }

    const properties: any = {
      'Titel': {
        title: [{ text: { content: title } }]
      },
      'Datum': {
        date: {
          start: start,
          ...(end ? { end: end } : {})
        }
      }
    }

    if (notes) {
      properties['Notizen'] = {
        rich_text: [{ text: { content: notes } }]
      }
    }

    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: DATABASE_ID },
        properties
      })
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Notion POST error:', err)
      return NextResponse.json({ ok: false, error: err }, { status: 200 })
    }

    const data = await res.json()
    return NextResponse.json({ ok: true, id: data.id, title, start, end })
  } catch (error) {
    console.error('Calendar POST error:', error)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 200 })
  }
}
