'use client'

import { useRouter } from 'next/navigation'

interface NavbarProps {
  userName: string
}

export default function Navbar({ userName }: NavbarProps) {
  const router = useRouter()

  const handleLogout = () => {
    localStorage.removeItem('token')
    router.push('/')
  }

  return (
    <nav style={styles.nav}>
      <div style={styles.left}>
        <span style={styles.brand}>Teacher Agent</span>
        <button onClick={() => router.push('/dashboard')} style={styles.navLink}>
          Dashboard
        </button>
        <button onClick={() => router.push('/classes')} style={styles.navLink}>
          Classes
        </button>
        <button onClick={() => router.push('/agent')} style={styles.navLink}>
          AI Assistant
        </button>
        <button onClick={() => router.push('/chat')} style={styles.navLink}>
          Chat
        </button>
        <button onClick={() => router.push('/test-results')} style={styles.navLink}>
          Tests
        </button>
      </div>
      <div style={styles.right}>
        {userName && <span style={styles.userName}>{userName}</span>}
        <button onClick={() => router.push('/settings')} style={styles.navLink}>
          Settings
        </button>
        <button onClick={handleLogout} style={styles.logoutButton}>
          Logout
        </button>
      </div>
    </nav>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 2rem',
    backgroundColor: '#1a73e8',
    color: 'white',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
  },
  brand: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
  },
  navLink: {
    background: 'none',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.9)',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.95rem',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  userName: {
    fontSize: '0.9rem',
  },
  logoutButton: {
    background: 'rgba(255, 255, 255, 0.2)',
    border: 'none',
    color: 'white',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
  },
}
