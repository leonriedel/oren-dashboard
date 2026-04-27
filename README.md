# OREN Dashboard — Setup Guide
## riedel.ai → von Lovable zu eigenem Stack

---

## SCHRITT 1: Supabase Datenbank aufsetzen

1. Gehe zu **supabase.com** → dein Projekt `oren-memory`
2. Klicke links auf **SQL Editor**
3. Kopiere den kompletten Inhalt von `lib/schema.sql`
4. Paste in den SQL Editor → **Run**

✅ Alle Tabellen sind jetzt erstellt (priorities, goals, transactions, investments, etc.)

---

## SCHRITT 2: GitHub Repository erstellen

1. Gehe zu **github.com/leonriedel**
2. Klicke **New repository**
3. Name: `oren-dashboard`
4. Private ✓ (wichtig — sensible Daten!)
5. **Create repository**

Dann im Terminal (oder nutze GitHub Desktop):
```bash
cd oren-dashboard
git init
git add .
git commit -m "Initial OREN Dashboard"
git remote add origin https://github.com/leonriedel/oren-dashboard.git
git push -u origin main
```

---

## SCHRITT 3: Vercel Deployment

1. Gehe zu **vercel.com** → Login mit GitHub
2. **New Project** → Import `oren-dashboard`
3. Framework: **Next.js** (auto-detected)
4. **Environment Variables** hinzufügen (wichtig!):

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wrosllwfhekvtpwmyomr.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_SVomXbQP9bFLLCavk78bxw_biF1ropY` |
| `SUPABASE_SECRET_KEY` | *(dein secret key aus Supabase → API Keys)* |
| `ANTHROPIC_API_KEY` | *(dein Key von anthropic.com/account)* |

5. **Deploy** klicken

✅ OREN läuft jetzt auf `oren-dashboard.vercel.app`

---

## SCHRITT 4: Domain riedel.ai umzeigen

1. In Vercel: **Settings → Domains** → `riedel.ai` hinzufügen
2. Bei deinem Domain-Registrar (wo riedel.ai registriert ist):
   - DNS A Record: `76.76.21.21` (Vercel IP)
   - oder CNAME: `cname.vercel-dns.com`
3. In Lovable: Domain entfernen / Abo kündigen

✅ riedel.ai zeigt jetzt auf dein eigenes Dashboard!

---

## SCHRITT 5: Supabase Auth konfigurieren

1. In Supabase → **Authentication → URL Configuration**
2. Site URL: `https://riedel.ai`
3. Redirect URLs hinzufügen:
   - `https://riedel.ai/dashboard`
   - `https://oren-dashboard.vercel.app/dashboard`

---

## Lokale Entwicklung

```bash
# .env.local erstellen (Vorlage: .env.local.example)
cp .env.local.example .env.local
# Deine Keys eintragen

npm install
npm run dev
# → http://localhost:3000
```

---

## Struktur

```
oren-dashboard/
├── app/
│   ├── page.tsx              # Redirect → login oder dashboard
│   ├── login/page.tsx        # Login Screen
│   ├── dashboard/page.tsx    # Haupt-Dashboard
│   └── api/chat/route.ts     # Claude API Endpoint
├── components/
│   ├── ModuleLayout.tsx      # Shared header/layout
│   ├── UI.tsx                # Shared UI components
│   └── modules/
│       ├── SecondBrain.tsx
│       ├── Finances.tsx
│       ├── AllModules.tsx    # Investments, News, ThinkSpace, Sport, Social, Talk
│       └── ...
├── lib/
│   ├── supabase.ts           # Supabase client
│   └── schema.sql            # DB Schema → in SQL Editor ausführen
└── .env.local.example        # Keys Template
```

---

## Support

Änderungen? Schreib Leon einfach in Claude — screenshot schicken oder beschreiben, wird direkt gebaut. 🚀
