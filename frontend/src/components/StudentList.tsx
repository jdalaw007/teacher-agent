'use client'

import { useState } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface StudentGroup {
  id: number
  name: string
  description: string
  class_id: string
}

interface StudentSummary {
  total_assignments: number
  turned_in: number
  avg_grade: number | null
  late_count: number
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
  groups?: StudentGroup[]
  summary?: StudentSummary
}

interface StudentListProps {
  students: Student[]
  groups?: StudentGroup[]
  onStudentUpdated: () => void
  onStudentDeleted: () => void
}

const GROUP_COLORS = ['#1a73e8', '#34a853', '#ea4335', '#fbbc05', '#9334e6', '#e67c73']

export default function StudentList({ students, groups = [], onStudentUpdated, onStudentDeleted }: StudentListProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editingNotes, setEditingNotes] = useState('')
  const [editingEmail, setEditingEmail] = useState('')
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
    setEditingEmail(student.email || '')
    setMessage(null)
  }

  const handleSaveNotes = async (studentId: number) => {
    const token = localStorage.getItem('token')
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch(`${API_URL}/students/${studentId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notes: editingNotes, email: editingEmail }),
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'Saved!' })
        onStudentUpdated()
      } else {
        setMessage({ type: 'error', text: 'Failed to save' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save' })
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

  const toggleGroupMembership = async (groupId: number, studentId: number, isMember: boolean) => {
    const token = localStorage.getItem('token')
    try {
      if (isMember) {
        await fetch(`${API_URL}/students/groups/${groupId}/members/${studentId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
      } else {
        await fetch(`${API_URL}/students/groups/${groupId}/members`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_id: studentId }),
        })
      }
      onStudentUpdated()
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
              {student.groups && student.groups.length > 0 && (
                <div style={styles.groupBadges}>
                  {student.groups.map((g, i) => (
                    <span key={g.id} style={{
                      ...styles.groupBadge,
                      backgroundColor: `${GROUP_COLORS[i % GROUP_COLORS.length]}18`,
                      color: GROUP_COLORS[i % GROUP_COLORS.length],
                      borderColor: `${GROUP_COLORS[i % GROUP_COLORS.length]}40`,
                    }}>
                      {g.name}
                    </span>
                  ))}
                </div>
              )}
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

          {/* Performance stats */}
          {student.summary && student.summary.total_assignments > 0 && expandedId !== student.id && (
            <p style={styles.statsPreview}>
              {student.summary.turned_in}/{student.summary.total_assignments} submitted
              {student.summary.avg_grade !== null && ` | Avg: ${student.summary.avg_grade}%`}
              {student.summary.late_count > 0 && ` | ${student.summary.late_count} late`}
            </p>
          )}

          {student.notes && expandedId !== student.id && (
            <p style={styles.notesPreview} onClick={() => handleExpand(student)}>
              {student.notes.length > 100 ? student.notes.slice(0, 100) + '...' : student.notes}
            </p>
          )}

          {expandedId === student.id && (
            <div style={styles.expandedPanel} onClick={(e) => e.stopPropagation()}>
              {/* Performance stats in detail */}
              {student.summary && student.summary.total_assignments > 0 && (
                <div style={styles.statsDetail}>
                  <span>{student.summary.turned_in}/{student.summary.total_assignments} submitted</span>
                  {student.summary.avg_grade !== null && <span>Avg: {student.summary.avg_grade}%</span>}
                  {student.summary.late_count > 0 && <span>{student.summary.late_count} late</span>}
                </div>
              )}

              <label style={styles.notesLabel}>Email</label>
              <input
                type="email"
                value={editingEmail}
                onChange={(e) => setEditingEmail(e.target.value)}
                style={{ ...styles.notesTextarea, rows: undefined, resize: undefined, padding: '8px 12px' } as React.CSSProperties}
                placeholder="student@example.com"
              />

              <label style={{ ...styles.notesLabel, marginTop: '0.75rem' }}>Teacher Notes</label>
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

              {/* Group memberships */}
              {groups.length > 0 && (
                <div style={styles.groupSection}>
                  <label style={styles.notesLabel}>Groups</label>
                  <div style={styles.groupCheckboxList}>
                    {groups.map((g) => {
                      const isMember = student.groups?.some(sg => sg.id === g.id) ?? false
                      return (
                        <label key={g.id} style={styles.groupCheckboxLabel}>
                          <input
                            type="checkbox"
                            checked={isMember}
                            onChange={() => toggleGroupMembership(g.id, student.id, isMember)}
                          />
                          <span>{g.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
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
  groupBadges: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
  },
  groupBadge: {
    fontSize: '0.65rem',
    padding: '2px 7px',
    borderRadius: '10px',
    fontWeight: 600,
    border: '1px solid',
    whiteSpace: 'nowrap',
  },
  statsPreview: {
    color: '#888',
    fontSize: '0.8rem',
    margin: '0.35rem 0 0 0',
  },
  statsDetail: {
    display: 'flex',
    gap: '1.5rem',
    fontSize: '0.85rem',
    color: '#555',
    marginBottom: '1rem',
    padding: '0.5rem 0.75rem',
    background: '#f8f9fa',
    borderRadius: '6px',
  },
  groupSection: {
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: '1px solid #eee',
  },
  groupCheckboxList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  groupCheckboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.9rem',
    cursor: 'pointer',
  },
}
