'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useIsMobile } from '@/lib/useIsMobile'
import { isMikha, MBadge } from '@/components/thinkspace/mikha'
import BoardEditor from '@/components/thinkspace/BoardEditor'

type Board = {
  id: string
  title: string
  emoji: string
  color: string
  created_by: string | null
  updated_at: string
  blockCount?: number
  mikhaCount?: number
}

type Block = {
  id: string
  board_id: string
  type: 'heading' | 'text' | 'todo'
  content: string
  done: boolean
  position: number
  created_by?: string | null
  updated_by?: string | null
}

const PRESET_COLORS = ['#80c0ff', '#34d399', '#fbbf24', '#f97316', '#a78bfa', '#ff6b6b', '#38bdf8']
const PRESET_EMOJIS = ['📋','💡','🎯','🚀','📊','✍️','🌱','🧠','📅','🛠','🏝','🏡','🎨']

export default function ThinkSpace({ onBack }: any) {
  const isMobile = useIsMobile()
  const [boards, setBoards] = useState<Board[]>([])
  const [currentBoard, setCurrentBoard] = useState<Board | null>(null)
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  const supabase = createClient()

  const loadBoards = useCallback(async () => {
    const { data: bs, error } = await supabase.from('workspace_boards').select('*').order('updated_at', { ascending: false })
    if (error) {
      console.error('loadBoards error:', error)
      setLoading(false)
      return
    }
    if (!bs) { setBoards([]); setLoading(false); return }
    // Fetch block counts
    const counts: Record<string, number> = {}
    const mikha: Record<string, number> = {}
    let res: any = await supabase.from('workspace_blocks').select('board_id,created_by,updated_by')
    if (res.error) res = await supabase.from('workspace_blocks').select('board_id,created_by')
    for (const b of res.data || []) {
      counts[b.board_id] = (counts[b.board_id] || 0) + 1
      if (isMikha(b.created_by) || isMikha(b.updated_by)) mikha[b.board_id] = (mikha[b.board_id] || 0) + 1
    }
    setBoards(bs.map(b => ({ ...b, blockCount: counts[b.id] || 0, mikhaCount: mikha[b.id] || 0 })))
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadBoards() }, [loadBoards])

  const createBoard = async (title: string, emoji: string, color: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error } = await supabase.from('workspace_boards').insert({
      title, emoji, color, created_by: user?.id
    }).select().single()
    if (error) {
      const msg = error.message || String(error)
      if (msg.includes('relation') || msg.includes('does not exist')) {
        alert('ThinkSpace tables not set up yet.\n\nRun lib/sql/thinkspace.sql in Supabase SQL editor once, then try again.')
      } else {
        alert('Create failed: ' + msg)
      }
      console.error('createBoard error:', error)
      return
    }
    setShowNew(false)
    if (data) setCurrentBoard(data as Board)
    loadBoards()
  }

  const deleteBoard = async (id: string) => {
    if (!confirm('Delete this board and all its content?')) return
    await supabase.from('workspace_boards').delete().eq('id', id)
    loadBoards()
  }

  // ─── DETAIL VIEW ──────────────────────────────────────────────
  if (currentBoard) {
    return <BoardEditor board={currentBoard} onBack={() => { setCurrentBoard(null); loadBoards() }} supabase={supabase} />
  }

  // ─── BOARDS GRID ──────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'#000', color:'#d0e5ff', padding: isMobile ? '14px 14px 80px' : '20px 28px', fontFamily:'Space Mono, monospace' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22, paddingBottom:14, borderBottom:'1px solid rgba(80,180,255,0.15)' }}>
        <div>
          <div style={{ fontSize:10, letterSpacing:3, color:'#80c0ff', marginBottom:4 }}>◇ THINKSPACE</div>
          <div style={{ fontSize:18, letterSpacing:1, color:'#f5f5f5', fontFamily:'Inter, sans-serif', fontWeight:300 }}>Shared Notes & Boards</div>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={() => setShowNew(true)} style={btnPrimary}>+ NEW BOARD</button>
          <button onClick={onBack} style={btnGhost}>← BACK</button>
        </div>
      </div>

      {showNew && <NewBoardForm onCancel={() => setShowNew(false)} onCreate={createBoard} />}

      {loading ? (
        <div style={{ fontSize:11, color:'rgba(128,192,255,0.4)', textAlign:'center', padding:40 }}>Loading boards...</div>
      ) : boards.length === 0 && !showNew ? (
        <div style={{ textAlign:'center', padding:60, color:'rgba(128,192,255,0.5)', border:'1px dashed rgba(80,180,255,0.2)', borderRadius:8 }}>
          <div style={{ fontSize:14, marginBottom:8 }}>No boards yet</div>
          <div style={{ fontSize:11, letterSpacing:1 }}>Click "+ NEW BOARD" to start</div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:14 }}>
          {boards.map(b => (
            <BoardTile key={b.id} board={b} onOpen={() => setCurrentBoard(b)} onDelete={() => deleteBoard(b.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// BOARD TILE
// ═══════════════════════════════════════════════════════════════

function BoardTile({ board, onOpen, onDelete }: any) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'rgba(15,30,55,0.75)' : 'rgba(8,20,48,0.55)',
        border: '1px solid rgba(80,180,255,0.18)',
        borderLeft: `3px solid ${board.color}`,
        borderRadius: 6, padding:'18px 16px',
        cursor:'pointer', transition:'all 0.2s ease',
        position:'relative', minHeight:120,
        display:'flex', flexDirection:'column', justifyContent:'space-between',
      }}
    >
      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          style={{
            position:'absolute', top:8, right:8,
            background:'transparent', border:'none', color:'rgba(255,107,107,0.65)',
            fontSize:14, cursor:'pointer', padding:4,
          }}
        >✕</button>
      )}
      <div>
        <div style={{ fontSize:28, marginBottom:10 }}>{board.emoji}</div>
        <div style={{
          fontFamily:'Inter, sans-serif', fontSize:17, fontWeight:600, color:'#f5f5f5',
          letterSpacing:0.3, lineHeight:1.2, display:'flex', alignItems:'center', flexWrap:'wrap',
        }}>{board.title}{isMikha(board.created_by) && <MBadge />}</div>
      </div>
      <div style={{
        marginTop:14, fontSize:9, letterSpacing:1.5, color:'rgba(128,192,255,0.45)',
        display:'flex', justifyContent:'space-between',
      }}>
        <span>{board.blockCount || 0} ITEMS{board.mikhaCount ? <span style={{ color: '#ff5fb7', marginLeft: 8 }}>● M {board.mikhaCount}</span> : null}</span>
        <span>OPEN →</span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// NEW BOARD FORM
// ═══════════════════════════════════════════════════════════════

function NewBoardForm({ onCancel, onCreate }: any) {
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('📋')
  const [color, setColor] = useState('#80c0ff')

  return (
    <div style={{ background:'rgba(10,20,35,0.7)', border:'1px solid rgba(80,180,255,0.3)', borderRadius:8, padding:18, marginBottom:18 }}>
      <div style={{ fontSize:10, letterSpacing:2.5, color:'#80c0ff', marginBottom:14 }}>◇ NEW BOARD</div>

      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Board title (e.g. Content Ideas, Q4 Planning, Design Notes)"
        autoFocus
        style={{
          width:'100%', background:'rgba(0,0,0,0.5)', border:'1px solid rgba(80,180,255,0.2)',
          borderRadius:4, padding:'10px 12px', color:'#f5f5f5', fontFamily:'Inter, sans-serif',
          fontSize:15, outline:'none', boxSizing:'border-box', marginBottom:14,
        }}
      />

      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
        {PRESET_EMOJIS.map(e => (
          <button key={e} onClick={() => setEmoji(e)} style={{
            background: emoji === e ? 'rgba(128,192,255,0.2)' : 'rgba(0,0,0,0.3)',
            border: emoji === e ? '1px solid rgba(128,192,255,0.6)' : '1px solid rgba(80,180,255,0.15)',
            borderRadius:4, padding:'8px 10px', cursor:'pointer', fontSize:16,
          }}>{e}</button>
        ))}
      </div>

      <div style={{ display:'flex', gap:6, marginBottom:16 }}>
        {PRESET_COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)} style={{
            width:24, height:24, borderRadius:12, cursor:'pointer',
            background:c, border: color === c ? '2px solid #fff' : '2px solid transparent',
          }} />
        ))}
      </div>

      <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
        <button onClick={onCancel} style={btnGhost}>CANCEL</button>
        <button onClick={() => title.trim() && onCreate(title.trim(), emoji, color)} style={btnPrimary}>CREATE</button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// BOARD DETAIL — blocks editor (text / heading / todo)
// ═══════════════════════════════════════════════════════════════

// ─── shared styles ──────────────────────────────────────────────

const btnPrimary: any = {
  background:'rgba(52,211,153,0.15)', border:'1px solid rgba(52,211,153,0.5)',
  color:'#34d399', padding:'8px 16px', fontFamily:'Space Mono, monospace',
  fontSize:10, letterSpacing:2, cursor:'pointer', borderRadius:4, fontWeight:700,
}
const btnGhost: any = {
  background:'transparent', border:'1px solid rgba(80,180,255,0.3)',
  color:'rgba(128,192,255,0.85)', padding:'8px 14px', fontFamily:'Space Mono, monospace',
  fontSize:10, letterSpacing:2, cursor:'pointer', borderRadius:4,
}
