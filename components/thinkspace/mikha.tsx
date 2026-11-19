// Mikha marker: everything written or last edited by someone other than Leon gets a pink M
export const LEON_ID = '453d97b5-1e01-48c5-9f0b-8345039b3dca'
export const isMikha = (id?: string | null) => !!id && id !== LEON_ID

export function MBadge({ edited, count }: { edited?: boolean; count?: number }) {
  return (
    <span title={edited ? 'edited by Mikha' : 'written by Mikha'} style={{
      display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0, alignSelf: 'center',
      fontFamily: 'Space Mono, monospace', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5,
      color: '#ff5fb7', padding: '1px 6px', borderRadius: 6, marginLeft: 6,
      background: edited ? 'transparent' : 'rgba(255,95,183,0.14)', border: '1px solid rgba(255,95,183,0.55)',
      boxShadow: '0 0 8px rgba(255,95,183,0.25)',
    }}>M{edited ? '✎' : ''}{count ? ` ${count}` : ''}</span>
  )
}
