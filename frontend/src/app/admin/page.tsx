'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { useTranslations } from 'next-intl'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface FeedbackEntry {
  id: number
  user_id: string
  message: string
  created_at: string
}

export default function AdminPage() {
  const router = useRouter()
  const t = useTranslations('admin')
  const tCommon = useTranslations('common')
  const [feedback, setFeedback] = useState<FeedbackEntry[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/'); return }
    fetch(`${API_URL}/feedback/all`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async r => {
        if (r.status === 403) throw new Error('Admin only')
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => setFeedback(d.feedback || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [router])

  if (loading) return <div style={s.center}>{tCommon('loading')}</div>
  if (error) return <div style={s.center}><div style={s.error}>{error}</div></div>

  return (
    <div style={s.app}>
      <Sidebar />
      <div style={s.body}>
        <div style={s.header}>
          <h1 style={s.title}>{t('title')}</h1>
          <span style={s.count}>
            {feedback.length !== 1 ? t('submissionsPlural', { count: feedback.length }) : t('submissions', { count: feedback.length })}
          </span>
        </div>

        {feedback.length === 0 ? (
          <div style={s.empty}>{t('noFeedback')}</div>
        ) : (
          <div style={s.list}>
            {feedback.map(f => (
              <div key={f.id} style={s.card}>
                <div style={s.cardMeta}>
                  <span style={s.userId}>{f.user_id}</span>
                  <span style={s.date}>{new Date(f.created_at).toLocaleString()}</span>
                </div>
                <div style={s.message}>{f.message}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const s: { [k: string]: React.CSSProperties } = {
  app: { display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: '#f0f2f5' },
  body: { flex: 1, overflowY: 'auto', padding: '40px 32px' },
  center: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#888' },
  error: { color: '#e57373', fontSize: '1rem' },
  header: { display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '28px' },
  title: { fontSize: '1.4rem', fontWeight: 700, color: '#333', margin: 0 },
  count: { fontSize: '0.88rem', color: '#aaa' },
  empty: { color: '#bbb', fontSize: '1rem', textAlign: 'center' as const, marginTop: '60px' },
  list: { display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '720px' },
  card: {
    backgroundColor: '#fff', borderRadius: '10px', padding: '16px 20px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  },
  cardMeta: { display: 'flex', justifyContent: 'space-between', marginBottom: '8px' },
  userId: { fontSize: '0.78rem', color: '#bbb', fontFamily: 'monospace' },
  date: { fontSize: '0.78rem', color: '#bbb' },
  message: { fontSize: '0.92rem', color: '#333', lineHeight: 1.6 },
}
