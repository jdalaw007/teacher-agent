'use client'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function Home() {
  const handleLogin = () => {
    window.location.href = `${API_URL}/auth/login`
  }

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <h1 style={styles.title}>Teacher Agent</h1>
        <p style={styles.description}>
          AI-powered teaching assistant for Google Classroom
        </p>
        <button onClick={handleLogin} style={styles.button}>
          Sign in with Google
        </button>
      </div>
    </main>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  main: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    padding: '2rem',
  },
  container: {
    textAlign: 'center',
    padding: '3rem',
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  title: {
    fontSize: '2.5rem',
    marginBottom: '1rem',
    color: '#1a73e8',
  },
  description: {
    fontSize: '1.1rem',
    color: '#666',
    marginBottom: '2rem',
  },
  button: {
    backgroundColor: '#1a73e8',
    color: 'white',
    border: 'none',
    padding: '12px 32px',
    fontSize: '1rem',
    borderRadius: '6px',
    cursor: 'pointer',
  },
}
