'use client'
import { useEffect, useRef } from 'react'

export default function MatrixRain({ opacity = 0.08 }: { opacity?: number }) {
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

    const glyphs = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789$€¥ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#'.split('')
    const fontSize = 14
    const columns = Math.floor(window.innerWidth / fontSize)
    const drops: number[] = Array(columns).fill(1).map(() => Math.random() * -100)

    let raf = 0
    const draw = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = `rgba(0, 255, 65, ${opacity * 2})`
      ctx.font = `${fontSize}px "Space Mono", monospace`

      for (let i = 0; i < drops.length; i++) {
        const text = glyphs[Math.floor(Math.random() * glyphs.length)]
        const x = i * fontSize
        const y = drops[i] * fontSize
        // bright leading character
        ctx.fillStyle = `rgba(200, 255, 220, ${opacity * 6})`
        ctx.fillText(text, x, y)
        // trailing dim characters
        ctx.fillStyle = `rgba(0, 255, 65, ${opacity * 2})`
        if (drops[i] > 1) ctx.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], x, y - fontSize)
        if (drops[i] > 2) ctx.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], x, y - fontSize * 2)
        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0
        drops[i]++
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
      style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
      }}
    />
  )
}
