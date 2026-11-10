import { NextResponse } from 'next/server'
import { XMLParser } from 'fast-xml-parser'

// IBKR Flex Query Web Service
// Flow: SendRequest(token, queryId) → ReferenceCode → GetStatement(token, ref) → XML data
// Docs: https://www.interactivebrokers.com/campus/ibkr-api-page/flex-web-service/
const TOKEN       = process.env.IBKR_FLEX_TOKEN || ''
const QUERY_ID    = process.env.IBKR_FLEX_QUERY_ID || ''
const FINNHUB_KEY = process.env.FINNHUB_API_KEY || ''

const BASE = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: true,
  allowBooleanAttributes: true,
})

async function fetchFlex() {
  const reqUrl = `${BASE}/SendRequest?t=${TOKEN}&q=${QUERY_ID}&v=3`
  const refRes = await fetch(reqUrl, { cache: 'no-store' })
  if (!refRes.ok) throw new Error(`SendRequest ${refRes.status}: ${await refRes.text()}`)
  const refXml = await refRes.text()
  const refDoc: any = parser.parse(refXml)
  const refResp = refDoc.FlexStatementResponse || refDoc.StatementResponse || refDoc
  const status = refResp.Status || refResp.status
  if (status !== 'Success') {
    const code = refResp.ErrorCode || refResp.errorCode
    const msg = refResp.ErrorMessage || refResp.errorMessage || JSON.stringify(refResp)
    throw new Error(`SendRequest failed: ${code} · ${msg}`)
  }
  const referenceCode = refResp.ReferenceCode || refResp.referenceCode
  if (!referenceCode) throw new Error('No ReferenceCode in SendRequest response')

  const stmtUrl = `${BASE}/GetStatement?t=${TOKEN}&q=${referenceCode}&v=3`
  let stmtXml = ''
  for (let i = 0; i < 4; i++) {
    const r = await fetch(stmtUrl, { cache: 'no-store' })
    const text = await r.text()
    if (text.includes('1019') || text.includes('In progress')) {
      await new Promise(res => setTimeout(res, 1500 + i * 1000))
      continue
    }
    stmtXml = text
    break
  }
  if (!stmtXml) throw new Error('GetStatement never returned ready data')
  return parser.parse(stmtXml)
}

function toArr(x: any): any[] {
  if (!x) return []
  return Array.isArray(x) ? x : [x]
}

// Enrich positions with today's price change via Finnhub.
// quote.d = absolute change in native currency; dailyPnl = shares × d.
// Currency mismatch (EUR account, USD stocks) is left raw —
// acceptable for a daily indicator when portfolio is mostly USD.
async function enrichDailyPnl(positions: any[]) {
  if (!FINNHUB_KEY || positions.length === 0) {
    return positions.map(p => ({ ...p, dailyChange: 0, dailyChangePct: 0, dailyPnl: 0 }))
  }
  const stocky = positions.filter(p =>
    p.assetCategory === 'STK' || p.assetCategory === 'ETF' || !p.assetCategory
  )
  const quotes = await Promise.all(
    stocky.map(async p => {
      try {
        const r = await fetch(
          `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(p.symbol)}&token=${FINNHUB_KEY}`,
          { cache: 'no-store' }
        )
        if (!r.ok) return { symbol: p.symbol, d: 0, dp: 0 }
        const q = await r.json()
        return { symbol: p.symbol, d: Number(q.d) || 0, dp: Number(q.dp) || 0 }
      } catch {
        return { symbol: p.symbol, d: 0, dp: 0 }
      }
    })
  )
  const dailyMap = new Map(quotes.map(q => [q.symbol, q]))
  return positions.map(p => {
    const q = dailyMap.get(p.symbol)
    const d = q?.d || 0
    return {
      ...p,
      dailyChange:    d,
      dailyChangePct: q?.dp || 0,
      dailyPnl:       d * p.position,
    }
  })
}

export async function GET() {
  try {
    if (!TOKEN || !QUERY_ID) {
      return NextResponse.json({
        error: 'IBKR_FLEX_TOKEN or IBKR_FLEX_QUERY_ID not set in Vercel env',
        positions: [], account: null,
      }, { status: 200 })
    }

    const doc: any = await fetchFlex()
    const stmtRoot = doc.FlexQueryResponse?.FlexStatements?.FlexStatement
                   || doc.FlexQueryResponse?.FlexStatements
                   || doc.FlexStatements?.FlexStatement
                   || doc
    const stmt = Array.isArray(stmtRoot) ? stmtRoot[0] : stmtRoot

    const positionsRaw = toArr(stmt?.OpenPositions?.OpenPosition)
    const positions = positionsRaw.map((p: any) => ({
      symbol:        p.symbol,
      description:   p.description || p.symbol,
      assetCategory: p.assetCategory,
      currency:      p.currency,
      position:      Number(p.position || 0),
      markPrice:     Number(p.markPrice || 0),
      positionValue: Number(p.positionValue || 0),
      costBasis:     Number(p.costBasisMoney || p.costBasis || 0),
      unrealizedPnl: Number(p.fifoPnlUnrealized || p.unrealizedPnl || 0),
      percentOfNAV:  Number(p.percentOfNAV || 0),
    }))

    const enriched = await enrichDailyPnl(positions)

    const equity = toArr(stmt?.EquitySummaryInBase?.EquitySummaryByReportDateInBase)
    const latest = equity.length ? equity[equity.length - 1] : null
    const account = latest ? {
      date:      latest.reportDate,
      cash:      Number(latest.cash || 0),
      stock:     Number(latest.stock || 0),
      options:   Number(latest.options || 0),
      total:     Number(latest.total || 0),
      currency:  latest.currency || 'USD',
    } : null

    const unrealizedTotal = enriched.reduce((s, p) => s + p.unrealizedPnl, 0)
    const dailyPnlTotal   = enriched.reduce((s, p) => s + (p.dailyPnl || 0), 0)

    return NextResponse.json({
      positions: enriched,
      account,
      unrealizedTotal,
      dailyPnlTotal,
      source: 'ibkr-flex+finnhub-daily',
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json({ error: String(error), positions: [], account: null }, { status: 200 })
  }
}
