'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import ClassList from '@/components/ClassList'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Course {
  id: string
  name: string
  section?: string
  description?: string
}

export default function Dashboard() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<{ name: string; email: string } | null>(null)

  useEffect(() => {
    const tokenFromUrl = searchParams.get('token')
    if (tokenFromUrl) {
      localStorage.setItem('token', tokenFromUrl)
      router.replace('/dashboard')
    }
  }, [searchParams, router])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/')
      return
    }

    const fetchData = async () => {
      try {
        const [userRes, coursesRes] = await Promise.all([
          fetch(`${API_URL}/auth/user`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/classroom/courses`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ])

        if (!userRes.ok || !coursesRes.ok) {
          throw new Error('Failed to fetch data')
        }

        const userData = await userRes.json()
        const coursesData = await coursesRes.json()

        setUser(userData)
        setCourses(coursesData.courses || [])
      } catch (err) {
        setError('Failed to load data. Please try logging in again.')
        localStorage.removeItem('token')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router])

  if (loading) {
    return (
      <div style={styles.loading}>
        <p>Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={styles.error}>
        <p>{error}</p>
        <button onClick={() => router.push('/')} style={styles.button}>
          Back to Login
        </button>
      </div>
    )
  }

  return (
    <div>
      <Navbar userName={user?.name || ''} />
      <main style={styles.main}>
        <h1 style={styles.title}>Your Classes</h1>
        <ClassList courses={courses} />
      </main>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  main: {
    padding: '2rem',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  title: {
    marginBottom: '1.5rem',
    color: '#333',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
  },
  error: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    gap: '1rem',
  },
  button: {
    backgroundColor: '#1a73e8',
    color: 'white',
    border: 'none',
    padding: '10px 24px',
    borderRadius: '6px',
    cursor: 'pointer',
  },
}
