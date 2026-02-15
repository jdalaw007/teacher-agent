'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import AssignmentList from '@/components/AssignmentList'
import StudentList from '@/components/StudentList'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Course {
  id: string
  name: string
  section?: string
  description?: string
}

interface Assignment {
  id: string
  title: string
  description?: string
  state?: string
  dueDate?: { year: number; month: number; day: number }
}

interface Student {
  id: number
  classroom_user_id: string | null
  name: string
  email: string
  class_id: string
  notes: string
  created_at: string
  updated_at: string
}

export default function ClassPage() {
  const params = useParams()
  const router = useRouter()
  const courseId = params.id as string

  const [course, setCourse] = useState<Course | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [showAddStudent, setShowAddStudent] = useState(false)
  const [newStudentName, setNewStudentName] = useState('')
  const [newStudentEmail, setNewStudentEmail] = useState('')
  const [importingRoster, setImportingRoster] = useState(false)
  const [studentMessage, setStudentMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/')
      return
    }

    const fetchData = async () => {
      try {
        const [courseRes, assignmentsRes] = await Promise.all([
          fetch(`${API_URL}/classroom/courses/${courseId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API_URL}/classroom/courses/${courseId}/assignments`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ])

        if (!courseRes.ok || !assignmentsRes.ok) {
          throw new Error('Failed to fetch data')
        }

        const courseData = await courseRes.json()
        const assignmentsData = await assignmentsRes.json()

        setCourse(courseData)
        setAssignments(assignmentsData.assignments || [])
      } catch (err) {
        setError('Failed to load class data.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [courseId, router])

  const fetchStudents = async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/students/list?class_id=${courseId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setStudents(data.students || [])
      }
    } catch {
      // silent
    }
  }

  useEffect(() => {
    if (!loading && course) fetchStudents()
  }, [loading, course])

  const handleImportRoster = async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    setImportingRoster(true)
    setStudentMessage(null)
    try {
      const res = await fetch(`${API_URL}/students/import-roster`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ class_id: courseId }),
      })
      if (res.ok) {
        const data = await res.json()
        setStudentMessage({
          type: 'success',
          text: `Imported ${data.imported} student(s), ${data.skipped} already existed.`,
        })
        fetchStudents()
      } else {
        const err = await res.json()
        setStudentMessage({ type: 'error', text: err.detail || 'Import failed' })
      }
    } catch {
      setStudentMessage({ type: 'error', text: 'Failed to import roster' })
    } finally {
      setImportingRoster(false)
    }
  }

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newStudentName) return
    const token = localStorage.getItem('token')
    setStudentMessage(null)
    try {
      const res = await fetch(`${API_URL}/students/add`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          class_id: courseId,
          name: newStudentName,
          email: newStudentEmail,
        }),
      })
      if (res.ok) {
        setNewStudentName('')
        setNewStudentEmail('')
        setShowAddStudent(false)
        setStudentMessage({ type: 'success', text: 'Student added!' })
        fetchStudents()
      } else {
        const err = await res.json()
        setStudentMessage({ type: 'error', text: err.detail || 'Add failed' })
      }
    } catch {
      setStudentMessage({ type: 'error', text: 'Failed to add student' })
    }
  }

  if (loading) {
    return (
      <div style={styles.loading}>
        <p>Loading...</p>
      </div>
    )
  }

  if (error || !course) {
    return (
      <div style={styles.error}>
        <p>{error || 'Class not found'}</p>
        <button onClick={() => router.push('/dashboard')} style={styles.button}>
          Back to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div>
      <Navbar userName="" />
      <main style={styles.main}>
        <button onClick={() => router.push('/dashboard')} style={styles.backButton}>
          &larr; Back to Classes
        </button>
        <h1 style={styles.title}>{course.name}</h1>
        {course.section && <p style={styles.section}>{course.section}</p>}
        {course.description && <p style={styles.description}>{course.description}</p>}

        <h2 style={styles.subtitle}>Students ({students.length})</h2>

        {studentMessage && (
          <div style={studentMessage.type === 'success' ? styles.successMsg : styles.errorMsg}>
            {studentMessage.text}
          </div>
        )}

        <div style={styles.studentActions}>
          <button onClick={handleImportRoster} disabled={importingRoster} style={styles.importButton}>
            {importingRoster ? 'Importing...' : 'Import from Classroom'}
          </button>
          <button onClick={() => setShowAddStudent(!showAddStudent)} style={styles.addButton}>
            {showAddStudent ? 'Cancel' : 'Add Student'}
          </button>
        </div>

        {showAddStudent && (
          <form onSubmit={handleAddStudent} style={styles.addForm}>
            <input
              type="text"
              placeholder="Student Name"
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
              style={styles.formInput}
              required
            />
            <input
              type="email"
              placeholder="Email (optional)"
              value={newStudentEmail}
              onChange={(e) => setNewStudentEmail(e.target.value)}
              style={styles.formInput}
            />
            <button type="submit" style={styles.submitButton}>Add</button>
          </form>
        )}

        <StudentList
          students={students}
          onStudentUpdated={fetchStudents}
          onStudentDeleted={fetchStudents}
        />

        <h2 style={styles.subtitle}>Assignments</h2>
        <AssignmentList assignments={assignments} courseId={courseId} />
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
    marginBottom: '0.5rem',
    color: '#333',
  },
  section: {
    color: '#666',
    marginBottom: '0.5rem',
  },
  description: {
    color: '#666',
    marginBottom: '2rem',
  },
  subtitle: {
    marginTop: '2rem',
    marginBottom: '1rem',
    color: '#333',
  },
  backButton: {
    background: 'none',
    border: 'none',
    color: '#1a73e8',
    cursor: 'pointer',
    marginBottom: '1rem',
    fontSize: '1rem',
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
  studentActions: {
    display: 'flex',
    gap: '0.75rem',
    marginBottom: '1rem',
  },
  importButton: {
    padding: '10px 20px',
    background: '#1a73e8',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  addButton: {
    padding: '10px 20px',
    background: '#28a745',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  addForm: {
    display: 'flex',
    gap: '0.75rem',
    marginBottom: '1rem',
    padding: '1rem',
    background: '#f8f9fa',
    borderRadius: '8px',
    alignItems: 'center',
  },
  formInput: {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '0.9rem',
  },
  submitButton: {
    padding: '8px 20px',
    background: '#28a745',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  successMsg: {
    padding: '10px 14px',
    background: '#d4edda',
    color: '#155724',
    borderRadius: '6px',
    marginBottom: '1rem',
    fontSize: '0.9rem',
  },
  errorMsg: {
    padding: '10px 14px',
    background: '#f8d7da',
    color: '#721c24',
    borderRadius: '6px',
    marginBottom: '1rem',
    fontSize: '0.9rem',
  },
}
