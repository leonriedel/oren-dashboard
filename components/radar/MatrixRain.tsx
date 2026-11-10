'use client'
import { useEffect, useRef } from 'react'

// Finance-themed "rain": ticker symbols, prices, hex codes, deltas
const POOL: string[] = [
  // Ticker symbols
  'NVDA','TSLA','PLTR','AMD','AAPL','MSFT','META','AMZN','SMCI','ANET',
  'CRWD','HOOD','IONQ','RKLB','MSTR','COIN','SOFI','UBER','SNOW','CRM',
  'ASML','TSM','ARM','AVGO','ORCL','DELL','QCOM','NFLX','ADBE','SHOP',
  // Crypto
  'BTC','ETH','SOL','TAO','SUI','APT','DOGE','ARB','MATIC','AVAX',
  // Price fragments
  '892.50','45.20','234.88','312.40','28.95','41.20','445.30','18.75','22.40','61.80',
  '92450','3285','178','345','1.0847','0.6521',
  // Deltas
  '+4.2%','-1.8%','+6.8%','+2.1%','+3.5%','-0.9%','+7.8%','+2.9%','+9.4%','-2.1%',
  '+12.5%','+8.1%','+5.4%','+6.9%','+3.2%','+11.4%','-4.3%','+6.3%','+5.2%','+4.8%',
  // Volume
  '48.2M','22.1M','71.4M','4.8M','19.3M','12.5M','8.2M','3.9M','2.3M','14.0M',
  // Order-book-ish
  'BID','ASK','VOL','OHLC','RSI','MACD','VWAP','EMA','MA50','MA200',
  'ATR','ADX','OBV','BB','SMA','DOJI','GAP','FVG','POC','HVN',
  // Hex / raw
  '0xFA3D','0x8B21','0x2C9F','0x7E04','0xD1A8','0x5B33','0xC2E7','0x941B',
  '0x3F05','0xA7D2','0x6E89','0x1C4B','0x8F7A','0x05E1','0x9D22','0xB4F0',
  // Floats
  '0.72','0.34','0.91','0.18','0.56','0.83','0.09','0.65','0.42','0.77',
  // Time fragments
  '20:14','20:15','20:16','03.11','04.11','Q4','H2','YoY','MoM',
]

export default function MatrixRain({ opacity = 0.09 }: { opacity?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const fontSize = 12
    const lineHeight = fontSize + 2

    // Variable column widths — we pick a token, measure, advance
    // Keep it simple: fixed-width columns, 70px apart (enough for most tokens)
    const colWidth = 72
    const columns = Math.max(1, Math.floor(window.innerWidth / colWidth))

    type Drop = {
      y: number
      speed: number       // in "lines" per frame
      tokens: string[]    // the trailing stack
      maxTrail: number
    }

    const makeDrop = (): Drop => ({
      y: -Math.random() * 40,
      speed: 0.3 + Math.random() * 0.6,
      tokens: [],
      maxTrail: 10 + Math.floor(Math.random() * 14),
    })

    const drops: Drop[] = Array.from({ length: columns }, makeDrop)

    const pick = () => POOL[Math.floor(Math.random() * POOL.length)]

    let raf = 0
    const draw = () => {
      // Fade previous frame
      ctx.fillStyle = 'rgba(0, 0, 0, 0.10)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.font = `${fontSize}px "Space Mono", monospace`

      for (let i = 0; i < drops.length; i++) {
        const d = drops[i]
        const x = i * colWidth + 4

        // Occasionally push a new token to the head
        if (Math.random() < 0.18) {
          d.tokens.unshift(pick())
          if (d.tokens.length > d.maxTrail) d.tokens.pop()
        }

        // Draw trail
        for (let t = 0; t < d.tokens.length; t++) {
          const trailY = d.y * lineHeight - t * lineHeight
          if (trailY < -10 || trailY > canvas.height + 10) continue
          const alpha = t === 0
            ? opacity * 7
            : opacity * (1.6 - t / d.maxTrail) * 1.2
          const color = t === 0
            ? `rgba(220, 255, 230, ${Math.min(1, alpha)})`
            : `rgba(0, 255, 65, ${Math.max(0.03, alpha)})`
          ctx.fillStyle = color
          ctx.fillText(d.tokens[t], x, trailY)
        }

        d.y += d.speed
        if (d.y * lineHeight - d.tokens.length * lineHeight > canvas.height && Math.random() > 0.97) {
          drops[i] = makeDrop()
        }
      }
      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [opacity])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}
    />
  )
}
