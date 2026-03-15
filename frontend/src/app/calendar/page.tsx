'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface CalEvent {
  id: string
  title: string
  description: string
  start: string
  end: string
  all_day: boolean
  location: string
  html_link: string
}

function formatEventTime(dateStr: string, allDay: boolean): string {
  if (!dateStr) return ''
  if (allDay) {
    const [y, m, d] = dateStr.split('-')
    return new Date(Number(y), Number(m) - 1, Number(d))
      .toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  }
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function getDayLabel(dateStr: string, allDay: boolean): string {
  const date = allDay
    ? (() => { const [y, m, d] = dateStr.split('-'); return new Date(Number(y), Number(m) - 1, Number(d)) })()
    : new Date(dateStr)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
  const eventDay = new Date(date); eventDay.setHours(0, 0, 0, 0)
  if (eventDay.getTime() === today.getTime()) return 'Today'
  if (eventDay.getTime() === tomorrow.getTime()) return 'Tomorrow'
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

function groupByDay(events: CalEvent[]): { label: string; events: CalEvent[] }[] {
  const map = new Map<string, CalEvent[]>()
  for (const ev of events) {
    const key = ev.all_day ? ev.start.slice(0, 10) : new Date(ev.start).toDateString()
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(ev)
  }
  return Array.from(map.entries()).map(([, evs]) => ({
    label: getDayLabel(evs[0].start, evs[0].all_day),
    events: evs,
  }))
}

export default function CalendarPage() {
  const router = useRouter()
  const [events, setEvents] = useState<CalEvent[] | null>(null)
  const [error, setError] = useState('')
  const [daysAhead, setDaysAhead] = useState(14)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/'); return }
    setEvents(null)
    setError('')
    fetch(`${API_URL}/calendar/events?max_results=30&days_ahead=${daysAhead}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async r => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}))
          throw new Error(d.detail || `HTTP ${r.status}`)
        }
        return r.json()
      })
      .then(d => setEvents(d.events || []))
      .catch(e => setError(e.message || 'Unknown error'))
  }, [router, daysAhead])

  const groups = events ? groupByDay(events) : []

  return (
    <div style={s.page}>
      <Sidebar />
      <div style={s.body}>
        <div style={s.header}>
          <div>
            <h1 style={s.title}>Calendar</h1>
            <p style={s.sub}>Upcoming events from your Google Calendar</p>
          </div>
          <div style={s.rangeRow}>
            {[7, 14, 30].map(d => (
              <button
                key={d}
                style={{ ...s.rangeBtn, ...(daysAhead === d ? s.rangeBtnActive : {}) }}
                onClick={() => setDaysAhead(d)}
              >
                {d === 7 ? '1 week' : d === 14 ? '2 weeks' : '1 month'}
              </button>
            ))}
          </div>
        </div>

        {events === null && !error && (
          <div style={s.center}><span style={{ color: '#aaa' }}>Loading...</span></div>
        )}

        {error && (
          <div style={s.center}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ddd" strokeWidth="1.2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <div style={s.emptyTitle}>Could not load calendar</div>
            <div style={s.emptyHint}>{error}</div>
            <button
              style={s.reloginBtn}
              onClick={() => { localStorage.removeItem('token'); window.location.href = `${API_URL}/auth/login` }}
            >
              Sign in again to enable
            </button>
          </div>
        )}

        {events !== null && !error && events.length === 0 && (
          <div style={s.center}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ddd" strokeWidth="1.2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <div style={s.emptyTitle}>No upcoming events</div>
            <div style={s.emptyHint}>Nothing scheduled in the next {daysAhead} days.</div>
          </div>
        )}

        {events !== null && !error && events.length > 0 && (
          <div style={s.feed}>
            {groups.map((group, gi) => (
              <div key={gi} style={s.group}>
                <div style={s.dayLabel}>{group.label}</div>
                {group.events.map(ev => (
                  <div key={ev.id} style={s.eventCard}>
                    <div style={s.eventLeft}>
                      <div style={s.eventDot} />
                    </div>
                    <div style={s.eventBody}>
                      <div style={s.eventTitle}>{ev.title}</div>
                      <div style={s.eventTime}>
                        {ev.all_day ? 'All day' : formatEventTime(ev.start, false).split('·')[1]?.trim()}
                      </div>
                      {ev.location && (
                        <div style={s.eventMeta}>{ev.location}</div>
                      )}
                      {ev.description && (
                        <div style={s.eventMeta}>{ev.description.slice(0, 120)}{ev.description.length > 120 ? '…' : ''}</div>
                      )}
                    </div>
                    {ev.html_link && (
                      <a href={ev.html_link} target="_blank" rel="noopener noreferrer" style={s.openLink}>
                        Open
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const s: { [k: string]: React.CSSProperties } = {
  page: { display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: '#f0f2f5' },
  body: { flex: 1, overflowY: 'auto', padding: '28px 32px' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' },
  title: { fontSize: '1.4rem', fontWeight: 700, color: '#333', margin: '0 0 4px' },
  sub: { fontSize: '0.88rem', color: '#888', margin: 0 },
  rangeRow: { display: 'flex', gap: '6px' },
  rangeBtn: {
    padding: '6px 14px', borderWidth: '1.5px', borderStyle: 'solid', borderColor: '#ddd', borderRadius: '20px',
    background: 'white', color: '#555', cursor: 'pointer', fontSize: '0.84rem',
  },
  rangeBtnActive: { borderColor: '#1a73e8', backgroundColor: '#e8f0fe', color: '#1a73e8', fontWeight: 600 },

  center: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', height: '60vh', gap: '12px',
  },
  emptyTitle: { fontSize: '1rem', fontWeight: 600, color: '#ccc' },
  emptyHint: { fontSize: '0.85rem', color: '#ddd' },
  reloginBtn: {
    marginTop: '4px', padding: '8px 18px', backgroundColor: '#1a73e8',
    color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.88rem',
  },

  feed: { display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '680px' },
  group: {},
  dayLabel: {
    fontSize: '0.78rem', fontWeight: 700, color: '#888', textTransform: 'uppercase',
    letterSpacing: '0.06em', marginBottom: '8px',
  },
  eventCard: {
    backgroundColor: '#fff', borderRadius: '10px', padding: '14px 16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '8px',
    display: 'flex', alignItems: 'flex-start', gap: '12px',
  },
  eventLeft: { paddingTop: '5px' },
  eventDot: {
    width: '8px', height: '8px', borderRadius: '50%',
    backgroundColor: '#1a73e8', flexShrink: 0,
  },
  eventBody: { flex: 1 },
  eventTitle: { fontSize: '0.95rem', fontWeight: 600, color: '#222', marginBottom: '3px' },
  eventTime: { fontSize: '0.82rem', color: '#1a73e8', marginBottom: '3px' },
  eventMeta: { fontSize: '0.8rem', color: '#888', marginTop: '2px' },
  openLink: {
    fontSize: '0.78rem', color: '#1a73e8', textDecoration: 'none',
    padding: '3px 8px', border: '1px solid #c5d9f7', borderRadius: '6px',
    alignSelf: 'center', whiteSpace: 'nowrap' as const,
  },
}
