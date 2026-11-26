import type { SupabaseClient } from '@supabase/supabase-js'

export type WDaily = { day: string; equity: number; eur: number; crypto: number; net_deposits: number | null; btc: number; eth: number }
export type WTrade = { id: number; ts: string; pair: string; side: string; amount: number; price: number; value_eur: number; fee_eur: number | null; reason: string; live: boolean }

const n = (x: any) => (x === null || x === undefined || x === '' ? null : Number(x))

/** Everything the Waldemar page and the finance overview need, computed from the bot's tables. */
export async function waldemarSummary(supa: SupabaseClient) {
  const [st, dl, tr] = await Promise.all([
    supa.from('waldemar_status').select('*').eq('id', 1).maybeSingle(),
    supa.from('waldemar_daily').select('*').order('day', { ascending: true }),
    supa.from('waldemar_trades').select('*').order('ts', { ascending: false }).limit(100),
  ])
  if (st.error && /relation|does not exist|schema cache/i.test(st.error.message)) return { available: false, needsSql: true }
  if (st.error) return { available: false, needsSql: false, error: st.error.message }
  const status: any = st.data
  if (!status) return { available: false, needsSql: false, error: 'no row in waldemar_status (the bot has not written to this Supabase project)' }

  const daily: WDaily[] = (dl.data || []).map((d: any) => ({
    day: d.day, equity: n(d.equity) || 0, eur: n(d.eur) || 0, crypto: n(d.crypto) || 0,
    net_deposits: n(d.net_deposits), btc: n(d.btc) || 0, eth: n(d.eth) || 0,
  }))
  const equity = n(status.equity) || 0
  const depNow = n(status.net_deposits)
  const first = daily[0]
  // baseline: money put in (deposits − withdrawals) if the exchange reports it, else the first recorded equity
  const invested = depNow !== null && depNow > 0 ? depNow : (first?.equity || equity)
  const totalPnl = equity - invested

  const flow = (a: WDaily | undefined, bNet: number | null) => {
    if (!a) return 0
    const x = a.net_deposits, y = bNet
    return x !== null && y !== null ? y - x : 0
  }
  const today = new Date().toISOString().slice(0, 10)
  const prevDays = daily.filter(d => d.day < today)
  const yesterday = prevDays[prevDays.length - 1]
  const todayPnl = yesterday ? equity - yesterday.equity - flow(yesterday, depNow) : equity - invested

  const month = today.slice(0, 7)
  const beforeMonth = daily.filter(d => d.day.slice(0, 7) < month)
  const lastPrevMonth = beforeMonth[beforeMonth.length - 1]
  const monthPnl = lastPrevMonth ? equity - lastPrevMonth.equity - flow(lastPrevMonth, depNow) : totalPnl

  // daily P&L series
  const dailyPnl = daily.map((d, i) => {
    const prev = daily[i - 1]
    const pnl = prev ? d.equity - prev.equity - flow(prev, d.net_deposits) : d.equity - (d.net_deposits && d.net_deposits > 0 ? d.net_deposits : d.equity)
    return { day: d.day, pnl, equity: d.equity }
  })
  // monthly table
  const months: Record<string, { month: string; pnl: number; end: number; start: number }> = {}
  for (const d of dailyPnl) {
    const m = d.day.slice(0, 7)
    if (!months[m]) months[m] = { month: m, pnl: 0, end: d.equity, start: d.equity - d.pnl }
    months[m].pnl += d.pnl
    months[m].end = d.equity
  }
  // benchmark: BTC/ETH 50/50 held since the first day, scaled to the first equity
  const bench = first && first.btc && first.eth
    ? daily.map(d => ({ day: d.day, value: first.equity * (0.5 * d.btc / first.btc + 0.5 * d.eth / first.eth) }))
    : []

  const ageMin = status.ts ? (Date.now() - new Date(status.ts).getTime()) / 60000 : 9999
  return {
    available: true,
    needsSql: false,
    stale: ageMin > 45,
    status: { ...status, equity, net_deposits: depNow, age_min: Math.round(ageMin) },
    invested,
    totalPnl,
    totalPct: invested ? totalPnl / invested : 0,
    todayPnl,
    monthPnl,
    benchmarkPct: bench.length ? bench[bench.length - 1].value / bench[0].value - 1 : null,
    daily: dailyPnl.slice(-120),
    bench: bench.slice(-120),
    months: Object.values(months).reverse(),
    trades: (tr.data || []) as WTrade[],
  }
}
