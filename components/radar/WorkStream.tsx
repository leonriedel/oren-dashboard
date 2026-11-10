'use client'
import { useEffect, useRef, useState } from 'react'
import { WORK_STREAM_TEMPLATES, TICKER_POOL } from '@/lib/radar/mockData'

type Line = { id: number; prefix: string; color: string; text: string; time: string }

export default function WorkStream({
  label,
  speedMs = 350,
  maxLines = 40,
}: {
  label: string
  speedMs?: number
  maxLines?: number
}) {
  const [lines, setLines] = useState<Line[]>([])
  const counter = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const tick = () => {
      const tpl = WORK_STREAM_TEMPLATES[Math.floor(Math.random() * WORK_STREAM_TEMPLATES.length)]
      const ticker = TICKER_POOL[Math.floor(Math.random() * TICKER_POOL.length)]
      const text = tpl.msg(ticker)
      const now = new Date()
      const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`
      counter.current++
      setLines(prev => {
        const next = [...prev, { id: counter.current, prefix: tpl.prefix, color: tpl.color, text, time }]
        return next.slice(-maxLines)
      })
    }
    tick()
    const id = setInterval(tick, speedMs)
    return () => clearInterval(id)
  }, [speedMs, maxLines])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  return (
    <div style={{
      background: 'rgba(0, 10, 5, 0.75)',
      border: '1px solid rgba(0, 255, 65, 0.25)',
      borderRadius: 2,
      padding: 0,
      fontFamily: '"Space Mono", monospace',
      fontSize: 10.5,
      color: '#00ff41',
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      height: '100%',
      position: 'relative',
    }}>
      {/* header bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 10px',
        borderBottom: '1px solid rgba(0, 255, 65, 0.25)',
        background: 'rgba(0, 255, 65, 0.06)',
        fontSize: 9, letterSpacing: 2, color: '#60ff80',
      }}>
        <span>▸ {label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#00ff41',
            boxShadow: '0 0 8px #00ff41',
            animation: 'radar-pulse 1s infinite',
          }} />
          LIVE
        </span>
      </div>

      {/* scrolling log */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          padding: '6px 10px',
          lineHeight: 1.55,
          scrollBehavior: 'auto',
        }}
      >
        {lines.map(l => (
          <div key={l.id} style={{ marginBottom: 2, textShadow: `0 0 4px ${l.color}60` }}>
            <span style={{ color: 'rgba(0,255,65,0.4)' }}>{l.time} </span>
            <span style={{ color: l.color, fontWeight: 700 }}>[{l.prefix}] </span>
            <span style={{ color: '#a0ffa0' }}>{l.text}</span>
          </div>
        ))}
      </div>

      {/* bottom scanline */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: 1, background: 'linear-gradient(90deg, transparent, #00ff41, transparent)',
        opacity: 0.4,
      }} />
    </div>
  )
}
