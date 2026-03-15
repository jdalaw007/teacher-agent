'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'

interface Course {
  id: string
  name: string
  section?: string
  description?: string
}

interface LinkedClassGroup {
  id: number
  link_name: string
  class_ids: string[]
  created_at: string
}

export default function ClassesPage() {
  const router = useRouter()
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [linkedGroups, setLinkedGroups] = useState<LinkedClassGroup[]>([])
  const [showCreateLink, setShowCreateLink] = useState(false)
  const [newLinkName, setNewLinkName] = useState('')
  const [selectedLinkClassIds, setSelectedLinkClassIds] = useState<Set<string>>(new Set())
  const [linkMessage, setLinkMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [classPrefs, setClassPrefs] = useState<Record<string, boolean>>({})
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      router.push('/')
      return
    }

    Promise.all([
      fetch(`${API_URL}/auth/user`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/classroom/courses`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_URL}/class-preferences/`, { headers: { Authorization: `Bearer ${token}` } }),
    ]).then(async ([userRes, coursesRes, prefsRes]) => {
      if (!userRes.ok) {
        localStorage.removeItem('token')
        router.push('/')
        return
      }
      if (coursesRes.ok) {
        const data = await coursesRes.json()
        setCourses(data.courses || [])
      }
      if (prefsRes.ok) {
        const data = await prefsRes.json()
        setClassPrefs(data.preferences || {})
      }
    }).finally(() => setLoading(false))
  }, [router])

  const fetchLinkedGroups = async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/linked-classes/list`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setLinkedGroups(data.links || [])
      }
    } catch {
      // silent
    }
  }

  useEffect(() => {
    if (!loading && courses.length > 0) fetchLinkedGroups()
  }, [loading, courses])

  const toggleLinkClassId = (classId: string) => {
    setSelectedLinkClassIds(prev => {
      const next = new Set(prev)
      if (next.has(classId)) next.delete(classId)
      else next.add(classId)
      return next
    })
  }

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLinkName || selectedLinkClassIds.size < 2) {
      setLinkMessage({ type: 'error', text: 'Enter a name and select at least 2 classes' })
      return
    }
    const token = localStorage.getItem('token')
    setLinkMessage(null)
    try {
      const res = await fetch(`${API_URL}/linked-classes/create`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_name: newLinkName, class_ids: Array.from(selectedLinkClassIds) }),
      })
      if (res.ok) {
        setNewLinkName('')
        setSelectedLinkClassIds(new Set())
        setShowCreateLink(false)
        setLinkMessage({ type: 'success', text: 'Linked classes group created!' })
        fetchLinkedGroups()
      } else {
        const err = await res.json()
        setLinkMessage({ type: 'error', text: err.detail || 'Create failed' })
      }
    } catch {
      setLinkMessage({ type: 'error', text: 'Failed to create link group' })
    }
  }

  const handleDeleteLink = async (linkId: number) => {
    if (!confirm('Delete this linked classes group?')) return
    const token = localStorage.getItem('token')
    try {
      const res = await fetch(`${API_URL}/linked-classes/${linkId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setLinkMessage({ type: 'success', text: 'Link group deleted' })
        fetchLinkedGroups()
      }
    } catch {
      // silent
    }
  }

  const isActive = (classId: string) => classId in classPrefs ? classPrefs[classId] : true

  const handleToggleActive = async (classId: string) => {
    const token = localStorage.getItem('token')
    if (!token || togglingId) return
    setTogglingId(classId)
    try {
      const res = await fetch(`${API_URL}/class-preferences/${classId}/toggle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setClassPrefs(prev => ({ ...prev, [classId]: data.is_active }))
      }
    } catch {}
    setTogglingId(null)
  }

  const getClassName = (classId: string) => {
    const c = courses.find(c => c.id === classId)
    return c ? c.name : classId
  }

  if (loading) {
    return (
      <div style={styles.appLoading}>
        <p style={{ color: '#888' }}>Loading...</p>
      </div>
    )
  }

  const activeClasses = courses.filter(c => isActive(c.id))
  const inactiveClasses = courses.filter(c => !isActive(c.id))

  return (
    <div style={styles.app}>
      <Sidebar />
      <main style={styles.main}>
        <h1 style={styles.title}>Your Classes</h1>

        <div style={styles.grid}>
          {activeClasses.map(course => (
            <div key={course.id} style={styles.card}>
              <div style={styles.cardBody} onClick={() => router.push(`/classes/${course.id}`)}>
                <h3 style={styles.cardTitle}>{course.name}</h3>
                {course.section && <p style={styles.cardSection}>{course.section}</p>}
              </div>
              <div style={styles.cardFooter}>
                <button
                  onClick={() => handleToggleActive(course.id)}
                  disabled={togglingId === course.id}
                  style={styles.inactiveBtn}
                  title="Mark as inactive"
                >
                  Set Inactive
                </button>
              </div>
            </div>
          ))}
        </div>

        {inactiveClasses.length > 0 && (
          <div style={styles.inactiveSection}>
            <h2 style={styles.inactiveTitle}>Inactive Classes</h2>
            <div style={styles.grid}>
              {inactiveClasses.map(course => (
                <div key={course.id} style={{ ...styles.card, opacity: 0.55 }}>
                  <div style={styles.cardBody} onClick={() => router.push(`/classes/${course.id}`)}>
                    <h3 style={{ ...styles.cardTitle, color: '#888' }}>{course.name}</h3>
                    {course.section && <p style={styles.cardSection}>{course.section}</p>}
                  </div>
                  <div style={styles.cardFooter}>
                    <button
                      onClick={() => handleToggleActive(course.id)}
                      disabled={togglingId === course.id}
                      style={styles.activeBtn}
                    >
                      Set Active
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {courses.length > 1 && (
          <div style={styles.linkedSection}>
            <h2 style={styles.linkedTitle}>Linked Classes (Shared Corpus)</h2>
            <p style={styles.linkedHint}>
              Link classes together so they share the same document corpus. Materials uploaded to one class become available to all linked classes.
            </p>

            {linkMessage && (
              <div style={linkMessage.type === 'success' ? styles.successMsg : styles.errorMsg}>
                {linkMessage.text}
              </div>
            )}

            <button onClick={() => setShowCreateLink(!showCreateLink)} style={styles.button}>
              {showCreateLink ? 'Cancel' : 'Create Link Group'}
            </button>

            {showCreateLink && (
              <form onSubmit={handleCreateLink} style={styles.linkForm}>
                <input
                  type="text"
                  placeholder="Group name (e.g., English Materials)"
                  value={newLinkName}
                  onChange={(e) => setNewLinkName(e.target.value)}
                  style={styles.linkInput}
                  required
                />
                <p style={styles.linkFormHint}>Select classes to link (at least 2):</p>
                <div style={styles.linkCheckboxList}>
                  {courses.map((c) => (
                    <label key={c.id} style={styles.linkCheckboxLabel}>
                      <input
                        type="checkbox"
                        checked={selectedLinkClassIds.has(c.id)}
                        onChange={() => toggleLinkClassId(c.id)}
                      />
                      {c.name} {c.section ? `(${c.section})` : ''}
                    </label>
                  ))}
                </div>
                <button type="submit" style={styles.linkSubmitBtn}>Create Link Group</button>
              </form>
            )}

            {linkedGroups.length > 0 && (
              <div style={styles.linkGroupList}>
                {linkedGroups.map((lg) => (
                  <div key={lg.id} style={styles.linkGroupCard}>
                    <div style={styles.linkGroupHeader}>
                      <strong>{lg.link_name}</strong>
                      <button onClick={() => handleDeleteLink(lg.id)} style={styles.linkDeleteBtn}>×</button>
                    </div>
                    <div style={styles.linkGroupClasses}>
                      {lg.class_ids.map((cid) => (
                        <span key={cid} style={styles.linkClassPill}>{getClassName(cid)}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  app: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: '#f0f2f5',
  },
  appLoading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
  },
  main: {
    flex: 1,
    overflowY: 'auto',
    padding: '28px 32px',
  },
  title: {
    marginBottom: '1.5rem',
    color: '#333',
    fontSize: '1.4rem',
    fontWeight: 700,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: '1rem',
    marginBottom: '1rem',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '10px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  cardBody: {
    padding: '1.25rem 1.25rem 0.75rem',
    cursor: 'pointer',
    flex: 1,
  },
  cardTitle: {
    marginBottom: '0.4rem',
    color: '#1a73e8',
    fontSize: '1rem',
    fontWeight: 600,
  },
  cardSection: {
    color: '#888',
    fontSize: '0.85rem',
    margin: 0,
  },
  cardFooter: {
    padding: '0.6rem 1.25rem 0.9rem',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  inactiveBtn: {
    padding: '4px 12px',
    fontSize: '0.75rem',
    background: 'none',
    border: '1px solid #ddd',
    borderRadius: '12px',
    color: '#aaa',
    cursor: 'pointer',
  },
  activeBtn: {
    padding: '4px 12px',
    fontSize: '0.75rem',
    background: '#e8f5e9',
    border: '1px solid #34a853',
    borderRadius: '12px',
    color: '#34a853',
    cursor: 'pointer',
  },
  inactiveSection: {
    marginTop: '2rem',
  },
  inactiveTitle: {
    fontSize: '1rem',
    color: '#999',
    fontWeight: 600,
    marginBottom: '1rem',
  },
  button: {
    backgroundColor: '#1a73e8',
    color: 'white',
    border: 'none',
    padding: '10px 24px',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  linkedSection: {
    marginTop: '3rem',
  },
  linkedTitle: {
    marginBottom: '0.5rem',
    color: '#333',
  },
  linkedHint: {
    color: '#666',
    fontSize: '0.9rem',
    marginBottom: '1rem',
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
  linkForm: {
    marginTop: '1rem',
    padding: '1rem',
    background: '#f8f9fa',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  linkInput: {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '0.9rem',
  },
  linkFormHint: {
    margin: 0,
    fontSize: '0.85rem',
    color: '#555',
  },
  linkCheckboxList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  linkCheckboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.9rem',
    cursor: 'pointer',
  },
  linkSubmitBtn: {
    padding: '8px 20px',
    background: '#28a745',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    alignSelf: 'flex-start',
  },
  linkGroupList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    marginTop: '1rem',
  },
  linkGroupCard: {
    background: '#fff',
    padding: '1rem',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  linkGroupHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
  },
  linkDeleteBtn: {
    background: 'none',
    border: 'none',
    color: '#999',
    fontSize: '1.25rem',
    cursor: 'pointer',
  },
  linkGroupClasses: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  linkClassPill: {
    fontSize: '0.8rem',
    padding: '3px 10px',
    borderRadius: '12px',
    background: '#e8f0fe',
    color: '#1a73e8',
  },
}
