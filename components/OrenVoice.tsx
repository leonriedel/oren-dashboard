'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useRole } from '@/lib/useRole'

/**
 * OREN VOICE · always-on voice assistant (admin only, lives in the root layout)
 * "Hey OREN …" → listens → Claude understands → OREN speaks + navigates / captures.
 * After answering he keeps listening ~7s for a follow-up without the wake word.
 * German by default; "speak English" / "sprich Deutsch" switches.
 */

type Mode = 'off' | 'idle' | 'listening' | 'thinking' | 'speaking'
type Lang = 'de' | 'en'

const WAKE = /\b(hey|hi|hallo|ok|okay|hej|he)[\s,]+(oren|ohren|orren|oran|orin|o ren|o-ren|aaron|owen|orane|orion|lauren)\b/i
const TO_EN = /\b(speak english|english please|switch to english|in english|auf englisch|englisch bitte)\b/i
const TO_DE = /\b(sprich deutsch|deutsch bitte|auf deutsch|speak german|switch to german|in german)\b/i
const STOP = /^(stopp?|stop it|danke,? das war'?s|das war'?s|schlaf|sleep|that'?s all|nichts|nevermind|never mind|vergiss es)\.?$/i
const SCREENS = ['home', 'brain', 'think', 'news', 'sport', 'estate']
const ROUTES: Record<string, string> = { radar: '/radar', finance: '/finance', scalper: '/edgar-scalper', calendar: '/dashboard/calendar' }

const MONO = 'Space Mono, monospace'

function pickVoice(lang: Lang): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  const pref = lang === 'de'
    ? [/de.*(premium|enhanced)/i, /anna.*(premium|enhanced)/i, /(helena|markus|yannick|anna)/i, /^de/i]
    : [/daniel.*(premium|enhanced)/i, /(premium|enhanced).*en-gb/i, /daniel/i, /en-gb/i, /(alex|samantha|ava)/i, /^en/i]
  for (const re of pref) {
    const v = voices.find(v => re.test(`${v.name} ${v.lang}`) && v.lang.toLowerCase().startsWith(lang))
    if (v) return v
  }
  return voices.find(v => v.lang.toLowerCase().startsWith(lang)) || null
}

export default function OrenVoice() {
  const { role } = useRole()
  const pathname = usePathname()
  const router = useRouter()
  const [mode, setModeState] = useState<Mode>('off')
  const [lang, setLangState] = useState<Lang>('de')
  const [caption, setCaption] = useState('')
  const [reply, setReply] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [supported, setSupported] = useState(true)

  const modeRef = useRef<Mode>('off')
  const langRef = useRef<Lang>('de')
  const recRef = useRef<any>(null)
  const markRef = useRef(0)              // char offset in session transcript where the command starts
  const silenceRef = useRef<any>(null)
  const windowRef = useRef<any>(null)
  const historyRef = useRef<{ role: string; text: string }[]>([])
  const unlockedRef = useRef(false)
  const pathRef = useRef(pathname)
  pathRef.current = pathname

  const setMode = (m: Mode) => {
    modeRef.current = m; setModeState(m)
    const orb = m === 'listening' ? 'listening' : m === 'thinking' ? 'thinking' : m === 'speaking' ? 'speaking' : 'idle'
    window.dispatchEvent(new CustomEvent('oren:state', { detail: orb }))
  }
  const setLang = (l: Lang) => { langRef.current = l; setLangState(l); try { localStorage.setItem('oren-voice-lang', l) } catch { /* noop */ } }

  // ─── speech output ───
  const speak = useCallback((text: string, l: Lang) => new Promise<void>(resolve => {
    const synth = window.speechSynthesis
    if (!synth || !text) { resolve(); return }
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    const v = pickVoice(l)
    if (v) u.voice = v
    u.lang = l === 'de' ? 'de-DE' : 'en-GB'
    u.rate = 1.04; u.pitch = 0.95
    let done = false
    const finish = () => { if (!done) { done = true; resolve() } }
    u.onend = finish; u.onerror = finish
    setTimeout(finish, Math.max(4000, text.length * 120))   // safety if onend never fires
    synth.speak(u)
  }), [])

  // ─── recognition loop ───
  const stopRec = () => { try { recRef.current?.abort() } catch { /* noop */ } }
  const startRec = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { setSupported(false); return }
    stopRec()
    const rec = new SR()
    rec.lang = langRef.current === 'de' ? 'de-DE' : 'en-US'
    rec.continuous = true
    rec.interimResults = true
    markRef.current = 0
    rec.onresult = (e: any) => {
      const full = Array.from(e.results as ArrayLike<any>).map((r: any) => r[0].transcript).join(' ').replace(/\s+/g, ' ')
      const m = modeRef.current
      if (m === 'idle') {
        const hit = WAKE.exec(full)
        if (hit) {
          markRef.current = hit.index + hit[0].length
          setReply(''); setCaption(full.slice(markRef.current).trim())
          setMode('listening')
          armSilence()
          armWindow()
        }
      } else if (m === 'listening') {
        setCaption(full.slice(markRef.current).replace(/^[\s,.!?]+/, ''))
        armSilence()
      }
    }
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setError(langRef.current === 'de' ? 'Mikrofon blockiert — in den Browser-Einstellungen erlauben.' : 'Microphone blocked — allow it in browser settings.')
        disarm()
      }
    }
    rec.onend = () => {
      const m = modeRef.current
      if (m === 'idle' || m === 'listening') setTimeout(() => { if (modeRef.current === 'idle' || modeRef.current === 'listening') startRec() }, 250)
    }
    recRef.current = rec
    try { rec.start() } catch { /* already started */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const armSilence = () => {
    clearTimeout(silenceRef.current)
    silenceRef.current = setTimeout(() => {
      const cmd = captionRef.current.trim()
      if (cmd.length > 1) handle(cmd)
    }, 1500)
  }
  const armWindow = () => {
    clearTimeout(windowRef.current)
    windowRef.current = setTimeout(() => {
      if (modeRef.current === 'listening' && captionRef.current.trim().length < 2) { setCaption(''); setMode('idle') }
    }, 7000)
  }
  const captionRef = useRef('')
  useEffect(() => { captionRef.current = caption }, [caption])

  // ─── handle a command ───
  const handle = useCallback(async (cmd: string) => {
    clearTimeout(silenceRef.current); clearTimeout(windowRef.current)
    setMode('thinking'); stopRec()
    const clean = cmd.replace(/^[\s,.!?]+/, '').trim()

    if (TO_EN.test(clean)) { setLang('en'); await say("Sure — I'll speak English now.", 'en', true); return }
    if (TO_DE.test(clean)) { setLang('de'); await say('Alles klar, ab jetzt Deutsch.', 'de', true); return }
    if (STOP.test(clean)) { await say(langRef.current === 'de' ? 'Bin da, wenn du mich brauchst.' : "I'm here when you need me.", langRef.current, false); return }

    try {
      const supa = createClient()
      const { data } = await supa.auth.getSession()
      const t = data?.session?.access_token
      const r = await fetch('/api/voice', {
        method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ text: clean, lang: langRef.current, path: pathRef.current, history: historyRef.current, localTime: new Date().toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) }),
      })
      const j = await r.json()
      const l: Lang = j.lang === 'en' ? 'en' : 'de'
      if (l !== langRef.current) setLang(l)
      historyRef.current = [...historyRef.current, { role: 'leon', text: clean }, { role: 'oren', text: j.reply || '' }].slice(-10)
      let followUp = true
      for (const a of (j.actions || [])) {
        if (a.type === 'navigate') navigate(a.target)
        if (a.type === 'stop') followUp = false
      }
      await say(j.reply || (l === 'de' ? 'Erledigt.' : 'Done.'), l, followUp)
    } catch {
      await say(langRef.current === 'de' ? 'Ich erreiche gerade meinen Server nicht.' : "I can't reach my server right now.", langRef.current, false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const say = async (text: string, l: Lang, followUp: boolean) => {
    setReply(text); setCaption('')
    setMode('speaking')
    await speak(text, l)
    if (modeRef.current === 'off') return
    if (followUp) { setMode('listening'); startRec(); markRef.current = 0; armWindow() }
    else { setMode('idle'); startRec(); setTimeout(() => { if (modeRef.current === 'idle') setReply('') }, 4000) }
  }

  const navigate = (target: string) => {
    if (ROUTES[target]) { router.push(ROUTES[target]); return }
    if (SCREENS.includes(target)) {
      if (pathRef.current === '/dashboard') window.dispatchEvent(new CustomEvent('oren:navigate', { detail: target }))
      else router.push(target === 'home' ? '/dashboard' : `/dashboard?screen=${target}`)
    }
  }

  // ─── arm / disarm ───
  const unlockAudio = () => {
    if (unlockedRef.current || !window.speechSynthesis) return
    unlockedRef.current = true
    const u = new SpeechSynthesisUtterance(' '); u.volume = 0
    window.speechSynthesis.speak(u)
  }
  const arm = async () => {
    setError(null); unlockAudio()
    try { localStorage.setItem('oren-voice', '1') } catch { /* noop */ }
    setMode('idle'); startRec()
    await say(langRef.current === 'de' ? 'OREN ist online. Sag einfach: Hey OREN.' : 'OREN online. Just say: Hey OREN.', langRef.current, false)
  }
  const disarm = () => {
    try { localStorage.removeItem('oren-voice') } catch { /* noop */ }
    clearTimeout(silenceRef.current); clearTimeout(windowRef.current)
    stopRec(); window.speechSynthesis?.cancel()
    setCaption(''); setReply(''); setMode('off')
  }

  // restore on load (mic permission persists; audio unlocks on first interaction)
  useEffect(() => {
    if (role !== 'admin') return
    try {
      const l = localStorage.getItem('oren-voice-lang'); if (l === 'en' || l === 'de') setLang(l)
      if (localStorage.getItem('oren-voice') === '1' && modeRef.current === 'off') { setMode('idle'); startRec() }
    } catch { /* noop */ }
    const once = () => unlockAudio()
    window.addEventListener('pointerdown', once, { once: true })
    window.addEventListener('keydown', once, { once: true })
    window.speechSynthesis?.getVoices()
    return () => { window.removeEventListener('pointerdown', once); window.removeEventListener('keydown', once) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])

  useEffect(() => () => { stopRec(); clearTimeout(silenceRef.current); clearTimeout(windowRef.current) }, [])

  if (role !== 'admin' || pathname === '/login') return null

  const active = mode !== 'off'
  const color = mode === 'listening' ? '#5db8ff' : mode === 'thinking' ? '#fbbf24' : mode === 'speaking' ? '#34d399' : active ? '#80c0ff' : 'rgba(128,192,255,0.35)'
  const label = mode === 'off' ? (lang === 'de' ? 'VOICE AUS' : 'VOICE OFF') : mode === 'idle' ? (lang === 'de' ? '„HEY OREN“' : '"HEY OREN"') : mode === 'listening' ? (lang === 'de' ? 'HÖRE ZU' : 'LISTENING') : mode === 'thinking' ? (lang === 'de' ? 'DENKE' : 'THINKING') : (lang === 'de' ? 'SPRICHT' : 'SPEAKING')
  const bubble = error || (mode === 'listening' ? (caption || '…') : (mode === 'speaking' || (mode === 'idle' && reply)) ? reply : mode === 'thinking' ? caption : '')

  return (
    <div style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 200, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, pointerEvents: 'none' }}>
      {bubble && (
        <div style={{
          maxWidth: 360, padding: '11px 15px', borderRadius: '16px 16px 4px 16px', pointerEvents: 'auto',
          background: 'linear-gradient(135deg, rgba(10,26,58,0.92), rgba(4,12,30,0.92))', border: `1px solid ${error ? 'rgba(248,113,113,0.5)' : color + '66'}`,
          boxShadow: `0 10px 40px rgba(0,0,0,0.45), 0 0 30px ${color}22`, backdropFilter: 'blur(14px)',
          color: mode === 'listening' ? '#cfe8ff' : '#eef6ff', fontSize: 14, lineHeight: 1.5, fontStyle: mode === 'listening' ? 'italic' : 'normal',
          animation: 'ovIn .25s ease',
        }}>{bubble}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, pointerEvents: 'auto' }}>
        {active && (
          <button onClick={() => setLang(lang === 'de' ? 'en' : 'de')} title="language" style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1.5, padding: '5px 8px', borderRadius: 8, cursor: 'pointer', color: '#cfe8ff', background: 'rgba(6,16,38,0.75)', border: '1px solid rgba(120,200,255,0.25)', backdropFilter: 'blur(8px)' }}>
            {lang.toUpperCase()}
          </button>
        )}
        <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 2, color, padding: '5px 9px', borderRadius: 8, background: 'rgba(6,16,38,0.7)', border: `1px solid ${color}44`, backdropFilter: 'blur(8px)', transition: 'color .2s' }}>{label}</span>
        <button onClick={() => (active ? disarm() : arm())} title={active ? 'OREN Voice ausschalten' : 'OREN Voice einschalten'} aria-label="OREN voice" style={{
          width: 54, height: 54, borderRadius: '50%', cursor: 'pointer', border: `1px solid ${color}`, position: 'relative', padding: 0,
          background: active ? `radial-gradient(circle at 35% 30%, #ffffff, ${color} 35%, #06223f 100%)` : 'radial-gradient(circle at 35% 30%, #3a5a80, #0a1830 80%)',
          boxShadow: active ? `0 0 ${mode === 'idle' ? 16 : 34}px ${color}` : 'none',
          animation: mode === 'listening' ? 'ovPulse 1s ease-in-out infinite' : mode === 'speaking' ? 'ovPulse .6s ease-in-out infinite' : mode === 'thinking' ? 'ovSpin 1.2s linear infinite' : 'none',
          transition: 'box-shadow .3s',
        }}>
          {!active && <span style={{ fontSize: 18 }}>🎙</span>}
          {!supported && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#f87171', fontFamily: MONO }}>N/A</span>}
        </button>
      </div>
      <style>{`
        @keyframes ovIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
        @keyframes ovPulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.09) } }
        @keyframes ovSpin { from { filter: hue-rotate(0deg) } to { filter: hue-rotate(360deg) } }
      `}</style>
    </div>
  )
}
