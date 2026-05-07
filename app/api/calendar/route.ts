import { NextRequest, NextResponse } from 'next/server'

const NOTION_TOKEN = process.env.NOTION_TOKEN
const DATABASE_ID = '0db5af1e64c54d418d3c832e87f26097'

export async function GET(req: NextRequest) {
  try {
    const today = new Date()
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
    const endOfWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7).toISOString()

    const res = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: {
          and: [
            {
              property: 'Date',
              date: { on_or_after: startOfDay }
            },
            {
              property: 'Date', 
              date: { before: endOfWeek }
            }
          ]
        },
        sorts: [{ property: 'Date', direction: 'ascending' }],
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
      
      // Find title property
      const titleProp = Object.values(props).find((p: any) => p.type === 'title') as any
      const title = titleProp?.title?.[0]?.plain_text || 'Kein Titel'
      
      // Find date property
      const dateProp = Object.values(props).find((p: any) => p.type === 'date') as any
      const date = dateProp?.date?.start || null
      const dateEnd = dateProp?.date?.end || null

      return { id: page.id, title, date, dateEnd }
    }).filter((e: any) => e.date)

    return NextResponse.json({ events })
  } catch (error) {
    console.error('Calendar API error:', error)
    return NextResponse.json({ events: [], error: String(error) }, { status: 200 })
  }
}
