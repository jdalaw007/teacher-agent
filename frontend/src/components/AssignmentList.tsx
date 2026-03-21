'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Assignment {
  id: string
  title: string
  description?: string
  state?: string
  dueDate?: { year: number; month: number; day: number }
  maxPoints?: number
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

interface RosterStudent {
  id: number
  classroom_user_id: string | null
  name: string
}

interface AssignmentListProps {
  assignments: Assignment[]
  courseId: string
  students?: RosterStudent[]
  onGrade?: (assignment: Assignment) => void
  onGradeStudent?: (assignment: Assignment, userId: string, userName: string) => void
}

export default function AssignmentList({ assignments, courseId, students = [], onGrade, onGradeStudent }: AssignmentListProps) {
  const t = useTranslations('assignmentList')
  const tCommon = useTranslations('common')
  const studentByUserId = Object.fromEntries(
    students.filter(s => s.classroom_user_id).map(s => [s.classroom_user_id!, s.name])
  )
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(false)
  const [submissionsError, setSubmissionsError] = useState<string | null>(null)
  const [previewUserId, setPreviewUserId] = useState<string | null>(null)
  const [previewText, setPreviewText] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const openPreview = async (sub: Submission, assignmentId: string) => {
    setPreviewUserId(sub.userId)
    setPreviewText(null)
    setPreviewLoading(true)
    const token = localStorage.getItem('token')
    try {
      const res = await fetch(
        `${API_URL}/grader/submission-preview?course_id=${courseId}&assignment_id=${assignmentId}&student_user_id=${sub.userId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const d = await res.json()
      setPreviewText(d.text || '(No readable text found — may be a PDF or image)')
    } catch {
      setPreviewText('(Failed to load submission)')
    } finally {
      setPreviewLoading(false)
    }
  }

  if (assignments.length === 0) {
    return (
      <div style={styles.empty}>
        <p>{t('noAssignments')}</p>
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
      setSubmissionsError(t('failedToLoadSubmissions'))
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {assignment.state && (
                <span style={styles.state}>{assignment.state}</span>
              )}
              {onGrade && (
                <button
                  onClick={e => { e.stopPropagation(); onGrade(assignment) }}
                  style={styles.gradeBtn}
                >
                  {t('gradeWithAI')}
                </button>
              )}
            </div>
          </div>
          {assignment.description && (
            <p style={styles.description}>{assignment.description}</p>
          )}
          {assignment.dueDate && formatDate(assignment.dueDate) && (
            <p style={styles.dueDate}>{t('due', { date: formatDate(assignment.dueDate)! })}</p>
          )}
          <p style={styles.viewHint}>
            {expandedId === assignment.id ? t('clickToCollapse') : t('clickToView')}
          </p>

          {expandedId === assignment.id && (
            <div style={styles.submissionsPanel} onClick={(e) => e.stopPropagation()}>
              <h5 style={styles.submissionsTitle}>{t('studentSubmissions')}</h5>
              {loadingSubmissions ? (
                <p style={styles.loadingText}>{t('loadingSubmissions')}</p>
              ) : submissionsError ? (
                <p style={styles.errorText}>{submissionsError}</p>
              ) : submissions.length === 0 ? (
                <p style={styles.emptySubmissions}>{t('noSubmissions')}</p>
              ) : (
                <div style={styles.submissionsList}>
                  {submissions.map((sub) => (
                    <div key={sub.id}>
                      <div
                        style={{
                          ...styles.submissionRow,
                          cursor: sub.state === 'TURNED_IN' || sub.state === 'RETURNED' ? 'pointer' : 'default',
                          backgroundColor: previewUserId === sub.userId ? '#e8f0fe' : '#f8f9fa',
                        }}
                        onClick={() => {
                          if (sub.state === 'TURNED_IN' || sub.state === 'RETURNED') {
                            if (previewUserId === sub.userId) {
                              setPreviewUserId(null); setPreviewText(null)
                            } else {
                              openPreview(sub, expandedId!)
                            }
                          }
                        }}
                      >
                        <span style={styles.studentId}>
                          {studentByUserId[sub.userId] || `Student (${sub.userId.slice(-6)})`}
                        </span>
                        <span style={{
                          ...styles.submissionState,
                          backgroundColor: getStateColor(sub.state).bg,
                          color: getStateColor(sub.state).text,
                        }}>
                          {formatState(sub.state)}
                        </span>
                        {sub.late && <span style={styles.lateBadge}>{t('late')}</span>}
                        {sub.assignedGrade != null && (
                          <span style={styles.grade}>{t('grade', { grade: sub.assignedGrade })}</span>
                        )}
                        {sub.updateTime && (
                          <span style={styles.submissionTime}>
                            {new Date(sub.updateTime).toLocaleDateString()}{' '}
                            {new Date(sub.updateTime).toLocaleTimeString()}
                          </span>
                        )}
                        {(sub.state === 'TURNED_IN' || sub.state === 'RETURNED') && (
                          <span style={styles.viewWorkHint}>
                            {previewUserId === sub.userId ? t('hideWork') : t('viewWork')}
                          </span>
                        )}
                        {onGradeStudent && (sub.state === 'TURNED_IN' || sub.state === 'RETURNED') && (
                          <button
                            style={styles.gradeStudentBtn}
                            onClick={e => {
                              e.stopPropagation()
                              const assignment = assignments.find(a => a.id === expandedId)!
                              const name = studentByUserId[sub.userId] || `Student (${sub.userId.slice(-6)})`
                              onGradeStudent(assignment, sub.userId, name)
                            }}
                          >
                            {t('gradeStudent')}
                          </button>
                        )}
                      </div>
                      {previewUserId === sub.userId && (
                        <div style={styles.previewBox}>
                          {previewLoading
                            ? <span style={{ color: '#aaa', fontSize: '0.85rem' }}>{tCommon('loading')}</span>
                            : <pre style={styles.previewText}>{previewText}</pre>
                          }
                        </div>
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
  viewWorkHint: {
    marginLeft: 'auto', fontSize: '0.75rem', color: '#1a73e8', fontStyle: 'italic',
  },
  previewBox: {
    margin: '4px 0 8px 0', padding: '12px 16px',
    backgroundColor: '#fff', border: '1px solid #e8eaed', borderRadius: '6px',
    maxHeight: '300px', overflowY: 'auto' as const,
  },
  previewText: {
    fontSize: '0.83rem', color: '#333', lineHeight: 1.65,
    whiteSpace: 'pre-wrap' as const, fontFamily: 'inherit', margin: 0,
  },
  gradeBtn: {
    padding: '4px 10px',
    fontSize: '0.8rem',
    background: '#e8f0fe',
    color: '#1a73e8',
    border: '1px solid #1a73e8',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  gradeStudentBtn: {
    padding: '2px 8px',
    fontSize: '0.75rem',
    background: '#1a73e8',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    flexShrink: 0,
  },
}
