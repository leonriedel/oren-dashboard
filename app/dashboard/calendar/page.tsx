'use client'
import { useRouter } from 'next/navigation'

export default function CalendarPage() {
  const router = useRouter()

  // Google embed — Leon's primary calendar. Timezone: Asia/Makassar.
  const email = 'leon@riedel.ai'
  const src = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(email)}&ctz=Asia%2FMakassar&mode=WEEK&bgcolor=%23000000&color=%2380c0ff&showTitle=0&showPrint=0&showCalendars=0&showTz=1`

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#d0e5ff', padding: '20px 28px', fontFamily: 'Space Mono, monospace' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid rgba(80,180,255,0.15)' }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 3, color: '#80c0ff', marginBottom: 4 }}>◉ CALENDAR</div>
          <div style={{ fontSize: 18, letterSpacing: 1, color: '#f5f5f5', fontFamily: 'Inter, sans-serif', fontWeight: 300 }}>Google Calendar · Live Sync</div>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          style={{
            background: 'rgba(10,20,35,0.6)',
            border: '1px solid rgba(80,180,255,0.2)',
            color: '#80c0ff',
            padding: '8px 16px',
            fontFamily: 'inherit',
            fontSize: 10,
            letterSpacing: 2,
            cursor: 'pointer',
            borderRadius: 4,
          }}
        >
          ← BACK
        </button>
      </div>

      <div style={{ background: 'rgba(5,10,18,0.75)', border: '1px solid rgba(80,180,255,0.15)', borderRadius: 8, padding: 2, overflow: 'hidden' }}>
        <iframe
          src={src}
          style={{ border: 0, width: '100%', height: 'calc(100vh - 140px)', background: '#000', borderRadius: 6 }}
          title="Google Calendar"
        />
      </div>

      <div style={{ marginTop: 10, fontSize: 9, letterSpacing: 1.5, color: 'rgba(128,192,255,0.4)', textAlign: 'center' }}>
        Oren can create events via chat · Changes here write back to Google Calendar
      </div>
    </div>
  )
}
