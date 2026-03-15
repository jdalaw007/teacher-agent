'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
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
  maxPoints?: number
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
  groups?: { id: number; name: string; description: string; class_id: string }[]
  summary?: { total_assignments: number; turned_in: number; avg_grade: number | null; late_count: number }
}

interface StudentGroup {
  id: number
  name: string
  description: string
  class_id: string
  member_count: number
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
  const [groups, setGroups] = useState<StudentGroup[]>([])
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [syncingGrades, setSyncingGrades] = useState(false)
  const [studentsCollapsed, setStudentsCollapsed] = useState(false)
  const [showMailModal, setShowMailModal] = useState(false)
  const [mailSubject, setMailSubject] = useState('')
  const [mailBody, setMailBody] = useState('')
  const [mailSelectedIds, setMailSelectedIds] = useState<Set<number>>(new Set())
  const [aiComposePrompt, setAiComposePrompt] = useState('')
  const [sendingMail, setSendingMail] = useState(false)
  const [composingMail, setComposingMail] = useState(false)

  // Grader state
  const [graderAssignment, setGraderAssignment] = useState<Assignment | null>(null)
  const [graderRubric, setGraderRubric] = useState('')
  const [graderMaxPoints, setGraderMaxPoints] = useState(100)
  const [graderRunning, setGraderRunning] = useState(false)
  const [graderStatus, setGraderStatus] = useState('')
  const [graderResults, setGraderResults] = useState<any[]>([])
  const [graderPlagiarism, setGraderPlagiarism] = useState<any[]>([])

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

  const fetchGroups = async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/students/groups?class_id=${courseId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setGroups(data.groups || [])
      }
    } catch {
      // silent
    }
  }

  useEffect(() => {
    if (!loading && course) {
      fetchStudents()
      fetchGroups()
    }
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

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGroupName) return
    const token = localStorage.getItem('token')
    setStudentMessage(null)
    try {
      const res = await fetch(`${API_URL}/students/groups`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: courseId, name: newGroupName, description: newGroupDesc }),
      })
      if (res.ok) {
        setNewGroupName('')
        setNewGroupDesc('')
        setShowAddGroup(false)
        setStudentMessage({ type: 'success', text: 'Group created!' })
        fetchGroups()
      } else {
        const err = await res.json()
        setStudentMessage({ type: 'error', text: err.detail || 'Failed to create group' })
      }
    } catch {
      setStudentMessage({ type: 'error', text: 'Failed to create group' })
    }
  }

  const handleDeleteGroup = async (groupId: number) => {
    if (!confirm('Delete this group?')) return
    const token = localStorage.getItem('token')
    try {
      const res = await fetch(`${API_URL}/students/groups/${groupId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setStudentMessage({ type: 'success', text: 'Group deleted' })
        fetchGroups()
        fetchStudents()
      }
    } catch {
      // silent
    }
  }

  const handleSyncGrades = async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    setSyncingGrades(true)
    setStudentMessage(null)
    try {
      const res = await fetch(`${API_URL}/students/sync-submissions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: courseId }),
      })
      if (res.ok) {
        const data = await res.json()
        setStudentMessage({
          type: 'success',
          text: `Synced ${data.synced} submission(s) across ${data.assignments_checked} assignment(s).`,
        })
        fetchStudents()
      } else {
        const err = await res.json()
        setStudentMessage({ type: 'error', text: err.detail || 'Sync failed' })
      }
    } catch {
      setStudentMessage({ type: 'error', text: 'Failed to sync grades' })
    } finally {
      setSyncingGrades(false)
    }
  }

  const handleMailStudents = async (mode: 'send' | 'draft') => {
    const token = localStorage.getItem('token')
    const selected = students.filter(s => mailSelectedIds.has(s.id) && s.email)
    if (!selected.length || !mailSubject || !mailBody) return
    setSendingMail(true)
    try {
      const res = await fetch(`${API_URL}/gmail/${mode === 'send' ? 'send' : 'draft'}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: selected.map(s => s.email), subject: mailSubject, body: mailBody }),
      })
      if (res.ok) {
        setStudentMessage({ type: 'success', text: mode === 'send' ? 'Email sent!' : 'Draft saved to Gmail.' })
        setShowMailModal(false)
        setMailSubject(''); setMailBody(''); setMailSelectedIds(new Set()); setAiComposePrompt('')
      } else {
        const err = await res.json()
        setStudentMessage({ type: 'error', text: err.detail || 'Failed' })
      }
    } catch {
      setStudentMessage({ type: 'error', text: 'Failed to send email' })
    } finally {
      setSendingMail(false)
    }
  }

  const handleAiCompose = async () => {
    const token = localStorage.getItem('token')
    if (!aiComposePrompt) return
    setComposingMail(true)
    try {
      const selected = students.filter(s => mailSelectedIds.has(s.id))
      const res = await fetch(`${API_URL}/gmail/ai-compose`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_names: selected.length > 0 ? selected.map(s => s.name) : students.map(s => s.name),
          class_name: course?.name || 'your class',
          prompt: aiComposePrompt,
        }),
      })
      const data = await res.json()
      if (res.ok) { setMailSubject(data.subject); setMailBody(data.body) }
      else setStudentMessage({ type: 'error', text: data.detail || 'AI compose failed' })
    } catch {
      setStudentMessage({ type: 'error', text: 'AI compose failed' })
    } finally {
      setComposingMail(false)
    }
  }

  const handleGradeStart = async () => {
    if (!graderAssignment) return
    const token = localStorage.getItem('token')
    setGraderRunning(true)
    setGraderResults([])
    setGraderPlagiarism([])
    setGraderStatus('Starting...')
    try {
      const res = await fetch(`${API_URL}/grader/grade`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: courseId,
          assignment_id: graderAssignment.id,
          rubric: graderRubric,
          max_points: graderMaxPoints,
        }),
      })
      if (!res.ok || !res.body) {
        setGraderStatus('Failed to start grading.')
        setGraderRunning(false)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'status') setGraderStatus(event.message)
            else if (event.type === 'plagiarism') setGraderPlagiarism(event.flags)
            else if (event.type === 'student_result') setGraderResults(prev => [...prev, event])
            else if (event.type === 'done') setGraderRunning(false)
            else if (event.type === 'error') { setGraderStatus(`Error: ${event.message}`); setGraderRunning(false) }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch {
      setGraderStatus('Connection error.')
      setGraderRunning(false)
    }
  }

  const aiScoreColor = (score: number) => {
    if (score <= 3) return '#34a853'
    if (score <= 6) return '#f9ab00'
    return '#ea4335'
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
        <button onClick={() => router.push('/classes')} style={styles.button}>
          Back to Classes
        </button>
      </div>
    )
  }

  return (
    <div style={styles.app}>
      <Sidebar />
      <main style={styles.main}>
        <div style={styles.pageHeader}>
          <div>
            <button onClick={() => router.push('/classes')} style={styles.backButton}>
              &larr; Back to Classes
            </button>
            <h1 style={styles.title}>{course.name}</h1>
            {course.section && <p style={styles.section}>{course.section}</p>}
            {course.description && <p style={styles.description}>{course.description}</p>}
          </div>
        </div>

        {/* Manage Groups */}
        <h2 style={styles.subtitle}>Differentiation Groups ({groups.length})</h2>
        <div style={styles.studentActions}>
          <button onClick={() => setShowAddGroup(!showAddGroup)} style={styles.addButton}>
            {showAddGroup ? 'Cancel' : 'Create Group'}
          </button>
        </div>

        {showAddGroup && (
          <form onSubmit={handleCreateGroup} style={styles.addForm}>
            <input
              type="text"
              placeholder="Group Name (e.g., Advanced, ELL)"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              style={styles.formInput}
              required
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newGroupDesc}
              onChange={(e) => setNewGroupDesc(e.target.value)}
              style={styles.formInput}
            />
            <button type="submit" style={styles.submitButton}>Create</button>
          </form>
        )}

        {groups.length > 0 && (
          <div style={styles.groupGrid}>
            {groups.map((g) => (
              <div key={g.id} style={styles.groupCard}>
                <div style={styles.groupCardHeader}>
                  <strong>{g.name}</strong>
                  <button onClick={() => handleDeleteGroup(g.id)} style={styles.groupDeleteBtn}>×</button>
                </div>
                {g.description && <p style={styles.groupDesc}>{g.description}</p>}
                <span style={styles.groupMemberCount}>{g.member_count} member(s)</span>
              </div>
            ))}
          </div>
        )}

        <h2 style={{ ...styles.subtitle, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          Students ({students.length})
          <button
            onClick={() => setStudentsCollapsed(!studentsCollapsed)}
            style={{ background: 'none', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', padding: '2px 8px', color: '#666' }}
          >
            {studentsCollapsed ? 'Show' : 'Hide'}
          </button>
        </h2>

        {studentMessage && (
          <div style={studentMessage.type === 'success' ? styles.successMsg : styles.errorMsg}>
            {studentMessage.text}
          </div>
        )}

        <div style={styles.studentActions}>
          <button onClick={() => router.push(`/agent?class_id=${courseId}`)} style={styles.importButton}>
            Generate Assignment
          </button>
          <button onClick={handleImportRoster} disabled={importingRoster} style={styles.importButton}>
            {importingRoster ? 'Importing...' : 'Import from Classroom'}
          </button>
          <button onClick={handleSyncGrades} disabled={syncingGrades} style={styles.importButton}>
            {syncingGrades ? 'Syncing...' : 'Sync Grades'}
          </button>
          <button onClick={() => setShowMailModal(true)} style={styles.importButton}>
            Mail Students
          </button>
          <button onClick={() => setShowAddStudent(!showAddStudent)} style={styles.importButton}>
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

        {!studentsCollapsed && (
          <StudentList
            students={students}
            groups={groups}
            onStudentUpdated={() => { fetchStudents(); fetchGroups(); }}
            onStudentDeleted={() => { fetchStudents(); fetchGroups(); }}
          />
        )}

        <h2 style={styles.subtitle}>Assignments</h2>
        <AssignmentList
          assignments={assignments}
          courseId={courseId}
          students={students}
          onGrade={(assignment) => {
            setGraderAssignment(assignment)
            setGraderRubric('')
            setGraderMaxPoints(assignment.maxPoints || 100)
            setGraderResults([])
            setGraderPlagiarism([])
            setGraderRunning(false)
            setGraderStatus('')
          }}
        />

        {graderAssignment && (
          <div style={styles.modalOverlay} onClick={() => setGraderAssignment(null)}>
            <div style={styles.graderModal} onClick={e => e.stopPropagation()}>
              <div style={styles.mailModalHeader}>
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Grade with AI — {graderAssignment.title}</h2>
                <button onClick={() => setGraderAssignment(null)} style={styles.closeBtn}>×</button>
              </div>
              <div style={styles.mailModalBody}>
                {graderResults.length === 0 ? (
                  <>
                    <div style={styles.mailSection}>
                      <label style={styles.mailLabel}>Rubric</label>
                      <textarea
                        value={graderRubric}
                        onChange={e => setGraderRubric(e.target.value)}
                        rows={5}
                        style={styles.mailTextarea}
                        placeholder="Accuracy 40pts, Clarity 30pts, Completeness 30pts"
                      />
                    </div>
                    <div style={styles.mailSection}>
                      <label style={styles.mailLabel}>Max Points</label>
                      <input
                        type="number"
                        value={graderMaxPoints}
                        onChange={e => setGraderMaxPoints(Number(e.target.value))}
                        style={{ ...styles.mailInput, width: '100px' }}
                        min={1}
                      />
                    </div>
                    {graderStatus && <p style={{ color: '#666', fontSize: '0.9rem', margin: 0 }}>{graderStatus}</p>}
                    <button
                      onClick={handleGradeStart}
                      disabled={graderRunning || !graderRubric}
                      style={styles.button}
                    >
                      {graderRunning ? 'Grading...' : 'Start Grading'}
                    </button>
                  </>
                ) : (
                  <>
                    <p style={{ color: '#666', fontSize: '0.9rem', margin: 0 }}>{graderStatus}</p>
                    {graderPlagiarism.length > 0 && (
                      <div style={styles.plagiarismBox}>
                        <strong>Possible plagiarism detected:</strong>
                        {graderPlagiarism.map((f, i) => (
                          <div key={i}>{f.student_a} &amp; {f.student_b} — {Math.round(f.similarity * 100)}% similar</div>
                        ))}
                      </div>
                    )}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={styles.graderTable}>
                        <thead>
                          <tr>
                            <th style={styles.graderTh}>Student</th>
                            <th style={styles.graderTh}>AI Score</th>
                            <th style={styles.graderTh}>Plagiarism</th>
                            <th style={styles.graderTh}>Grade</th>
                            <th style={styles.graderTh}>Feedback</th>
                          </tr>
                        </thead>
                        <tbody>
                          {graderResults.map((r, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                              <td style={styles.graderTd}>{r.student_name}</td>
                              <td style={styles.graderTd}>
                                {r.no_submission ? <span style={{ color: '#888' }}>No submission</span>
                                  : r.no_text ? <span style={{ color: '#888', fontSize: '0.8rem' }} title={r.note}>No text</span>
                                  : (
                                    <span style={{ ...styles.aiScoreBadge, background: aiScoreColor(r.ai_score) }}
                                      title={r.ai_reasoning}>
                                      {r.ai_score}/10
                                    </span>
                                  )}
                              </td>
                              <td style={styles.graderTd}>
                                {r.plagiarism_flagged
                                  ? <span style={styles.plagBadge}>FLAG</span>
                                  : <span style={{ color: '#888' }}>—</span>}
                              </td>
                              <td style={styles.graderTd}>
                                {r.grade != null && !r.no_submission && !r.no_text
                                  ? `${r.grade} / ${r.max_points}`
                                  : '—'}
                              </td>
                              <td style={{ ...styles.graderTd, maxWidth: '250px' }}>
                                <span title={r.feedback} style={{ cursor: r.feedback ? 'help' : 'default' }}>
                                  {r.feedback ? (r.feedback.length > 80 ? r.feedback.slice(0, 80) + '…' : r.feedback) : '—'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {graderRunning && <p style={{ color: '#666', fontSize: '0.85rem', margin: 0 }}>Grading in progress...</p>}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {showMailModal && (
          <div style={styles.modalOverlay} onClick={() => setShowMailModal(false)}>
            <div style={styles.mailModal} onClick={e => e.stopPropagation()}>
              <div style={styles.mailModalHeader}>
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Mail Students</h2>
                <button onClick={() => setShowMailModal(false)} style={styles.closeBtn}>×</button>
              </div>
              <div style={styles.mailModalBody}>
                <div style={styles.mailSection}>
                  <label style={styles.mailLabel}>Recipients</label>
                  <div style={styles.studentCheckboxList}>
                    <label style={styles.checkboxRow}>
                      <input type="checkbox"
                        checked={mailSelectedIds.size === students.filter(s => s.email).length && students.filter(s => s.email).length > 0}
                        onChange={() => {
                          const withEmail = students.filter(s => s.email)
                          setMailSelectedIds(mailSelectedIds.size === withEmail.length ? new Set() : new Set(withEmail.map(s => s.id)))
                        }}
                      /> Select all ({students.filter(s => s.email).length} with email)
                    </label>
                    {students.filter(s => s.email).map(s => (
                      <label key={s.id} style={styles.checkboxRow}>
                        <input type="checkbox" checked={mailSelectedIds.has(s.id)}
                          onChange={() => setMailSelectedIds(prev => {
                            const next = new Set(prev); next.has(s.id) ? next.delete(s.id) : next.add(s.id); return next
                          })}
                        /> {s.name} ({s.email})
                      </label>
                    ))}
                  </div>
                </div>
                <div style={styles.mailSection}>
                  <label style={styles.mailLabel}>Have AI draft this email</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input type="text" placeholder="e.g. remind them the essay is due Friday"
                      value={aiComposePrompt} onChange={e => setAiComposePrompt(e.target.value)}
                      style={{ ...styles.mailInput, flex: 1 }}
                    />
                    <button onClick={handleAiCompose} disabled={!aiComposePrompt || composingMail} style={styles.aiDraftBtn}>
                      {composingMail ? 'Drafting...' : 'Draft with AI'}
                    </button>
                  </div>
                </div>
                <div style={styles.mailSection}>
                  <label style={styles.mailLabel}>Subject</label>
                  <input type="text" value={mailSubject} onChange={e => setMailSubject(e.target.value)}
                    style={styles.mailInput} placeholder="Subject" />
                </div>
                <div style={styles.mailSection}>
                  <label style={styles.mailLabel}>Body</label>
                  <textarea value={mailBody} onChange={e => setMailBody(e.target.value)}
                    style={styles.mailTextarea} rows={8} placeholder="Email body..." />
                </div>
                <div style={styles.mailActions}>
                  <button onClick={() => handleMailStudents('send')}
                    disabled={!mailSubject || !mailBody || mailSelectedIds.size === 0 || sendingMail}
                    style={styles.sendNowBtn}>
                    {sendingMail ? 'Sending...' : 'Send Now'}
                  </button>
                  <button onClick={() => handleMailStudents('draft')}
                    disabled={!mailSubject || !mailBody || mailSelectedIds.size === 0 || sendingMail}
                    style={styles.saveDraftBtn}>
                    Save to Drafts
                  </button>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#888', margin: 0 }}>
                  Students can reply to this email. AI-drafted emails are saved as drafts — review in Gmail before sending.
                </p>
              </div>
            </div>
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
  main: {
    flex: 1,
    overflowY: 'auto',
    padding: '28px 32px',
    maxWidth: '1200px',
  },
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1.5rem',
    gap: '1rem',
  },
  generateBtn: {
    padding: '10px 20px',
    backgroundColor: '#1a73e8',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
  title: {
    marginBottom: '0.5rem',
    color: '#333',
    fontSize: '1.4rem',
    fontWeight: 700,
  },
  section: {
    color: '#666',
    marginBottom: '0.5rem',
  },
  description: {
    color: '#666',
    marginBottom: '0',
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
    height: '100vh',
    color: '#888',
  },
  error: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
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
    background: '#1a73e8',
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
    background: '#1a73e8',
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
  groupGrid: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
    marginBottom: '1rem',
  },
  groupCard: {
    background: '#fff',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    minWidth: '150px',
  },
  groupCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.25rem',
  },
  groupDeleteBtn: {
    background: 'none',
    border: 'none',
    color: '#999',
    fontSize: '1.25rem',
    cursor: 'pointer',
    padding: '0 4px',
  },
  groupDesc: {
    color: '#666',
    fontSize: '0.8rem',
    margin: '0 0 0.25rem 0',
  },
  groupMemberCount: {
    fontSize: '0.75rem',
    color: '#888',
  },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  mailModal: { background: '#fff', borderRadius: '8px', width: '90%', maxWidth: '600px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' },
  mailModalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid #eee' },
  mailModalBody: { padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' },
  mailSection: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  mailLabel: { fontWeight: 500, fontSize: '0.9rem', color: '#333' },
  mailInput: { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.95rem' },
  mailTextarea: { padding: '8px 10px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.95rem', fontFamily: 'inherit', resize: 'vertical' },
  studentCheckboxList: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto', padding: '8px', border: '1px solid #eee', borderRadius: '6px' },
  checkboxRow: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', cursor: 'pointer' },
  mailActions: { display: 'flex', gap: '0.75rem' },
  sendNowBtn: { padding: '10px 20px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.95rem' },
  saveDraftBtn: { padding: '10px 20px', background: '#e8f0fe', color: '#1a73e8', border: '1px solid #1a73e8', borderRadius: '6px', cursor: 'pointer', fontSize: '0.95rem' },
  aiDraftBtn: { padding: '8px 14px', background: '#1a73e8', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', whiteSpace: 'nowrap' },
  closeBtn: { background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#666' },
  graderModal: { background: '#fff', borderRadius: '8px', width: '95%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' },
  graderTable: { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' },
  graderTh: { textAlign: 'left', padding: '8px 12px', borderBottom: '2px solid #eee', whiteSpace: 'nowrap', color: '#555', fontWeight: 600 },
  graderTd: { padding: '8px 12px', verticalAlign: 'top' },
  aiScoreBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: '12px', color: '#fff', fontWeight: 600, fontSize: '0.8rem' },
  plagBadge: { display: 'inline-block', padding: '2px 8px', borderRadius: '4px', background: '#f8d7da', color: '#dc3545', fontWeight: 700, fontSize: '0.8rem' },
  plagiarismBox: { padding: '10px 14px', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px', color: '#856404', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '4px' },
}
