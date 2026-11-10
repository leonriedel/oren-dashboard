// Mock data for OREN RADAR — replace with real APIs later

export type HotTicker = {
  symbol: string
  name: string
  price: number
  changePct: number
  volume: string
  heat: number        // 0..100
  category: 'stock' | 'crypto' | 'etf' | 'micro' | 'intl'
  note?: string       // one-liner catalyst
}

export const HOT_TICKERS: HotTicker[] = [
  { symbol: 'NVDA',  name: 'NVIDIA',           price: 892.50,  changePct: 4.2,   volume: '48.2M', heat: 98, category: 'stock',  note: 'AI chips earnings beat' },
  { symbol: 'PLTR',  name: 'Palantir',         price: 45.20,   changePct: 6.8,   volume: '22.1M', heat: 94, category: 'stock',  note: 'DoD contract extension' },
  { symbol: 'TSLA',  name: 'Tesla',            price: 234.88,  changePct: 2.1,   volume: '71.4M', heat: 88, category: 'stock',  note: 'Robotaxi event countdown' },
  { symbol: 'CRWD',  name: 'CrowdStrike',      price: 312.40,  changePct: 3.5,   volume: '4.8M',  heat: 86, category: 'stock',  note: 'Fed cyber spend Q4' },
  { symbol: 'HOOD',  name: 'Robinhood',        price: 28.95,   changePct: 5.2,   volume: '19.3M', heat: 83, category: 'stock',  note: 'Crypto season flows' },
  { symbol: 'SMCI',  name: 'Super Micro',      price: 41.20,   changePct: 7.8,   volume: '12.5M', heat: 81, category: 'stock',  note: 'AI server oversold bounce' },
  { symbol: 'ANET',  name: 'Arista Networks',  price: 445.30,  changePct: 2.9,   volume: '2.1M',  heat: 78, category: 'stock',  note: 'Hyperscaler capex uplift' },
  { symbol: 'IONQ',  name: 'IonQ',             price: 18.75,   changePct: 9.4,   volume: '28.7M', heat: 76, category: 'micro', note: 'Quantum milestone claim' },
  { symbol: 'RKLB',  name: 'Rocket Lab',       price: 22.40,   changePct: 4.8,   volume: '8.2M',  heat: 74, category: 'stock',  note: 'Neutron first flight set' },
  { symbol: 'TEM',   name: 'Tempus AI',        price: 61.80,   changePct: 6.3,   volume: '3.9M',  heat: 72, category: 'stock',  note: 'Healthcare AI partnership' },
]

export const NICHE_PICKS: HotTicker[] = [
  { symbol: 'RGTI',  name: 'Rigetti Computing',       price: 2.84,   changePct: 12.5, volume: '42M',  heat: 91, category: 'micro', note: 'Quantum sympathy + volume surge' },
  { symbol: 'ASTS',  name: 'AST SpaceMobile',         price: 24.60,  changePct: 8.1,  volume: '11M',  heat: 87, category: 'micro', note: 'Direct-to-cell satellite tests pass' },
  { symbol: 'NBIS',  name: 'Nebius Group',            price: 48.90,  changePct: 5.4,  volume: '2.3M', heat: 85, category: 'intl',  note: 'EU AI compute spin-off hidden gem' },
  { symbol: 'ACHR',  name: 'Archer Aviation',         price: 11.20,  changePct: 6.9,  volume: '18M',  heat: 82, category: 'micro', note: 'eVTOL FAA certification path' },
  { symbol: 'GRAB',  name: 'Grab Holdings',           price: 5.80,   changePct: 3.2,  volume: '14M',  heat: 70, category: 'intl',  note: 'SEA super-app, underpriced vs peers' },
  { symbol: 'LUNR',  name: 'Intuitive Machines',      price: 12.40,  changePct: 7.5,  volume: '6.8M', heat: 73, category: 'micro', note: 'NASA Artemis awarded contract' },
]

export const CRYPTO_HEAT: HotTicker[] = [
  { symbol: 'BTC',   name: 'Bitcoin',    price: 92450,   changePct: 2.4, volume: '42B',  heat: 85, category: 'crypto', note: 'ETF inflows accelerating' },
  { symbol: 'ETH',   name: 'Ethereum',   price: 3285,    changePct: 3.8, volume: '18B',  heat: 82, category: 'crypto', note: 'Layer 2 TVL ATH' },
  { symbol: 'SOL',   name: 'Solana',     price: 178,     changePct: 6.2, volume: '4.2B', heat: 89, category: 'crypto', note: 'Memecoin volume + DePIN' },
  { symbol: 'TAO',   name: 'Bittensor',  price: 345,     changePct: 11.4, volume: '220M',heat: 92, category: 'crypto', note: 'Decentralized AI narrative' },
]

// Live-work stream templates — mix of plausible + fancy to show complexity
export const WORK_STREAM_TEMPLATES = [
  { prefix: 'SCAN', color: '#00ff41', msg: (t: string) => `Reddit r/wallstreetbets — ${Math.floor(Math.random()*5000+500)} posts analyzed, ${t} mentioned ${Math.floor(Math.random()*120+10)}x` },
  { prefix: 'FEED', color: '#00ff41', msg: (t: string) => `Polygon NASDAQ L2 ticks: ${Math.floor(Math.random()*900+100)}k/s · ${t} depth imbalance ${(Math.random()*2-1).toFixed(2)}` },
  { prefix: 'AI',   color: '#60ff80', msg: (t: string) => `Claude sentiment ∑ ${t} sector: ${(Math.random()*1.5-0.3).toFixed(2)} · confidence 0.${Math.floor(Math.random()*30+65)}` },
  { prefix: 'SEC',  color: '#80ff60', msg: (t: string) => `Form 4 insider scan · ${t} C-level buy $${Math.floor(Math.random()*5000+100)}k detected` },
  { prefix: 'YAH',  color: '#00ff41', msg: (t: string) => `Yahoo earnings calendar · ${t} reports in ${Math.floor(Math.random()*18+1)}d · implied move ${(Math.random()*8+2).toFixed(1)}%` },
  { prefix: 'TIK',  color: '#00ff41', msg: (t: string) => `Momentum score recalc · ${t} RSI ${Math.floor(Math.random()*40+30)} · MACD cross ${Math.random()>0.5?'bullish':'neutral'}` },
  { prefix: 'NEWS', color: '#60ff80', msg: (t: string) => `Bloomberg terminal sync · ${t} hits in last 24h: ${Math.floor(Math.random()*80+5)}` },
  { prefix: 'DB',   color: '#80ff60', msg: () => `Historical pattern DB · ${(Math.random()*2+0.5).toFixed(1)}M rows scanned · ${Math.floor(Math.random()*40+5)} matches` },
  { prefix: 'X',    color: '#00ff41', msg: (t: string) => `X/Twitter cashtag $${t} · ${Math.floor(Math.random()*3000+200)} mentions/h · sentiment +${(Math.random()*0.5+0.2).toFixed(2)}` },
  { prefix: 'GLOB', color: '#60ff80', msg: () => `Global market scan · NIKKEI ${Math.random()>0.5?'+':'-'}${(Math.random()*2).toFixed(2)}% · DAX ${Math.random()>0.5?'+':'-'}${(Math.random()*1.5).toFixed(2)}% · HSI ${Math.random()>0.5?'+':'-'}${(Math.random()*2.5).toFixed(2)}%` },
  { prefix: 'CRYP', color: '#60ff80', msg: () => `Crypto heat scan · ${Math.floor(Math.random()*3000+500)} tokens priced · ${Math.floor(Math.random()*40+5)} with >10% 1h move` },
  { prefix: 'OPT',  color: '#80ff60', msg: (t: string) => `Options unusual activity · ${t} ${Math.random()>0.5?'calls':'puts'} ${Math.floor(Math.random()*8000+500)} vs avg ${Math.floor(Math.random()*500+100)}` },
  { prefix: 'DARK', color: '#80ff60', msg: (t: string) => `Dark pool prints · ${t} block ${Math.floor(Math.random()*500+50)}k shares @ ${(Math.random()*5+95).toFixed(2)}% mid` },
  { prefix: 'FUND', color: '#00ff41', msg: () => `13F fund flow analysis · ${Math.floor(Math.random()*200+40)} funds rebalanced this quarter · tracking…` },
  { prefix: 'MACR', color: '#60ff80', msg: () => `Macro signals · DXY ${(Math.random()*3+100).toFixed(2)} · 10Y ${(Math.random()*0.5+4).toFixed(2)}% · VIX ${(Math.random()*8+12).toFixed(1)}` },
  { prefix: 'SAT',  color: '#80ff60', msg: () => `Satellite data ingest · parking lot count ${Math.floor(Math.random()*20000+1000)} locations · YoY ${(Math.random()*20-5).toFixed(1)}%` },
  { prefix: 'JOB',  color: '#00ff41', msg: (t: string) => `Job postings proxy · ${t} openings ${Math.floor(Math.random()*500+10)}, ${(Math.random()*40-10).toFixed(1)}% vs 90d avg` },
]

// Reusable tickers pool for work-stream randomization
export const TICKER_POOL = [
  'NVDA','TSLA','PLTR','AMD','AAPL','MSFT','GOOGL','META','AMZN','NFLX',
  'SMCI','ANET','CRWD','HOOD','IONQ','RKLB','TEM','ASTS','RGTI','NBIS',
  'ACHR','GRAB','LUNR','MSTR','COIN','SOFI','UBER','SHOP','SNOW','CRM',
  'BTC','ETH','SOL','TAO','SUI','APT','DOGE','ARB',
]
