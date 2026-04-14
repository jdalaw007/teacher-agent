'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname() || ''
  const [avatar, setAvatar] = useState<{ picture?: string; name?: string; email?: string } | null>(null)
  const t = useTranslations('nav')

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    fetch(`${API_URL}/auth/user`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setAvatar({ picture: d.picture, name: d.name, email: d.email }) })
      .catch(() => {})
  }, [])

  const active = (path: string) =>
    pathname === path || (path !== '/dashboard' && pathname.startsWith(path))

  const navItems = [
    { label: t('dashboard'), path: '/dashboard', icon: <GridIcon /> },
    { label: t('classes'), path: '/classes', icon: <BookIcon /> },
    { label: t('files'), path: '/files', icon: <FolderIcon /> },
    { label: t('inbox'), path: '/inbox', icon: <InboxIcon /> },
    { label: t('calendar'), path: '/calendar', icon: <CalendarIcon /> },
    { label: 'Testy', path: '/tests', icon: <TestIcon /> },
  ]

  return (
    <aside style={s.bar}>
      <div style={s.logo} onClick={() => router.push('/dashboard')}>
        <SendIcon />
      </div>

      <button
        onClick={() => router.push('/settings')}
        style={{ ...s.btn, ...(pathname === '/settings' ? s.btnActive : {}), marginBottom: '8px' }}
        title={avatar?.name || t('profile')}
      >
        <div style={s.avatarWrap}>
          {avatar?.picture
            ? <img src={avatar.picture} alt={avatar.name || t('profile')} style={s.avatarImg} referrerPolicy="no-referrer" />
            : <div style={s.avatarInitials}>{avatar?.name ? avatar.name[0].toUpperCase() : <PersonIcon />}</div>
          }
        </div>
        <span style={{ ...s.lbl, color: pathname === '/settings' ? '#fff' : '#9aa0a6' }}>{t('profile')}</span>
      </button>

      <nav style={s.nav}>
        {navItems.map((item) => {
          const isActive = active(item.path)
          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              style={{ ...s.btn, ...(isActive ? s.btnActive : {}) }}
              title={item.label}
            >
              <span style={{ color: isActive ? '#fff' : '#9aa0a6' }}>{item.icon}</span>
              <span style={{ ...s.lbl, color: isActive ? '#fff' : '#9aa0a6' }}>{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div style={s.foot}>
        {avatar?.email === 'smith@plaminkova.cz' && (
          <button
            onClick={() => router.push('/admin')}
            style={{ ...s.btn, ...(pathname === '/admin' ? s.btnActive : {}) }}
            title={t('admin')}
          >
            <span style={{ color: pathname === '/admin' ? '#fff' : '#9aa0a6' }}>
              <ShieldIcon />
            </span>
            <span style={{ ...s.lbl, color: pathname === '/admin' ? '#fff' : '#9aa0a6' }}>
              {t('admin')}
            </span>
          </button>
        )}
        <button
          onClick={() => router.push('/settings')}
          style={{ ...s.btn, ...(pathname === '/settings' ? s.btnActive : {}) }}
          title={t('settings')}
        >
          <span style={{ color: pathname === '/settings' ? '#fff' : '#9aa0a6' }}>
            <GearIcon />
          </span>
          <span style={{ ...s.lbl, color: pathname === '/settings' ? '#fff' : '#9aa0a6' }}>
            {t('settings')}
          </span>
        </button>
      </div>
    </aside>
  )
}

function SendIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <polygon points="22 2 15 22 11 13 2 9 22 2" fill="#1a73e8" />
    </svg>
  )
}

function GridIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  )
}

function BookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function InboxIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )
}

function TestIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8z" />
      <polyline points="17 3 17 8 12 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="12" y2="17" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

const s: { [key: string]: React.CSSProperties } = {
  bar: {
    width: '80px',
    height: '100vh',
    backgroundColor: '#fff',
    borderRight: '1px solid #e8eaed',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    paddingTop: '20px',
    paddingBottom: '16px',
    flexShrink: 0,
  },
  logo: {
    width: '48px',
    height: '48px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '20px',
    cursor: 'pointer',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    flex: 1,
    width: '100%',
    padding: '0 8px',
  },
  btn: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '10px 4px 8px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    borderRadius: '10px',
  },
  btnActive: {
    backgroundColor: '#1a73e8',
  },
  lbl: {
    fontSize: '0.6rem',
    fontWeight: 500,
    letterSpacing: '0.01em',
    textAlign: 'center' as const,
  },
  foot: {
    width: '100%',
    padding: '0 8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  avatarWrap: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    overflow: 'hidden',
    cursor: 'pointer',
    flexShrink: 0,
    marginBottom: '4px',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  avatarInitials: {
    width: '100%',
    height: '100%',
    backgroundColor: '#1a73e8',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1rem',
    fontWeight: 600,
  },
}
