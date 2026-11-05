# OREN Dashboard — Roadmap

## Done ✅

### Core
- Multi-user with roles (admin / viewer)
- Mikha viewer account (edgar + investments locked with 🔒 icon)
- Full English UI across all modules
- SocialMedia module removed

### Calendar
- Google Calendar read via iCal feed (with ical.js — recurring events expand correctly, timezone-aware)
- UPCOMING panel on mainpage: today / tomorrow / day-after, grouped, with weekday + date
- Auto-refresh every 2 minutes + on tab focus
- Full-page iframe view on `/dashboard/calendar` (Google's UI, read-only from our side)

### ThinkSpace v2
- Shared Notion-style boards (Leon + Mikha collaborate)
- Boards with emoji + color + title
- Blocks per board: heading / text / todo
- Full CRUD, inline editing

### Real Estate
- New module replaces Social Media
- CRUD projects (name, status, location, invested, current value, notes)
- Portfolio summary stats (total invested, current value, gain/loss %)

### Other
- Oren inline input bar removed (Mikha shouldn't talk to Oren)
- Talk-to-Oren screen removed from dashboard
- Weather widget (Tallinn / Mallorca / Canggu / Wildeshausen) with Bali as HOME
- Open-Meteo (free, no key)

---

## Near-term (next session)

### Calendar — in-site editing (Level 2)
**Blocker:** Needs Google OAuth setup.
- Create Google Cloud Project + OAuth client (Leon, ~15 min)
- Set 3 env vars in Vercel: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
- Visit `/api/auth/google` once to grab refresh token
- Then build: "+ NEW EVENT" button on UPCOMING panel → modal → saves to Google Calendar

### Calendar — Level 3
- Edit / delete existing events from dashboard
- Drag-to-move (optional)

---

## Backlog (Leon's ideas, 2026-11-05)

### Trading & Finance
- [ ] **IBKR stocks integration** — Interactive Brokers has an API; pull current positions + P/L into INVESTMENTS module
- [ ] **Edgar Live Screening** — plug the trading bot's live signals into the Edgar module (currently shows Alpaca paper trades only)

### Communication
- [ ] **Mail integration + automation** — read inbox, triage with Oren, draft replies, send
- [ ] **WhatsApp bridge** — Leon's girlfriend uses Claude as mail + WhatsApp tool (currently can't; needs research — maybe WA Web via puppeteer, or official WA Business API)

### Nice-to-have
- [ ] Admin-only access point for Leon to talk to Oren again (if wanted later)
- [ ] Mobile-optimised view (responsive already partly there via `useIsMobile`)
- [ ] Realtime sync (Supabase channels) for shared ThinkSpace boards so Leon + Mikha see each other's edits live

---

## Setup checklist (one-time, run manually)

- [ ] `node lib/setup_mikha.mjs` — creates mikha@riedel.ai (pw: baleo2026) and promotes leon@riedel.ai to admin
- [ ] Run `lib/sql/real_estate.sql` in Supabase SQL editor
- [ ] Run `lib/sql/thinkspace.sql` in Supabase SQL editor
- [ ] (Future) Google OAuth setup for calendar write access
