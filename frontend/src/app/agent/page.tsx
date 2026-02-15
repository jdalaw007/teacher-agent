'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Course {
  id: string
  name: string
}

interface Document {
  id: string
  title: string
  filename?: string
  type?: string
}

interface Student {
  id: number
  name: string
  email: string
  notes: string
  classroom_user_id: string | null
}

export default function AgentPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'upload' | 'generate' | 'post'>('upload')
  const [courses, setCourses] = useState<Course[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loadingStatus, setLoadingStatus] = useState('')
  const [loadingProgress, setLoadingProgress] = useState(0)

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadTitle, setUploadTitle] = useState('')
  const [textContent, setTextContent] = useState('')
  const [textTitle, setTextTitle] = useState('')

  // Generate form state
  const [topic, setTopic] = useState('')
  const [gradeLevel, setGradeLevel] = useState('')
  const [assignmentType, setAssignmentType] = useState('worksheet')
  const [additionalInstructions, setAdditionalInstructions] = useState('')
  const [generatedAssignment, setGeneratedAssignment] = useState('')

  // Assignment history (saved assignments)
  const [savedAssignments, setSavedAssignments] = useState<{
    id: string
    name: string
    topic: string
    type: string
    created: string
    content?: string
  }[]>([])
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveAssignmentName, setSaveAssignmentName] = useState('')
  const [pendingSaveContent, setPendingSaveContent] = useState<{topic: string, type: string, content: string} | null>(null)

  // Post to Classroom state
  const [showPostModal, setShowPostModal] = useState(false)
  const [postTitle, setPostTitle] = useState('')
  const [postPoints, setPostPoints] = useState<string>('')
  const [postDueDate, setPostDueDate] = useState('')
  const [postAsDraft, setPostAsDraft] = useState(false)

  // Document selection and viewer state
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [viewingDoc, setViewingDoc] = useState<{id: string, title: string, content: string} | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)

  // Student selection state
  const [classStudents, setClassStudents] = useState<Student[]>([])
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<number>>(new Set())

  // Google Drive import state
  const [driveFiles, setDriveFiles] = useState<{id: string, name: string, mimeType: string}[]>([])
  const [loadingDriveFiles, setLoadingDriveFiles] = useState(false)
  const [showDriveImport, setShowDriveImport] = useState(false)

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null

  useEffect(() => {
    if (!token) {
      router.push('/')
      return
    }
    fetchCourses()
  }, [token, router])

  useEffect(() => {
    if (selectedClassId) {
      fetchDocuments()
      fetchSavedAssignments()
      fetchClassStudents()
    }
  }, [selectedClassId])

  const fetchClassStudents = async () => {
    if (!selectedClassId) return
    try {
      const res = await fetch(`${API_URL}/students/list?class_id=${selectedClassId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setClassStudents(data.students || [])
        setSelectedStudentIds(new Set())
      }
    } catch {
      console.error('Failed to fetch students')
    }
  }

  const toggleStudentSelection = (studentId: number) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev)
      if (next.has(studentId)) {
        next.delete(studentId)
      } else {
        next.add(studentId)
      }
      return next
    })
  }

  const fetchSavedAssignments = async () => {
    if (!selectedClassId) return
    try {
      const res = await fetch(`${API_URL}/assignments/list?class_id=${selectedClassId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setSavedAssignments(data.assignments || [])
      }
    } catch (err) {
      console.error('Failed to fetch saved assignments:', err)
    }
  }

  const promptSaveAssignment = () => {
    if (!generatedAssignment) return
    setPendingSaveContent({
      topic: topic,
      type: assignmentType,
      content: generatedAssignment
    })
    setSaveAssignmentName(`${topic} - ${assignmentType}`)
    setShowSaveModal(true)
  }

  const saveAssignment = async () => {
    if (!pendingSaveContent || !saveAssignmentName || !selectedClassId) return
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/assignments/save`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          class_id: selectedClassId,
          name: saveAssignmentName,
          topic: pendingSaveContent.topic,
          assignment_type: pendingSaveContent.type,
          content: pendingSaveContent.content
        })
      })

      if (res.ok) {
        setMessage({ type: 'success', text: 'Assignment saved!' })
        setShowSaveModal(false)
        setPendingSaveContent(null)
        fetchSavedAssignments()
      } else {
        const err = await res.json()
        setMessage({ type: 'error', text: err.detail || 'Save failed' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Save failed' })
    } finally {
      setLoading(false)
    }
  }

  const loadAssignment = async (assignId: string) => {
    try {
      const res = await fetch(`${API_URL}/assignments/${assignId}?class_id=${selectedClassId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setGeneratedAssignment(data.content)
        setSelectedAssignmentId(assignId)
        setTopic(data.topic || '')
        setAssignmentType(data.type || 'worksheet')
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load assignment' })
    }
  }

  const deleteAssignment = async (assignId: string) => {
    if (!confirm('Delete this assignment?')) return
    try {
      const res = await fetch(`${API_URL}/assignments/${assignId}?class_id=${selectedClassId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        setMessage({ type: 'success', text: 'Assignment deleted' })
        if (selectedAssignmentId === assignId) {
          setSelectedAssignmentId(null)
          setGeneratedAssignment('')
        }
        fetchSavedAssignments()
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Delete failed' })
    }
  }

  const openPostModal = () => {
    if (!generatedAssignment) return
    setPostTitle(`${topic} - ${assignmentType}`)
    setPostPoints('')
    setPostDueDate('')
    setPostAsDraft(false)
    setShowPostModal(true)
  }

  const postToClassroom = async () => {
    if (!generatedAssignment || !selectedClassId || !postTitle) return
    setLoading(true)

    // Parse due date if provided
    let dueYear, dueMonth, dueDay
    if (postDueDate) {
      const date = new Date(postDueDate)
      dueYear = date.getFullYear()
      dueMonth = date.getMonth() + 1
      dueDay = date.getDate()
    }

    try {
      const res = await fetch(`${API_URL}/classroom/courses/${selectedClassId}/assignments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: postTitle,
          description: generatedAssignment,
          max_points: postPoints ? parseInt(postPoints) : null,
          due_year: dueYear,
          due_month: dueMonth,
          due_day: dueDay,
          publish: !postAsDraft
        })
      })

      if (res.ok) {
        const data = await res.json()
        setMessage({
          type: 'success',
          text: postAsDraft
            ? 'Assignment saved as draft in Google Classroom!'
            : 'Assignment posted to Google Classroom!'
        })
        setShowPostModal(false)
      } else {
        const err = await res.json()
        setMessage({ type: 'error', text: err.detail || 'Failed to post to Classroom' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to post to Classroom' })
    } finally {
      setLoading(false)
    }
  }

  const fetchCourses = async () => {
    setLoadingCourses(true)
    try {
      const res = await fetch(`${API_URL}/classroom/courses`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setCourses(data.courses || [])
        if (data.courses?.length > 0) {
          setSelectedClassId(data.courses[0].id)
        }
      }
    } catch (err) {
      console.error('Failed to fetch courses:', err)
    } finally {
      setLoadingCourses(false)
    }
  }

  const fetchDocuments = async () => {
    if (!selectedClassId) return
    try {
      const res = await fetch(`${API_URL}/corpus/documents?class_id=${selectedClassId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setDocuments(data.documents || [])
      }
    } catch (err) {
      console.error('Failed to fetch documents:', err)
    }
  }

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uploadFile || !selectedClassId) return

    setLoading(true)
    setMessage(null)

    const formData = new FormData()
    formData.append('file', uploadFile)
    formData.append('class_id', selectedClassId)
    if (uploadTitle) formData.append('title', uploadTitle)

    try {
      const res = await fetch(`${API_URL}/corpus/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })

      if (res.ok) {
        const data = await res.json()
        setMessage({ type: 'success', text: `Uploaded: ${data.title}` })
        setUploadFile(null)
        setUploadTitle('')
        fetchDocuments()
      } else {
        const err = await res.json()
        setMessage({ type: 'error', text: err.detail || 'Upload failed' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Upload failed' })
    } finally {
      setLoading(false)
    }
  }

  const handleTextUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!textContent || !textTitle || !selectedClassId) return

    setLoading(true)
    setMessage(null)

    const formData = new FormData()
    formData.append('class_id', selectedClassId)
    formData.append('title', textTitle)
    formData.append('content', textContent)

    try {
      const res = await fetch(`${API_URL}/corpus/upload-text`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })

      if (res.ok) {
        const data = await res.json()
        setMessage({ type: 'success', text: `Added: ${data.title}` })
        setTextContent('')
        setTextTitle('')
        fetchDocuments()
      } else {
        const err = await res.json()
        setMessage({ type: 'error', text: err.detail || 'Upload failed' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Upload failed' })
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!topic || !selectedClassId) return

    setLoading(true)
    setMessage(null)
    setGeneratedAssignment('')
    setLoadingStatus('Searching documents...')
    setLoadingProgress(10)

    // Simulate progress while waiting for API
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev < 30) return prev + 5
        if (prev < 60) return prev + 2
        if (prev < 85) return prev + 1
        return prev
      })
    }, 500)

    // Update status after a moment
    setTimeout(() => setLoadingStatus('Generating assignment...'), 1500)
    setTimeout(() => setLoadingProgress(40), 2000)

    try {
      const res = await fetch(`${API_URL}/agent/generate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          topic,
          class_id: selectedClassId,
          grade_level: gradeLevel || null,
          assignment_type: assignmentType,
          additional_instructions: additionalInstructions || null,
          selected_doc_ids: selectedDocIds.size > 0 ? Array.from(selectedDocIds) : null,
          student_ids: selectedStudentIds.size > 0 ? Array.from(selectedStudentIds) : null
        })
      })

      clearInterval(progressInterval)
      setLoadingProgress(100)
      setLoadingStatus('Complete!')

      if (res.ok) {
        const data = await res.json()
        console.log('Generate response:', data)
        setGeneratedAssignment(data.assignment || 'No content generated')
        setSelectedAssignmentId(null) // Clear selection since this is new
        setMessage({ type: 'success', text: `Generated using ${data.sources_used} source(s). Click "Save" to keep it.` })
      } else {
        const err = await res.json()
        setMessage({ type: 'error', text: err.detail || 'Generation failed' })
      }
    } catch (err) {
      clearInterval(progressInterval)
      setMessage({ type: 'error', text: 'Generation failed' })
    } finally {
      setLoading(false)
      setLoadingStatus('')
      setLoadingProgress(0)
    }
  }

  const handleDeleteDocument = async (docId: string) => {
    if (!selectedClassId) return
    try {
      const res = await fetch(`${API_URL}/corpus/documents/${docId}?class_id=${selectedClassId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        fetchDocuments()
        setSelectedDocIds(prev => {
          const next = new Set(prev)
          next.delete(docId)
          return next
        })
        setMessage({ type: 'success', text: 'Document deleted' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Delete failed' })
    }
  }

  const toggleDocSelection = (docId: string) => {
    setSelectedDocIds(prev => {
      const next = new Set(prev)
      if (next.has(docId)) {
        next.delete(docId)
      } else {
        next.add(docId)
      }
      return next
    })
  }

  const selectAllDocs = () => {
    setSelectedDocIds(new Set(documents.map(d => d.id)))
  }

  const clearSelection = () => {
    setSelectedDocIds(new Set())
  }

  const viewDocument = async (doc: Document) => {
    setLoadingContent(true)
    try {
      const res = await fetch(
        `${API_URL}/corpus/documents/${doc.id}/content?class_id=${selectedClassId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.ok) {
        const data = await res.json()
        setViewingDoc({
          id: doc.id,
          title: doc.title || doc.filename || doc.id,
          content: data.content
        })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load document' })
    } finally {
      setLoadingContent(false)
    }
  }

  const fetchDriveFiles = async () => {
    setLoadingDriveFiles(true)
    try {
      const res = await fetch(`${API_URL}/corpus/drive-files`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setDriveFiles(data.files || [])
        setShowDriveImport(true)
      } else {
        setMessage({ type: 'error', text: 'Failed to load Drive files' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to connect to Drive' })
    } finally {
      setLoadingDriveFiles(false)
    }
  }

  const importFromDrive = async (fileId: string, fileName: string) => {
    if (!selectedClassId) return
    setLoading(true)
    setMessage(null)

    const formData = new FormData()
    formData.append('file_id', fileId)
    formData.append('class_id', selectedClassId)
    formData.append('title', fileName)

    try {
      const res = await fetch(`${API_URL}/corpus/import-from-drive`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })

      if (res.ok) {
        const data = await res.json()
        setMessage({ type: 'success', text: `Imported: ${data.title}` })
        fetchDocuments()
        setShowDriveImport(false)
      } else {
        const err = await res.json()
        setMessage({ type: 'error', text: err.detail || 'Import failed' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Import failed' })
    } finally {
      setLoading(false)
    }
  }

  const getMimeTypeLabel = (mimeType: string) => {
    if (mimeType.includes('google-apps.document')) return 'Google Doc'
    if (mimeType.includes('wordprocessingml')) return 'Word'
    if (mimeType.includes('pdf')) return 'PDF'
    if (mimeType.includes('text/plain')) return 'Text'
    return 'File'
  }

  return (
    <div>
      <Navbar userName="" />
      <main style={styles.main}>
        <button onClick={() => router.push('/dashboard')} style={styles.backButton}>
          ← Back to Dashboard
        </button>

        <h1 style={styles.title}>AI Teaching Assistant</h1>

        {/* Class Selector */}
        <div style={styles.classSelector}>
          <label style={styles.classSelectorLabel}>Select Class:</label>
          {loadingCourses ? (
            <span style={styles.loadingText}>Loading classes...</span>
          ) : courses.length === 0 ? (
            <span style={styles.loadingText}>No classes found</span>
          ) : (
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              style={styles.classDropdown}
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          <button
            style={activeTab === 'upload' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('upload')}
          >
            Upload Materials
          </button>
          <button
            style={activeTab === 'generate' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('generate')}
          >
            Generate Assignment
          </button>
          <button
            style={styles.tab}
            onClick={openPostModal}
          >
            Post to Classroom
          </button>
        </div>

        {/* Message */}
        {message && (
          <div style={message.type === 'success' ? styles.success : styles.error}>
            {message.text}
          </div>
        )}

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div style={styles.content}>
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>Upload a File</h2>
              <p style={styles.hintText}>Supports: Word docs (.docx), PDFs, text files</p>
              <form onSubmit={handleFileUpload} style={styles.form}>
                <input
                  type="file"
                  accept=".pdf,.txt,.md,.docx"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  style={styles.fileInput}
                />
                <input
                  type="text"
                  placeholder="Title (optional)"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  style={styles.input}
                />
                <button type="submit" disabled={!uploadFile || loading} style={styles.button}>
                  {loading ? 'Uploading...' : 'Upload File'}
                </button>
              </form>
            </div>

            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>Import from Google Drive</h2>
              <p style={styles.hintText}>Import Google Docs, Word docs, or PDFs directly from your Drive</p>
              <button
                onClick={fetchDriveFiles}
                disabled={loadingDriveFiles}
                style={styles.button}
              >
                {loadingDriveFiles ? 'Loading...' : 'Browse Google Drive'}
              </button>
            </div>

            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>Or Paste Text</h2>
              <form onSubmit={handleTextUpload} style={styles.form}>
                <input
                  type="text"
                  placeholder="Title"
                  value={textTitle}
                  onChange={(e) => setTextTitle(e.target.value)}
                  style={styles.input}
                  required
                />
                <textarea
                  placeholder="Paste lesson plan, notes, or other content here..."
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  style={styles.textarea}
                  rows={8}
                  required
                />
                <button type="submit" disabled={!textContent || !textTitle || loading} style={styles.button}>
                  {loading ? 'Adding...' : 'Add to Corpus'}
                </button>
              </form>
            </div>

            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>
                Materials for {courses.find(c => c.id === selectedClassId)?.name || 'this class'} ({documents.length})
              </h2>
              {documents.length === 0 ? (
                <p style={styles.emptyText}>No materials uploaded yet for this class.</p>
              ) : (
                <ul style={styles.docList}>
                  {documents.map((doc) => (
                    <li key={doc.id} style={styles.docItem}>
                      <span>{doc.title || doc.filename || doc.id}</span>
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        style={styles.deleteButton}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Generate Tab */}
        {activeTab === 'generate' && (
          <div style={styles.generateLayout}>
            {/* Document Sidebar */}
            <div style={styles.sidebar}>
              <h3 style={styles.sidebarTitle}>Source Documents</h3>
              <p style={styles.sidebarHint}>
                {selectedDocIds.size > 0
                  ? `${selectedDocIds.size} selected`
                  : 'Select documents to use, or leave empty to search all'}
              </p>
              <div style={styles.sidebarActions}>
                <button onClick={selectAllDocs} style={styles.smallButton}>Select All</button>
                <button onClick={clearSelection} style={styles.smallButton}>Clear</button>
              </div>
              {documents.length === 0 ? (
                <p style={styles.emptyText}>No documents uploaded yet.</p>
              ) : (
                <ul style={styles.sidebarDocList}>
                  {documents.map((doc) => (
                    <li key={doc.id} style={styles.sidebarDocItem}>
                      <label style={styles.docLabel}>
                        <input
                          type="checkbox"
                          checked={selectedDocIds.has(doc.id)}
                          onChange={() => toggleDocSelection(doc.id)}
                          style={styles.checkbox}
                        />
                        <span style={styles.docTitle}>{doc.title || doc.filename || doc.id}</span>
                      </label>
                      <button
                        onClick={() => viewDocument(doc)}
                        style={styles.viewButton}
                        disabled={loadingContent}
                      >
                        View
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Main Content */}
            <div style={styles.generateMain}>
              <div style={styles.section}>
                <h2 style={styles.sectionTitle}>Create Assignment</h2>
                <form onSubmit={handleGenerate} style={styles.form}>
                <input
                  type="text"
                  placeholder="Topic (e.g., 'Photosynthesis', 'World War II')"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  style={styles.input}
                  required
                />
                <input
                  type="text"
                  placeholder="Grade Level (e.g., '8th grade', 'High School')"
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                  style={styles.input}
                />
                <select
                  value={assignmentType}
                  onChange={(e) => setAssignmentType(e.target.value)}
                  style={styles.input}
                >
                  <option value="worksheet">Worksheet</option>
                  <option value="quiz">Quiz</option>
                  <option value="essay prompt">Essay Prompt</option>
                  <option value="discussion questions">Discussion Questions</option>
                  <option value="homework">Homework</option>
                  <option value="project">Project</option>
                </select>
                <textarea
                  placeholder="Additional instructions (optional)"
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  style={styles.textarea}
                  rows={3}
                />
                {/* Student Selection */}
                {classStudents.length > 0 && (
                  <div style={styles.studentSelector}>
                    <label style={styles.studentSelectorLabel}>
                      Personalize for students (optional):
                    </label>
                    <p style={styles.studentSelectorHint}>
                      {selectedStudentIds.size > 0
                        ? `${selectedStudentIds.size} student(s) selected — assignment will be tailored to their profiles`
                        : 'Select students to generate individualized content based on their profiles and notes'}
                    </p>
                    <div style={styles.studentCheckboxList}>
                      {classStudents.map((student) => (
                        <label key={student.id} style={styles.studentCheckboxLabel}>
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.has(student.id)}
                            onChange={() => toggleStudentSelection(student.id)}
                            style={styles.checkbox}
                          />
                          <span style={styles.studentCheckboxName}>{student.name}</span>
                          {student.notes && (
                            <span style={styles.studentNotesIndicator} title={student.notes}>
                              has notes
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <button type="submit" disabled={!topic || loading} style={styles.button}>
                  {loading ? 'Generating...' : 'Generate Assignment'}
                </button>
                </form>
              </div>

              <div style={styles.resultSection}>
                <h2 style={styles.sectionTitle}>Generated Assignment</h2>
                {loading ? (
                  <div style={styles.progressContainer}>
                    <div style={styles.progressStatus}>{loadingStatus}</div>
                    <div style={styles.progressBarBg}>
                      <div
                        style={{
                          ...styles.progressBarFill,
                          width: `${loadingProgress}%`
                        }}
                      />
                    </div>
                    <div style={styles.progressPercent}>{loadingProgress}%</div>
                  </div>
                ) : generatedAssignment ? (
                  <>
                    <pre style={styles.result}>{generatedAssignment}</pre>
                    <div style={styles.resultActions}>
                      <button
                        onClick={() => navigator.clipboard.writeText(generatedAssignment)}
                        style={styles.copyButton}
                      >
                        Copy to Clipboard
                      </button>
                      <button
                        onClick={promptSaveAssignment}
                        style={styles.saveButton}
                      >
                        Save Assignment
                      </button>
                      <button
                        onClick={openPostModal}
                        style={styles.postButton}
                      >
                        Post to Classroom →
                      </button>
                    </div>
                  </>
                ) : (
                  <p style={styles.emptyText}>Your generated assignment will appear here.</p>
                )}
              </div>

              {/* Saved Assignments */}
              {savedAssignments.length > 0 && (
                <div style={styles.historySection}>
                  <h2 style={styles.sectionTitle}>Saved Assignments ({savedAssignments.length})</h2>
                  <div style={styles.historyList}>
                    {savedAssignments.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          ...styles.historyItem,
                          ...(selectedAssignmentId === item.id ? styles.historyItemSelected : {})
                        }}
                      >
                        <div
                          style={styles.historyClickArea}
                          onClick={() => loadAssignment(item.id)}
                        >
                          <div style={styles.historyItemHeader}>
                            <span style={styles.historyTopic}>{item.name}</span>
                            <span style={styles.historyType}>{item.type}</span>
                          </div>
                          <div style={styles.historyTime}>
                            {new Date(item.created).toLocaleDateString()} {new Date(item.created).toLocaleTimeString()}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteAssignment(item.id)
                          }}
                          style={styles.deleteHistoryButton}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Document Viewer Modal */}
        {viewingDoc && (
          <div style={styles.modalOverlay} onClick={() => setViewingDoc(null)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h2 style={styles.modalTitle}>{viewingDoc.title}</h2>
                <button onClick={() => setViewingDoc(null)} style={styles.closeButton}>×</button>
              </div>
              <pre style={styles.modalContent}>{viewingDoc.content}</pre>
            </div>
          </div>
        )}

        {/* Google Drive Import Modal */}
        {showDriveImport && (
          <div style={styles.modalOverlay} onClick={() => setShowDriveImport(false)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h2 style={styles.modalTitle}>Import from Google Drive</h2>
                <button onClick={() => setShowDriveImport(false)} style={styles.closeButton}>×</button>
              </div>
              <div style={styles.driveFileList}>
                {driveFiles.length === 0 ? (
                  <p style={styles.emptyText}>No compatible files found in your Drive.</p>
                ) : (
                  driveFiles.map((file) => (
                    <div key={file.id} style={styles.driveFileItem}>
                      <div style={styles.driveFileInfo}>
                        <span style={styles.driveFileName}>{file.name}</span>
                        <span style={styles.driveFileType}>{getMimeTypeLabel(file.mimeType)}</span>
                      </div>
                      <button
                        onClick={() => importFromDrive(file.id, file.name)}
                        disabled={loading}
                        style={styles.importButton}
                      >
                        {loading ? '...' : 'Import'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Post to Classroom Modal */}
        {showPostModal && (
          <div style={styles.modalOverlay} onClick={() => setShowPostModal(false)}>
            <div style={styles.saveModal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h2 style={styles.modalTitle}>Post to Google Classroom</h2>
                <button onClick={() => setShowPostModal(false)} style={styles.closeButton}>×</button>
              </div>
              <div style={styles.saveModalContent}>
                <label style={styles.saveLabel}>Assignment Title:</label>
                <input
                  type="text"
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  style={styles.input}
                  placeholder="Enter assignment title"
                />

                <label style={{...styles.saveLabel, marginTop: '1rem'}}>Points (optional):</label>
                <input
                  type="number"
                  value={postPoints}
                  onChange={(e) => setPostPoints(e.target.value)}
                  style={styles.input}
                  placeholder="e.g., 100"
                  min="0"
                />

                <label style={{...styles.saveLabel, marginTop: '1rem'}}>Due Date (optional):</label>
                <input
                  type="date"
                  value={postDueDate}
                  onChange={(e) => setPostDueDate(e.target.value)}
                  style={styles.input}
                />

                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={postAsDraft}
                    onChange={(e) => setPostAsDraft(e.target.checked)}
                  />
                  Save as draft (don't publish to students yet)
                </label>

                <div style={styles.saveModalActions}>
                  <button
                    onClick={() => setShowPostModal(false)}
                    style={styles.cancelButton}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={postToClassroom}
                    disabled={!postTitle || loading}
                    style={styles.postConfirmButton}
                  >
                    {loading ? 'Posting...' : (postAsDraft ? 'Save Draft' : 'Post to Classroom')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Save Assignment Modal */}
        {showSaveModal && (
          <div style={styles.modalOverlay} onClick={() => setShowSaveModal(false)}>
            <div style={styles.saveModal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h2 style={styles.modalTitle}>Save Assignment</h2>
                <button onClick={() => setShowSaveModal(false)} style={styles.closeButton}>×</button>
              </div>
              <div style={styles.saveModalContent}>
                <label style={styles.saveLabel}>Assignment Name:</label>
                <input
                  type="text"
                  value={saveAssignmentName}
                  onChange={(e) => setSaveAssignmentName(e.target.value)}
                  style={styles.input}
                  placeholder="Enter a name for this assignment"
                  autoFocus
                />
                <div style={styles.saveModalActions}>
                  <button
                    onClick={() => setShowSaveModal(false)}
                    style={styles.cancelButton}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveAssignment}
                    disabled={!saveAssignmentName || loading}
                    style={styles.saveConfirmButton}
                  >
                    {loading ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
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
  backButton: {
    background: 'none',
    border: 'none',
    color: '#1a73e8',
    cursor: 'pointer',
    marginBottom: '1rem',
    fontSize: '1rem',
  },
  title: {
    marginBottom: '1.5rem',
    color: '#333',
  },
  classSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '1.5rem',
    padding: '1rem',
    background: '#f0f7ff',
    borderRadius: '8px',
    border: '1px solid #c2e0ff',
  },
  classSelectorLabel: {
    fontWeight: 600,
    color: '#333',
  },
  classDropdown: {
    padding: '10px 14px',
    fontSize: '1rem',
    border: '1px solid #1a73e8',
    borderRadius: '6px',
    background: '#fff',
    minWidth: '250px',
    cursor: 'pointer',
  },
  loadingText: {
    color: '#666',
    fontStyle: 'italic',
  },
  tabs: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1.5rem',
  },
  tab: {
    padding: '10px 20px',
    border: '1px solid #ddd',
    background: '#fff',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  tabActive: {
    padding: '10px 20px',
    border: '1px solid #1a73e8',
    background: '#1a73e8',
    color: '#fff',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2rem',
  },
  section: {
    background: '#fff',
    padding: '1.5rem',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  sectionTitle: {
    marginBottom: '1rem',
    fontSize: '1.1rem',
    color: '#333',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  input: {
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '1rem',
  },
  fileInput: {
    padding: '10px 0',
  },
  textarea: {
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '1rem',
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  button: {
    padding: '12px 24px',
    background: '#1a73e8',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '1rem',
  },
  success: {
    padding: '12px',
    background: '#d4edda',
    color: '#155724',
    borderRadius: '6px',
    marginBottom: '1rem',
  },
  error: {
    padding: '12px',
    background: '#f8d7da',
    color: '#721c24',
    borderRadius: '6px',
    marginBottom: '1rem',
  },
  docList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  docItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #eee',
  },
  deleteButton: {
    padding: '4px 12px',
    background: '#dc3545',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
  emptyText: {
    color: '#666',
    fontStyle: 'italic',
  },
  resultSection: {
    background: '#fff',
    padding: '1.5rem',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  result: {
    background: '#f8f9fa',
    padding: '1rem',
    borderRadius: '6px',
    whiteSpace: 'pre-wrap',
    fontFamily: 'inherit',
    fontSize: '0.95rem',
    lineHeight: '1.6',
    maxHeight: '500px',
    overflow: 'auto',
  },
  copyButton: {
    marginTop: '1rem',
    padding: '8px 16px',
    background: '#28a745',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  generateLayout: {
    display: 'flex',
    gap: '1.5rem',
  },
  sidebar: {
    width: '280px',
    flexShrink: 0,
    background: '#fff',
    padding: '1rem',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    maxHeight: 'calc(100vh - 300px)',
    overflowY: 'auto',
  },
  sidebarTitle: {
    margin: '0 0 0.5rem 0',
    fontSize: '1rem',
    color: '#333',
  },
  sidebarHint: {
    fontSize: '0.85rem',
    color: '#666',
    margin: '0 0 0.75rem 0',
  },
  sidebarActions: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  smallButton: {
    padding: '4px 8px',
    fontSize: '0.8rem',
    background: '#e9ecef',
    border: '1px solid #ced4da',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  sidebarDocList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  sidebarDocItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px solid #eee',
  },
  docLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    flex: 1,
    minWidth: 0,
  },
  checkbox: {
    cursor: 'pointer',
  },
  docTitle: {
    fontSize: '0.9rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  viewButton: {
    padding: '2px 8px',
    fontSize: '0.75rem',
    background: '#6c757d',
    color: '#fff',
    border: 'none',
    borderRadius: '3px',
    cursor: 'pointer',
    marginLeft: '8px',
  },
  generateMain: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#fff',
    borderRadius: '8px',
    width: '80%',
    maxWidth: '800px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 1.5rem',
    borderBottom: '1px solid #eee',
  },
  modalTitle: {
    margin: 0,
    fontSize: '1.1rem',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '1.5rem',
    cursor: 'pointer',
    color: '#666',
  },
  modalContent: {
    padding: '1.5rem',
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    fontFamily: 'inherit',
    fontSize: '0.9rem',
    lineHeight: '1.6',
    margin: 0,
  },
  hintText: {
    fontSize: '0.85rem',
    color: '#666',
    margin: '0 0 1rem 0',
  },
  driveFileList: {
    padding: '1rem 1.5rem',
    maxHeight: '400px',
    overflow: 'auto',
  },
  driveFileItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #eee',
  },
  driveFileInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
    minWidth: 0,
  },
  driveFileName: {
    fontSize: '0.95rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  driveFileType: {
    fontSize: '0.75rem',
    color: '#888',
  },
  importButton: {
    padding: '6px 14px',
    background: '#28a745',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    marginLeft: '1rem',
  },
  progressContainer: {
    padding: '2rem',
    textAlign: 'center',
  },
  progressStatus: {
    fontSize: '1rem',
    color: '#333',
    marginBottom: '1rem',
    fontWeight: 500,
  },
  progressBarBg: {
    width: '100%',
    height: '24px',
    background: '#e9ecef',
    borderRadius: '12px',
    overflow: 'hidden',
    marginBottom: '0.5rem',
  },
  progressBarFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #1a73e8, #4285f4)',
    borderRadius: '12px',
    transition: 'width 0.3s ease',
  },
  progressPercent: {
    fontSize: '1.25rem',
    fontWeight: 600,
    color: '#1a73e8',
  },
  historySection: {
    background: '#fff',
    padding: '1.5rem',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    maxHeight: '300px',
    overflowY: 'auto',
    marginBottom: '1rem',
  },
  historyItem: {
    padding: '10px 14px',
    background: '#f8f9fa',
    borderRadius: '6px',
    cursor: 'pointer',
    border: '2px solid transparent',
    transition: 'all 0.2s',
  },
  historyItemSelected: {
    background: '#e8f0fe',
    borderColor: '#1a73e8',
  },
  historyItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '4px',
  },
  historyTopic: {
    fontWeight: 500,
    fontSize: '0.95rem',
  },
  historyType: {
    fontSize: '0.75rem',
    color: '#666',
    background: '#e9ecef',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  historyTime: {
    fontSize: '0.8rem',
    color: '#888',
  },
  clearHistoryButton: {
    padding: '8px 16px',
    background: '#dc3545',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  resultActions: {
    display: 'flex',
    gap: '1rem',
    marginTop: '1rem',
  },
  saveButton: {
    padding: '8px 16px',
    background: '#1a73e8',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  historyClickArea: {
    flex: 1,
    cursor: 'pointer',
  },
  deleteHistoryButton: {
    background: 'none',
    border: 'none',
    color: '#999',
    fontSize: '1.25rem',
    cursor: 'pointer',
    padding: '0 8px',
  },
  saveModal: {
    background: '#fff',
    borderRadius: '8px',
    width: '90%',
    maxWidth: '400px',
  },
  saveModalContent: {
    padding: '1.5rem',
  },
  saveLabel: {
    display: 'block',
    marginBottom: '0.5rem',
    fontWeight: 500,
  },
  saveModalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    marginTop: '1.5rem',
  },
  cancelButton: {
    padding: '8px 16px',
    background: '#e9ecef',
    color: '#333',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  saveConfirmButton: {
    padding: '8px 20px',
    background: '#28a745',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  postButton: {
    padding: '8px 16px',
    background: '#ff9800',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  postConfirmButton: {
    padding: '8px 20px',
    background: '#ff9800',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '1rem',
    cursor: 'pointer',
  },
  studentSelector: {
    padding: '1rem',
    background: '#f0f7ff',
    borderRadius: '8px',
    border: '1px solid #c2e0ff',
  },
  studentSelectorLabel: {
    fontWeight: 600,
    fontSize: '0.95rem',
    color: '#333',
    display: 'block',
    marginBottom: '0.25rem',
  },
  studentSelectorHint: {
    fontSize: '0.8rem',
    color: '#666',
    margin: '0 0 0.75rem 0',
  },
  studentCheckboxList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    maxHeight: '200px',
    overflowY: 'auto',
  },
  studentCheckboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  studentCheckboxName: {
    color: '#333',
  },
  studentNotesIndicator: {
    fontSize: '0.7rem',
    color: '#1a73e8',
    background: '#e8f0fe',
    padding: '2px 6px',
    borderRadius: '10px',
  },
}
