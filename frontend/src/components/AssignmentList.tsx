'use client'

import { useState } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Assignment {
  id: string
  title: string
  description?: string
  state?: string
  dueDate?: { year: number; month: number; day: number }
}

interface Submission {
  id: string
  userId: string
  state: string
  updateTime?: string
  creationTime?: string
  late?: boolean
  assignedGrade?: number
}

interface AssignmentListProps {
  assignments: Assignment[]
  courseId: string
}

export default function AssignmentList({ assignments, courseId }: AssignmentListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(false)
  const [submissionsError, setSubmissionsError] = useState<string | null>(null)

  if (assignments.length === 0) {
    return (
      <div style={styles.empty}>
        <p>No assignments found for this class.</p>
      </div>
    )
  }

  const formatDate = (dueDate?: { year: number; month: number; day: number }) => {
    if (!dueDate) return null
    return `${dueDate.month}/${dueDate.day}/${dueDate.year}`
  }

  const formatState = (state: string): string => {
    const labels: { [key: string]: string } = {
      NEW: 'New',
      CREATED: 'Created',
      TURNED_IN: 'Turned In',
      RETURNED: 'Returned',
      RECLAIMED_BY_STUDENT: 'Reclaimed',
    }
    return labels[state] || state
  }

  const getStateColor = (state: string): { bg: string; text: string } => {
    switch (state) {
      case 'TURNED_IN':
        return { bg: '#d4edda', text: '#155724' }
      case 'RETURNED':
        return { bg: '#e8f0fe', text: '#1a73e8' }
      case 'RECLAIMED_BY_STUDENT':
        return { bg: '#fff3cd', text: '#856404' }
      case 'CREATED':
        return { bg: '#f8f9fa', text: '#666' }
      default:
        return { bg: '#f8f9fa', text: '#999' }
    }
  }

  const handleToggle = async (assignmentId: string) => {
    if (expandedId === assignmentId) {
      setExpandedId(null)
      return
    }

    setExpandedId(assignmentId)
    setSubmissions([])
    setSubmissionsError(null)
    setLoadingSubmissions(true)

    const token = localStorage.getItem('token')
    try {
      const res = await fetch(
        `${API_URL}/classroom/courses/${courseId}/assignments/${assignmentId}/submissions`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setSubmissions(data.submissions || [])
    } catch {
      setSubmissionsError('Failed to load submissions.')
    } finally {
      setLoadingSubmissions(false)
    }
  }

  return (
    <div style={styles.list}>
      {assignments.map((assignment) => (
        <div
          key={assignment.id}
          style={{
            ...styles.card,
            cursor: 'pointer',
            border: expandedId === assignment.id ? '2px solid #1a73e8' : '2px solid transparent',
          }}
          onClick={() => handleToggle(assignment.id)}
        >
          <div style={styles.header}>
            <h4 style={styles.title}>{assignment.title}</h4>
            {assignment.state && (
              <span style={styles.state}>{assignment.state}</span>
            )}
          </div>
          {assignment.description && (
            <p style={styles.description}>{assignment.description}</p>
          )}
          {assignment.dueDate && (
            <p style={styles.dueDate}>Due: {formatDate(assignment.dueDate)}</p>
          )}
          <p style={styles.viewHint}>
            {expandedId === assignment.id ? 'Click to collapse' : 'Click to view submissions'}
          </p>

          {expandedId === assignment.id && (
            <div style={styles.submissionsPanel} onClick={(e) => e.stopPropagation()}>
              <h5 style={styles.submissionsTitle}>Student Submissions</h5>
              {loadingSubmissions ? (
                <p style={styles.loadingText}>Loading submissions...</p>
              ) : submissionsError ? (
                <p style={styles.errorText}>{submissionsError}</p>
              ) : submissions.length === 0 ? (
                <p style={styles.emptySubmissions}>No submissions yet.</p>
              ) : (
                <div style={styles.submissionsList}>
                  {submissions.map((sub) => (
                    <div key={sub.id} style={styles.submissionRow}>
                      <span style={styles.studentId}>Student ({sub.userId.slice(-6)})</span>
                      <span style={{
                        ...styles.submissionState,
                        backgroundColor: getStateColor(sub.state).bg,
                        color: getStateColor(sub.state).text,
                      }}>
                        {formatState(sub.state)}
                      </span>
                      {sub.late && <span style={styles.lateBadge}>Late</span>}
                      {sub.assignedGrade != null && (
                        <span style={styles.grade}>Grade: {sub.assignedGrade}</span>
                      )}
                      {sub.updateTime && (
                        <span style={styles.submissionTime}>
                          {new Date(sub.updateTime).toLocaleDateString()}{' '}
                          {new Date(sub.updateTime).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  ))}
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
    gap: '1rem',
  },
  card: {
    backgroundColor: 'white',
    padding: '1.25rem',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
  },
  title: {
    margin: 0,
    color: '#333',
  },
  state: {
    fontSize: '0.75rem',
    padding: '4px 8px',
    backgroundColor: '#e8f0fe',
    color: '#1a73e8',
    borderRadius: '4px',
  },
  description: {
    color: '#666',
    fontSize: '0.9rem',
    marginBottom: '0.5rem',
  },
  dueDate: {
    color: '#888',
    fontSize: '0.85rem',
  },
  empty: {
    textAlign: 'center',
    padding: '2rem',
    color: '#666',
  },
  viewHint: {
    fontSize: '0.8rem',
    color: '#1a73e8',
    marginTop: '0.5rem',
    marginBottom: 0,
  },
  submissionsPanel: {
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: '1px solid #eee',
  },
  submissionsTitle: {
    margin: '0 0 0.75rem 0',
    fontSize: '0.95rem',
    color: '#333',
  },
  submissionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  submissionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '8px 12px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
    fontSize: '0.9rem',
  },
  studentId: {
    fontWeight: 500,
    color: '#333',
    minWidth: '120px',
  },
  submissionState: {
    fontSize: '0.75rem',
    padding: '3px 8px',
    borderRadius: '4px',
    fontWeight: 500,
  },
  lateBadge: {
    fontSize: '0.7rem',
    padding: '2px 6px',
    backgroundColor: '#f8d7da',
    color: '#dc3545',
    borderRadius: '4px',
    fontWeight: 600,
  },
  grade: {
    fontSize: '0.85rem',
    color: '#333',
    fontWeight: 500,
  },
  submissionTime: {
    fontSize: '0.8rem',
    color: '#888',
    marginLeft: 'auto',
  },
  loadingText: {
    color: '#666',
    fontStyle: 'italic',
    fontSize: '0.9rem',
  },
  errorText: {
    color: '#dc3545',
    fontSize: '0.9rem',
  },
  emptySubmissions: {
    color: '#666',
    fontStyle: 'italic',
    fontSize: '0.9rem',
  },
}
