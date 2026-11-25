import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { adminOnly } from '@/lib/apiAuth'
import { waldemarSummary } from '@/lib/waldemar'

// FINANCE SUMMARY v2
// Aggregates everything into one view:
// - investments_v2 (user-maintained investments across categories)
// - IBKR Flex (auto-pull)
// - Edgar (live NAV)
// - Real Estate
//
// All totals in EUR. USD values converted via exchangerate.host.

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!

let _fx: { ts: number; usd_eur: number } = { ts: 0, usd_eur: 0.92 }
async function usdToEur(): Promise<number> {
  const now = Date.now()
  if (now - _fx.ts < 4 * 60 * 60 * 1000 && _fx.usd_eur) return _fx.usd_eur
  try {
    const r = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=EUR', { cache: 'no-store' })
    const j = await r.json()
    const rate = Number(j?.rates?.EUR)
    if (rate > 0) _fx = { ts: now, usd_eur: rate }
  } catch { /* use cached fallback */ }
  return _fx.usd_eur
}

async function fetchJSON(url: string, auth = '') {
  try {
    const r = await fetch(url, { cache: 'no-store', headers: auth ? { authorization: auth } : {} })
    return await r.json()
  } catch { return null }
}

export async function GET(req: Request) {
  const denied = await adminOnly(req); if (denied) return denied
  try {
    const u = new URL(req.url)
    const origin = u.origin
    const supa = createClient(SUPA_URL, KEY)
    const fx = await usdToEur()

    // 1. INVESTMENTS from investments_v2 (user-maintained CRUD)
    const { data: cats = [] } = await supa
      .from('investment_categories')
      .select('*')
      .order('sort_order')
    const { data: items = [] } = await supa
      .from('investments_v2')
      .select('*')
      .order('created_at')

    // 2. IBKR
    let ibkr = { total_eur: 0, dailyPnl_eur: 0, positions: 0, currency: 'EUR', available: false }
    try {
      const j = await fetchJSON(`${origin}/api/ibkr/flex`, req.headers.get('authorization') || '')
      if (j && !j.error) {
        const total = Number(j?.account?.total) || 0
        const currency = j?.account?.currency || 'EUR'
        const total_eur = currency === 'EUR' ? total : total * fx
        ibkr = {
          total_eur,
          dailyPnl_eur: Number(j?.dailyPnlTotal || 0) * (currency === 'EUR' ? 1 : fx),
          positions: Array.isArray(j?.positions) ? j.positions.length : 0,
          currency, available: true,
        }
      }
    } catch { /* skip */ }

    // 3. EDGAR
    let edgar = { nav_eur: 0, dry_run: true, available: false }
    try {
      const { data: eq } = await supa
        .from('edgar_equity')
        .select('nav,dry_run,ts')
        .order('ts', { ascending: false })
        .limit(1)
      if (eq && eq[0]) {
        edgar = {
          nav_eur: Number(eq[0].nav) * fx,
          dry_run: !!eq[0].dry_run,
          available: true,
        }
      }
    } catch { /* table may not exist */ }

    // 3b. WALDEMAR (crypto trend bot, EUR)
    let waldemar = { equity_eur: 0, today_eur: 0, month_eur: 0, total_pnl_eur: 0, live: false, stale: false, available: false }
    try {
      const w: any = await waldemarSummary(supa)
      if (w?.available) {
        waldemar = {
          equity_eur: Number(w.status.equity) || 0, today_eur: w.todayPnl || 0, month_eur: w.monthPnl || 0,
          total_pnl_eur: w.totalPnl || 0, live: !!w.status.live, stale: !!w.stale, available: true,
        }
      }
    } catch { /* tables may not exist yet */ }

    // 4. REAL ESTATE
    let realEstate = { total_eur: 0, projects: 0 }
    try {
      const { data: re } = await supa
        .from('real_estate_projects')
        .select('current_value')
      const sum = (re || []).reduce((s, p: any) => s + (Number(p.current_value) || 0), 0)
      realEstate = { total_eur: sum, projects: (re || []).length }
    } catch { /* table may not exist */ }

    // ── Aggregate per category ──
    const categories = (cats || []).map((c: any) => {
      const catItems = (items || []).filter((i: any) => i.category === c.name)
      const invested = catItems.reduce((s, i: any) => s + Number(i.invested || 0), 0)
      const current = catItems.reduce((s, i: any) => s + Number(i.current_value || 0), 0)
      const monthly = catItems.reduce((s, i: any) => s + Number(i.monthly_return || 0), 0)
      const yearly = catItems.reduce((s, i: any) => s + Number(i.yearly_return || 0), 0)
      return {
        id: c.id, name: c.name, icon: c.icon, sort_order: c.sort_order,
        items: catItems, invested, current, monthly, yearly,
      }
    })

    const userInvestedTotal = (items || []).reduce((s, i: any) => s + Number(i.invested || 0), 0)
    const userCurrentTotal  = (items || []).reduce((s, i: any) => s + Number(i.current_value || 0), 0)
    const userMonthlyTotal  = (items || []).reduce((s, i: any) => s + Number(i.monthly_return || 0), 0)
    const userYearlyTotal   = (items || []).reduce((s, i: any) => s + Number(i.yearly_return || 0), 0)

    // Live sources totals
    const liveTotal = ibkr.total_eur + edgar.nav_eur + waldemar.equity_eur + realEstate.total_eur

    // Grand total: user-tracked items + live auto-pulled
    const total = userCurrentTotal + liveTotal

    return NextResponse.json({
      total_eur: total,
      user_tracked: {
        invested: userInvestedTotal,
        current: userCurrentTotal,
        monthly: userMonthlyTotal,
        yearly: userYearlyTotal,
      },
      live_sources: {
        total: liveTotal,
        ibkr, edgar, waldemar, realEstate,
      },
      categories,
      fx: { usd_eur: fx, ts: _fx.ts },
      updatedAt: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json({ total_eur: 0, error: String(e) }, { status: 200 })
  }
}

// POST: snapshot
export async function POST(req: Request) {
  const denied = await adminOnly(req); if (denied) return denied
  try {
    const supa = createClient(SUPA_URL, KEY)
    const u = new URL(req.url)
    const originRes = await fetch(`${u.origin}/api/finance/summary`, { cache: 'no-store', headers: { authorization: req.headers.get('authorization') || '' } })
    const j = await originRes.json()
    if (!j?.total_eur && j?.total_eur !== 0) return NextResponse.json({ ok: false, error: 'no summary' }, { status: 200 })

    const row = {
      ts: new Date().toISOString(),
      total_eur: j.total_eur,
      liquid_eur: 0,  // schema compat
      investments_eur: j.user_tracked?.current || 0,
      physical_eur: j.live_sources?.realEstate?.total_eur || 0,
      other_eur: (j.live_sources?.ibkr?.total_eur || 0) + (j.live_sources?.edgar?.nav_eur || 0) + (j.live_sources?.waldemar?.equity_eur || 0),
      breakdown: j,
    }
    const { error } = await supa.from('finance_snapshots').insert(row)
    return NextResponse.json({ ok: !error, error: error?.message, snapshot: row })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 200 })
  }
}
