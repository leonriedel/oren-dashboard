import { NextResponse } from 'next/server'

const FEEDS = {
  general: [
    { name: 'Tagesschau', url: 'https://www.tagesschau.de/index~rss2.xml' },
    { name: 'Spiegel', url: 'https://www.spiegel.de/schlagzeilen/index.rss' },
    { name: 'ZEIT', url: 'https://newsfeed.zeit.de/index' },
  ],
  business: [
    { name: 'Handelsblatt', url: 'https://www.handelsblatt.com/contentexport/feed/top-themen' },
    { name: 'Manager Magazin', url: 'https://www.manager-magazin.de/news/index.rss' },
    { name: 'FAZ Wirtschaft', url: 'https://www.faz.net/rss/aktuell/wirtschaft/' },
  ],
  f1: [
    { name: 'Motorsport.com', url: 'https://de.motorsport.com/rss/f1/news/' },
    { name: 'Motorsport-Total', url: 'https://www.motorsport-total.com/rss/news.xml' },
  ],
}

function parseRSS(xml: string, sourceName: string) {
  const items: any[] = []
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g
  let match
  let count = 0
  while ((match = itemRegex.exec(xml)) !== null && count < 5) {
    const block = match[1]
    const title = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim()
    const link = block.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1]?.trim()
    const pubDate = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/)?.[1]?.trim()
    if (title && link) {
      items.push({
        source: sourceName,
        headline: title.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
        link,
        date: pubDate,
      })
      count++
    }
  }
  return items
}

function timeAgo(dateStr: string) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

async function fetchFeed(feed: { name: string; url: string }) {
  try {
    const res = await fetch(feed.url, { next: { revalidate: 600 } })
    if (!res.ok) return []
    const xml = await res.text()
    return parseRSS(xml, feed.name).map(item => ({ ...item, time: timeAgo(item.date) }))
  } catch (e) {
    console.error('Feed error:', feed.name, e)
    return []
  }
}

export async function GET() {
  const result: any = {}
  for (const [category, feeds] of Object.entries(FEEDS)) {
    const allItems = await Promise.all(feeds.map(fetchFeed))
    result[category] = allItems.flat().sort((a, b) => {
      const da = new Date(a.date).getTime() || 0
      const db = new Date(b.date).getTime() || 0
      return db - da
    }).slice(0, 12)
  }
  return NextResponse.json(result)
}
