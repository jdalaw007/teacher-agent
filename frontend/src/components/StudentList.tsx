'use client'

import { useState } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

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

interface StudentListProps {
  students: Student[]
  onStudentUpdated: () => void
  onStudentDeleted: () => void
}

export default function StudentList({ students, onStudentUpdated, onStudentDeleted }: StudentListProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editingNotes, setEditingNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  if (students.length === 0) {
    return (
      <div style={styles.empty}>
        <p>No students yet. Import from Classroom or add manually.</p>
      </div>
    )
  }

  const handleExpand = (student: Student) => {
    if (expandedId === student.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(student.id)
    setEditingNotes(student.notes || '')
    setMessage(null)
  }

  const handleSaveNotes = async (studentId: number) => {
    const token = localStorage.getItem('token')
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch(`${API_URL}/students/${studentId}/notes`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes: editingNotes }),
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'Notes saved!' })
        onStudentUpdated()
      } else {
        setMessage({ type: 'error', text: 'Failed to save notes' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save notes' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (studentId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this student?')) return

    const token = localStorage.getItem('token')
    try {
      const res = await fetch(`${API_URL}/students/${studentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        if (expandedId === studentId) setExpandedId(null)
        onStudentDeleted()
      }
    } catch {
      // silent fail
    }
  }

  return (
    <div style={styles.list}>
      {students.map((student) => (
        <div
          key={student.id}
          style={{
            ...styles.card,
            border: expandedId === student.id ? '2px solid #1a73e8' : '2px solid transparent',
          }}
        >
          <div style={styles.header} onClick={() => handleExpand(student)}>
            <div style={styles.headerLeft}>
              <h4 style={styles.name}>{student.name}</h4>
              {student.email && <span style={styles.email}>{student.email}</span>}
            </div>
            <div style={styles.headerRight}>
              <span style={{
                ...styles.sourceBadge,
                backgroundColor: student.classroom_user_id ? '#e8f0fe' : '#fff3cd',
                color: student.classroom_user_id ? '#1a73e8' : '#856404',
              }}>
                {student.classroom_user_id ? 'Classroom' : 'Manual'}
              </span>
              <button
                onClick={(e) => handleDelete(student.id, e)}
                style={styles.deleteButton}
              >
                ×
              </button>
            </div>
          </div>

          {student.notes && expandedId !== student.id && (
            <p style={styles.notesPreview} onClick={() => handleExpand(student)}>
              {student.notes.length > 100 ? student.notes.slice(0, 100) + '...' : student.notes}
            </p>
          )}

          {expandedId === student.id && (
            <div style={styles.expandedPanel} onClick={(e) => e.stopPropagation()}>
              <label style={styles.notesLabel}>Teacher Notes</label>
              <textarea
                value={editingNotes}
                onChange={(e) => setEditingNotes(e.target.value)}
                style={styles.notesTextarea}
                rows={4}
                placeholder="Add observations about learning level, accommodations, preferences..."
              />
              <div style={styles.notesActions}>
                {message && (
                  <span style={{
                    fontSize: '0.85rem',
                    color: message.type === 'success' ? '#155724' : '#dc3545',
                  }}>
                    {message.text}
                  </span>
                )}
                <button
                  onClick={() => handleSaveNotes(student.id)}
                  disabled={saving}
                  style={styles.saveButton}
                >
                  {saving ? 'Saving...' : 'Save Notes'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  card: {
    backgroundColor: 'white',
    padding: '1rem 1.25rem',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    cursor: 'pointer',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    flex: 1,
    minWidth: 0,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexShrink: 0,
  },
  name: {
    margin: 0,
    color: '#333',
    fontSize: '1rem',
  },
  email: {
    color: '#888',
    fontSize: '0.85rem',
  },
  sourceBadge: {
    fontSize: '0.7rem',
    padding: '3px 8px',
    borderRadius: '10px',
    fontWeight: 600,
  },
  deleteButton: {
    background: 'none',
    border: 'none',
    color: '#999',
    fontSize: '1.25rem',
    cursor: 'pointer',
    padding: '0 4px',
  },
  notesPreview: {
    color: '#666',
    fontSize: '0.85rem',
    margin: '0.5rem 0 0 0',
    fontStyle: 'italic',
  },
  expandedPanel: {
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: '1px solid #eee',
  },
  notesLabel: {
    display: 'block',
    fontWeight: 500,
    fontSize: '0.9rem',
    color: '#333',
    marginBottom: '0.5rem',
  },
  notesTextarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  notesActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: '1rem',
    marginTop: '0.75rem',
  },
  saveButton: {
    padding: '8px 20px',
    background: '#28a745',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  empty: {
    textAlign: 'center',
    padding: '2rem',
    color: '#666',
  },
}
