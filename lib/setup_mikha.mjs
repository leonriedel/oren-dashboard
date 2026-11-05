// Creates Mikha user + sets admin/viewer roles via Supabase admin API
// Run from project root:   node lib/setup_mikha.mjs
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
const env = {}
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.+)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY
if (!url || !serviceKey) { console.error('Missing env vars in .env.local'); process.exit(1) }

const sb = createClient(url, serviceKey, { auth: { persistSession: false } })

console.log('→ Creating mikha@riedel.ai ...')
const { data: created, error: createErr } = await sb.auth.admin.createUser({
  email: 'mikha@riedel.ai',
  password: 'baleo2026',
  email_confirm: true,
  user_metadata: { name: 'Mikha', role: 'viewer' },
  app_metadata: { role: 'viewer' }
})

if (createErr) {
  const msg = (createErr.message || '').toLowerCase()
  if (msg.includes('already') || msg.includes('exists') || createErr.code === 'email_exists') {
    console.log('  user already exists, updating ...')
    const { data: list } = await sb.auth.admin.listUsers()
    const existing = list?.users.find(u => u.email === 'mikha@riedel.ai')
    if (existing) {
      const { error: updErr } = await sb.auth.admin.updateUserById(existing.id, {
        password: 'baleo2026',
        user_metadata: { name: 'Mikha', role: 'viewer' },
        app_metadata: { role: 'viewer' }
      })
      if (updErr) { console.error('Update failed:', updErr); process.exit(1) }
      console.log('  ✓ Mikha updated (id:', existing.id + ')')
    }
  } else {
    console.error('Create failed:', createErr)
    process.exit(1)
  }
} else {
  console.log('  ✓ Mikha created (id:', created.user.id + ')')
}

console.log('→ Setting leon@riedel.ai → admin ...')
const { data: list2 } = await sb.auth.admin.listUsers()
const leon = list2?.users.find(u => u.email === 'leon@riedel.ai')
if (leon) {
  const { error: leonErr } = await sb.auth.admin.updateUserById(leon.id, {
    app_metadata: { ...(leon.app_metadata || {}), role: 'admin' },
    user_metadata: { ...(leon.user_metadata || {}), role: 'admin', name: leon.user_metadata?.name || 'Leon' }
  })
  if (leonErr) { console.error('Leon update failed:', leonErr); process.exit(1) }
  console.log('  ✓ Leon marked admin (id:', leon.id + ')')
} else {
  console.log('  ! leon@riedel.ai not found — skipping')
}

console.log('\n=== All users ===')
const { data: finalList } = await sb.auth.admin.listUsers()
for (const u of finalList?.users || []) {
  const role = u.app_metadata?.role || u.user_metadata?.role || '(none)'
  console.log('  -', u.email, '| role:', role)
}
