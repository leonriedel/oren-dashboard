# Weather Widget Integration

## 1. Dateien kopieren

```bash
mkdir -p app/api/weather
cp ~/Downloads/weather-route.ts app/api/weather/route.ts
cp ~/Downloads/Weather.tsx components/modules/Weather.tsx
```

## 2. In Dashboard einbauen

Öffne `app/dashboard/page.tsx` und füge am Anfang (bei den anderen Imports) hinzu:

```tsx
import Weather from '@/components/modules/Weather'
```

Dann im Return-Block der Mainpage (nach dem Time-Card Block), fügst du ein:

```tsx
<div style={{ width: '100%', maxWidth: 480, marginBottom: 20 }}>
  <Weather />
</div>
```

## 3. Deploy

```bash
git add -A
git commit -m "add weather widget — 4 cities"
git push
```

## Was es tut

- Zieht Live-Wetter für Tallinn, Mallorca, Canggu, Wildeshausen
- Open-Meteo API (kein API-Key nötig, free, unlimited)
- Caching: 30 Min Server-Side, Auto-Refresh im Frontend alle 30 Min
- Canggu hat Gold-Border + "HOME" Label
- Celsius, 7-Tage Hi/Lo nicht genutzt (nur heute H/L), Niederschlag %
