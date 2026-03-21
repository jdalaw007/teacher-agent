'use client'

import Sidebar from '@/components/Sidebar'
import { useTranslations } from 'next-intl'

export default function InboxPage() {
  const t = useTranslations('inbox')
  return (
    <div style={styles.app}>
      <Sidebar />
      <div style={styles.body}>
        <div style={styles.header}>
          <span style={styles.title}>{t('title')}</span>
        </div>
        <div style={styles.placeholder}>
          <div style={styles.placeholderIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
              <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
            </svg>
          </div>
          <div style={styles.placeholderTitle}>{t('gmailTitle')}</div>
          <div style={styles.placeholderText}>{t('gmailComingSoon')}</div>
        </div>
      </div>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  app: { display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: '#f0f2f5' },
  body: { flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 28px', overflow: 'hidden' },
  header: { marginBottom: '24px' },
  title: { fontSize: '1.4rem', fontWeight: 700, color: '#333' },
  placeholder: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#aaa',
    gap: '12px',
  },
  placeholderIcon: { marginBottom: '4px' },
  placeholderTitle: { fontSize: '1.1rem', fontWeight: 600, color: '#bbb' },
  placeholderText: { fontSize: '0.9rem', color: '#ccc', maxWidth: '320px', textAlign: 'center' as const },
}
