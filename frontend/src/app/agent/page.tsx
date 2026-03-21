'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { useTranslations } from 'next-intl'

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
  shared?: boolean
  source_class_id?: string
}

interface Student {
  id: number
  name: string
  email: string
  notes: string
  classroom_user_id: string | null
}

interface StudentGroup {
  id: number
  name: string
  description: string
  class_id: string
  member_count: number
}

export default function AgentPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('agent')
  const tCommon = useTranslations('common')
  const [activeTab, setActiveTab] = useState<'generate' | 'schedule'>('generate')
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

  // Content checker state
  const [checkResult, setCheckResult] = useState('')
  const [checkStatus, setCheckStatus] = useState<'idle' | 'checking' | 'done'>('idle')

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
  const [postMode, setPostMode] = useState<'assignment' | 'announcement'>('assignment')

  // Scheduled posts state
  const [scheduledPosts, setScheduledPosts] = useState<{
    id: number; class_id: string; post_type: string; title: string; content: string;
    frequency: string; day_of_week: number | null; week_of_month: number | null;
    time_of_day: string; max_points: number | null; active: number;
    last_posted_at: string | null; next_post_at: string; created_at: string;
  }[]>([])
  const [editingPostId, setEditingPostId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editDayOfWeek, setEditDayOfWeek] = useState(0)
  const [editTime, setEditTime] = useState('08:00')
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [schedPostType, setSchedPostType] = useState<'assignment' | 'announcement'>('assignment')
  const [schedTitle, setSchedTitle] = useState('')
  const [schedContent, setSchedContent] = useState('')
  const [schedFrequency, setSchedFrequency] = useState('weekly')
  const [schedDayOfWeek, setSchedDayOfWeek] = useState(0)
  const [schedWeekOfMonth, setSchedWeekOfMonth] = useState(1)
  const [schedTime, setSchedTime] = useState('08:00')
  const [schedMaxPoints, setSchedMaxPoints] = useState<string>('')

  // Document selection and viewer state
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [viewingDoc, setViewingDoc] = useState<{id: string, title: string, content: string} | null>(null)
  const [loadingContent, setLoadingContent] = useState(false)

  // Student selection state
  const [classStudents, setClassStudents] = useState<Student[]>([])
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<number>>(new Set())
  const [classGroups, setClassGroups] = useState<StudentGroup[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [personalizationMode, setPersonalizationMode] = useState<'none' | 'group' | 'individual'>('none')

  // Google Drive import state
  const [driveFiles, setDriveFiles] = useState<{id: string, name: string, mimeType: string}[]>([])
  const [loadingDriveFiles, setLoadingDriveFiles] = useState(false)
  const [showDriveImport, setShowDriveImport] = useState(false)

  // URL import state
  const [urlInput, setUrlInput] = useState('')
  const [urlTitle, setUrlTitle] = useState('')
  const [loadingUrl, setLoadingUrl] = useState(false)

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null

  useEffect(() => {
    if (!token) {
      router.push('/')
      return
    }
    fetchCourses()
  }, [token, router])

  // Pre-select class from URL ?class_id=
  useEffect(() => {
    const classIdFromUrl = searchParams.get('class_id')
    if (classIdFromUrl) setSelectedClassId(classIdFromUrl)
  }, [searchParams])

  useEffect(() => {
    if (selectedClassId) {
      fetchSavedAssignments()
      fetchClassStudents()
      fetchClassGroups()
      fetchScheduledPosts()
    }
  }, [selectedClassId])

  const fetchClassGroups = async () => {
    if (!selectedClassId) return
    try {
      const res = await fetch(`${API_URL}/students/groups?class_id=${selectedClassId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setClassGroups(data.groups || [])
      }
    } catch {
      console.error('Failed to fetch groups')
    }
  }

  const fetchScheduledPosts = async () => {
    if (!selectedClassId) return
    try {
      const res = await fetch(`${API_URL}/scheduled-posts/list?class_id=${selectedClassId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setScheduledPosts(data.scheduled_posts || [])
      }
    } catch {
      console.error('Failed to fetch scheduled posts')
    }
  }

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
        setMessage({ type: 'success', text: t('assignmentSaved') })
        setShowSaveModal(false)
        setPendingSaveContent(null)
        fetchSavedAssignments()
      } else {
        const err = await res.json()
        setMessage({ type: 'error', text: err.detail || t('saveFailed') })
      }
    } catch (err) {
      setMessage({ type: 'error', text: t('saveFailed') })
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
      setMessage({ type: 'error', text: t('failedLoad') })
    }
  }

  const deleteAssignment = async (assignId: string) => {
    if (!confirm(t('confirmDeleteAssignment'))) return
    try {
      const res = await fetch(`${API_URL}/assignments/${assignId}?class_id=${selectedClassId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        setMessage({ type: 'success', text: t('assignmentDeleted') })
        if (selectedAssignmentId === assignId) {
          setSelectedAssignmentId(null)
          setGeneratedAssignment('')
        }
        fetchSavedAssignments()
      }
    } catch (err) {
      setMessage({ type: 'error', text: t('deleteFailed') })
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
    if (!generatedAssignment || !selectedClassId) return
    setLoading(true)

    try {
      if (postMode === 'announcement') {
        // Post as announcement to stream
        const res = await fetch(`${API_URL}/classroom/courses/${selectedClassId}/announcements`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: generatedAssignment }),
        })
        if (res.ok) {
          setMessage({ type: 'success', text: t('announcementPosted') })
          setShowPostModal(false)
        } else {
          const err = await res.json()
          setMessage({ type: 'error', text: err.detail || t('failedPostAnnouncement') })
        }
      } else {
        // Post as assignment
        if (!postTitle) return
        let dueYear, dueMonth, dueDay
        if (postDueDate) {
          const date = new Date(postDueDate)
          dueYear = date.getFullYear()
          dueMonth = date.getMonth() + 1
          dueDay = date.getDate()
        }

        const res = await fetch(`${API_URL}/classroom/courses/${selectedClassId}/assignments`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: postTitle,
            description: generatedAssignment,
            max_points: postPoints ? parseInt(postPoints) : null,
            due_year: dueYear,
            due_month: dueMonth,
            due_day: dueDay,
            publish: !postAsDraft,
          }),
        })

        if (res.ok) {
          setMessage({
            type: 'success',
            text: postAsDraft ? t('assignmentDrafted') : t('assignmentPosted'),
          })
          setShowPostModal(false)
        } else {
          const err = await res.json()
          setMessage({ type: 'error', text: err.detail || t('failedPostClassroom') })
        }
      }
    } catch (err) {
      setMessage({ type: 'error', text: t('failedPostClassroom') })
    } finally {
      setLoading(false)
    }
  }

  // --- Scheduled Posts ---

  const handleCreateScheduledPost = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!schedTitle || !schedContent || !selectedClassId) return
    setLoading(true)
    setMessage(null)

    try {
      const res = await fetch(`${API_URL}/scheduled-posts/create`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_id: selectedClassId,
          post_type: schedPostType,
          title: schedTitle,
          content: schedContent,
          frequency: schedFrequency,
          day_of_week: schedDayOfWeek,
          week_of_month: schedFrequency === 'monthly' ? schedWeekOfMonth : null,
          time_of_day: schedTime,
          max_points: schedPostType === 'assignment' && schedMaxPoints ? parseInt(schedMaxPoints) : null,
        }),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: t('scheduledCreated') })
        setShowScheduleForm(false)
        setSchedTitle('')
        setSchedContent('')
        fetchScheduledPosts()
      } else {
        const err = await res.json()
        setMessage({ type: 'error', text: err.detail || t('scheduleCreateFailed') })
      }
    } catch {
      setMessage({ type: 'error', text: t('scheduleCreateFailed') })
    } finally {
      setLoading(false)
    }
  }

  const checkDuePosts = async () => {
    try {
      await fetch(`${API_URL}/scheduled-posts/check-due`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      fetchScheduledPosts()
    } catch {}
  }

  const startEditPost = (sp: typeof scheduledPosts[0]) => {
    setEditingPostId(sp.id)
    setEditTitle(sp.title)
    setEditContent(sp.content)
    setEditDayOfWeek(sp.day_of_week ?? 0)
    setEditTime(sp.time_of_day || '08:00')
  }

  const handleSaveEdit = async (postId: number) => {
    try {
      const res = await fetch(`${API_URL}/scheduled-posts/${postId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, content: editContent, day_of_week: editDayOfWeek, time_of_day: editTime }),
      })
      if (res.ok) {
        setEditingPostId(null)
        fetchScheduledPosts()
        setMessage({ type: 'success', text: t('postUpdated') })
      }
    } catch {}
  }

  const handleDeleteSchedule = async (postId: number) => {
    if (!confirm(t('confirmDeleteScheduled'))) return
    try {
      const res = await fetch(`${API_URL}/scheduled-posts/${postId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setMessage({ type: 'success', text: t('scheduledDeleted') })
        fetchScheduledPosts()
      }
    } catch {
      setMessage({ type: 'error', text: t('deleteFailed') })
    }
  }

  const handleToggleSchedule = async (postId: number) => {
    try {
      const res = await fetch(`${API_URL}/scheduled-posts/${postId}/toggle`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) fetchScheduledPosts()
    } catch {
      // silent
    }
  }

  const handlePostNow = async (postId: number) => {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch(`${API_URL}/scheduled-posts/${postId}/post-now`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setMessage({ type: 'success', text: t('postedSuccessfully') })
        fetchScheduledPosts()
      } else {
        const err = await res.json()
        setMessage({ type: 'error', text: err.detail || t('failedPost') })
      }
    } catch {
      setMessage({ type: 'error', text: t('failedPost') })
    } finally {
      setLoading(false)
    }
  }

  const handleScheduleFromGenerated = () => {
    if (!generatedAssignment) return
    setSchedTitle(`${topic} - ${assignmentType}`)
    setSchedContent(generatedAssignment)
    setSchedPostType('assignment')
    setShowScheduleForm(true)
    setActiveTab('schedule')
  }

  const handleCheckContent = async () => {
    if (!generatedAssignment || !token) return
    setCheckResult('')
    setCheckStatus('checking')
    try {
      const response = await fetch(`${API_URL}/content/check`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: generatedAssignment,
          content_type: assignmentType,
          grade_level: gradeLevel || undefined,
          subject: topic || undefined,
        }),
      })
      if (!response.ok) throw new Error('Check failed')
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = decoder.decode(value).split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'content') setCheckResult(prev => prev + data.content)
              else if (data.type === 'done') setCheckStatus('done')
            } catch {}
          }
        }
      }
      setCheckStatus('done')
    } catch {
      setCheckResult(t('contentCheckFailed'))
      setCheckStatus('done')
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

  const handleUrlImport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!urlInput || !selectedClassId) return
    setLoadingUrl(true)
    setMessage(null)
    const formData = new FormData()
    formData.append('url', urlInput)
    formData.append('class_id', selectedClassId)
    if (urlTitle) formData.append('title', urlTitle)
    try {
      const res = await fetch(`${API_URL}/corpus/import-from-url`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: `Imported "${data.title}"` })
        setUrlInput('')
        setUrlTitle('')
        fetchDocuments()
      } else {
        setMessage({ type: 'error', text: data.detail || 'Import failed' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Import failed. Check the URL and try again.' })
    } finally {
      setLoadingUrl(false)
    }
  }

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!topic || !selectedClassId) return

    setLoading(true)
    setMessage(null)
    setGeneratedAssignment('')
    setCheckResult('')
    setCheckStatus('idle')
    setLoadingStatus(t('statusSearching'))
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
    setTimeout(() => setLoadingStatus(t('statusGenerating')), 1500)
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
          class_name: courses.find(c => c.id === selectedClassId)?.name || selectedClassId,
          grade_level: gradeLevel || null,
          assignment_type: assignmentType,
          additional_instructions: additionalInstructions || null,
          selected_doc_ids: selectedDocIds.size > 0 ? Array.from(selectedDocIds) : null,
          student_ids: personalizationMode === 'individual' && selectedStudentIds.size > 0 ? Array.from(selectedStudentIds) : null,
          group_id: personalizationMode === 'group' ? selectedGroupId : null,
        })
      })

      clearInterval(progressInterval)
      setLoadingProgress(100)
      setLoadingStatus(t('statusComplete'))

      if (res.ok) {
        const data = await res.json()
        console.log('Generate response:', data)
        setGeneratedAssignment(data.assignment || t('noContentGenerated'))
        setSelectedAssignmentId(null)
        const savedNote = data.saved_filename ? t('savedToFiles', { name: data.saved_filename }) : ''
        setMessage({ type: 'success', text: t('generatedUsing', { count: data.sources_used, savedNote }) })
      } else {
        const err = await res.json()
        setMessage({ type: 'error', text: err.detail || 'Generation failed' })
      }
    } catch (err) {
      clearInterval(progressInterval)
      setMessage({ type: 'error', text: tCommon('error') })
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
        setMessage({ type: 'success', text: t('docDeleted') })
      }
    } catch (err) {
      setMessage({ type: 'error', text: t('deleteFailed') })
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
      setMessage({ type: 'error', text: t('failedLoadDoc') })
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
        setMessage({ type: 'error', text: t('failedDrive') })
      }
    } catch (err) {
      setMessage({ type: 'error', text: t('failedConnectDrive') })
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
        setMessage({ type: 'success', text: t('importedFrom', { title: data.title }) })
        fetchDocuments()
        setShowDriveImport(false)
      } else {
        const err = await res.json()
        setMessage({ type: 'error', text: err.detail || t('importFailed') })
      }
    } catch (err) {
      setMessage({ type: 'error', text: t('importFailed') })
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
    <div style={styles.app}>
      <Sidebar />
      <main style={styles.main}>
        <button onClick={() => router.push('/classes')} style={styles.backButton}>
          ← {t('backToDashboard')}
        </button>

        <h1 style={styles.title}>{t('title')}</h1>

        {/* Class Selector */}
        <div style={styles.classSelector}>
          <label style={styles.classSelectorLabel}>{t('selectClass')}</label>
          {loadingCourses ? (
            <span style={styles.loadingText}>{t('loadingClasses')}</span>
          ) : courses.length === 0 ? (
            <span style={styles.loadingText}>{t('noClasses')}</span>
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
            style={activeTab === 'generate' ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab('generate')}
          >
            {t('tabGenerate')}
          </button>
          <button
            style={activeTab === 'schedule' ? styles.tabActive : styles.tab}
            onClick={() => { setActiveTab('schedule'); checkDuePosts() }}
          >
            {t('tabSchedule')}
          </button>
          <button
            style={styles.tab}
            onClick={openPostModal}
          >
            {t('postToClassroom')}
          </button>
        </div>

        {/* Message */}
        {message && (
          <div style={message.type === 'success' ? styles.success : styles.error}>
            {message.text}
          </div>
        )}

        {/* Generate Tab */}
        {activeTab === 'generate' && (
          <div style={styles.generateLayout}>
            {/* Document Sidebar */}
            <div style={styles.sidebar}>
              <h3 style={styles.sidebarTitle}>{t('sourceDocuments')}</h3>
              <p style={styles.sidebarHint}>
                {selectedDocIds.size > 0
                  ? t('docsSelected', { count: selectedDocIds.size })
                  : t('selectDocsHint')}
              </p>
              <div style={styles.sidebarActions}>
                <button onClick={selectAllDocs} style={styles.smallButton}>{t('selectAll')}</button>
                <button onClick={clearSelection} style={styles.smallButton}>{t('clearSelection')}</button>
              </div>
              {documents.length === 0 ? (
                <p style={styles.emptyText}>{t('noDocumentsHint')}</p>
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
                        {doc.shared && (
                          <span style={styles.sharedBadge}>{t('shared')}</span>
                        )}
                      </label>
                      <button
                        onClick={() => viewDocument(doc)}
                        style={styles.viewButton}
                        disabled={loadingContent}
                      >
                        {t('view')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Main Content */}
            <div style={styles.generateMain}>
              <div style={styles.section}>
                <h2 style={styles.sectionTitle}>{t('createAssignment')}</h2>
                <form onSubmit={handleGenerate} style={styles.form}>
                <input
                  type="text"
                  placeholder={t('topicPlaceholder')}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  style={styles.input}
                  required
                />
                <input
                  type="text"
                  placeholder={t('gradeLevelPlaceholder')}
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                  style={styles.input}
                />
                <select
                  value={assignmentType}
                  onChange={(e) => setAssignmentType(e.target.value)}
                  style={styles.input}
                >
                  <option value="worksheet">{t('typeWorksheet')}</option>
                  <option value="quiz">{t('typeQuiz')}</option>
                  <option value="essay prompt">{t('typeEssay')}</option>
                  <option value="discussion questions">{t('typeDiscussion')}</option>
                  <option value="homework">{t('typeHomework')}</option>
                  <option value="project">{t('typeProject')}</option>
                </select>
                <textarea
                  placeholder={t('additionalPlaceholder')}
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  style={styles.textarea}
                  rows={3}
                />
                {/* Personalization Selector */}
                {(classStudents.length > 0 || classGroups.length > 0) && (
                  <div style={styles.studentSelector}>
                    <label style={styles.studentSelectorLabel}>
                      {t('personalizeFor')}
                    </label>
                    <div style={styles.personalizationModeRow}>
                      <label style={styles.radioLabel}>
                        <input type="radio" name="pmode" checked={personalizationMode === 'none'} onChange={() => { setPersonalizationMode('none'); setSelectedGroupId(null); setSelectedStudentIds(new Set()); }} />
                        {t('pModeNone')}
                      </label>
                      {classGroups.length > 0 && (
                        <label style={styles.radioLabel}>
                          <input type="radio" name="pmode" checked={personalizationMode === 'group'} onChange={() => { setPersonalizationMode('group'); setSelectedStudentIds(new Set()); }} />
                          {t('pModeGroup')}
                        </label>
                      )}
                      <label style={styles.radioLabel}>
                        <input type="radio" name="pmode" checked={personalizationMode === 'individual'} onChange={() => { setPersonalizationMode('individual'); setSelectedGroupId(null); }} />
                        {t('pModeIndividual')}
                      </label>
                    </div>

                    {personalizationMode === 'group' && classGroups.length > 0 && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <select
                          value={selectedGroupId ?? ''}
                          onChange={(e) => setSelectedGroupId(e.target.value ? Number(e.target.value) : null)}
                          style={styles.input}
                        >
                          <option value="">{t('selectGroup')}</option>
                          {classGroups.map((g) => (
                            <option key={g.id} value={g.id}>{g.name} {t('groupCount', { count: g.member_count })}</option>
                          ))}
                        </select>
                        {selectedGroupId && (
                          <p style={styles.studentSelectorHint}>
                            {t('groupTailored')}
                          </p>
                        )}
                      </div>
                    )}

                    {personalizationMode === 'individual' && classStudents.length > 0 && (
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
                                {t('hasNotes')}
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <button type="submit" disabled={!topic || loading} style={styles.button}>
                  {loading ? t('generatingBtn') : t('generateBtn')}
                </button>
                </form>
              </div>

              <div style={styles.resultSection}>
                <h2 style={styles.sectionTitle}>{t('generatedAssignmentTitle')}</h2>
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
                        {t('copyToClipboard')}
                      </button>
                      <button
                        onClick={promptSaveAssignment}
                        style={styles.saveButton}
                      >
                        {t('saveAssignment')}
                      </button>
                      <button
                        onClick={openPostModal}
                        style={styles.postButton}
                      >
                        {t('postToClassroomArrow')}
                      </button>
                      <button
                        onClick={handleScheduleFromGenerated}
                        style={{...styles.postButton, background: '#9334e6'}}
                      >
                        {t('scheduleRecurring')}
                      </button>
                      <button
                        onClick={handleCheckContent}
                        disabled={checkStatus === 'checking'}
                        style={{...styles.postButton, background: '#e67c34', opacity: checkStatus === 'checking' ? 0.6 : 1}}
                      >
                        {checkStatus === 'checking' ? t('checking') : t('checkContent')}
                      </button>
                    </div>

                    {/* Content checker result panel */}
                    {(checkResult || checkStatus === 'checking') && (
                      <div style={styles.checkPanel}>
                        <div style={styles.checkHeader}>
                          <span>{t('contentReview')}</span>
                          {checkStatus === 'done' && (
                            <button
                              onClick={() => { setCheckResult(''); setCheckStatus('idle') }}
                              style={styles.checkClose}
                            >
                              ×
                            </button>
                          )}
                        </div>
                        <div style={styles.checkBody}>
                          {checkStatus === 'checking' && !checkResult && (
                            <span style={{color: '#888', fontSize: '0.9rem'}}>{t('reviewingContent')}</span>
                          )}
                          <pre style={styles.checkPre}>{checkResult}</pre>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p style={styles.emptyText}>{t('generatedEmpty')}</p>
                )}
              </div>

              {/* Saved Assignments */}
              {savedAssignments.length > 0 && (
                <div style={styles.historySection}>
                  <h2 style={styles.sectionTitle}>{t('savedAssignmentsTitle', { count: savedAssignments.length })}</h2>
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

        {/* Schedule Tab */}
        {activeTab === 'schedule' && (
          <div style={styles.content}>
            <div style={styles.section}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={styles.sectionTitle}>{t('schedRecurringTitle')}</h2>
                <button onClick={() => setShowScheduleForm(!showScheduleForm)} style={styles.button}>
                  {showScheduleForm ? tCommon('cancel') : t('schedNewBtn')}
                </button>
              </div>

              <p style={styles.hintText}>
                {t('schedHint')}
              </p>

              {showScheduleForm && (
                <form onSubmit={handleCreateScheduledPost} style={{ ...styles.form, background: '#f8f9fa', padding: '1.25rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <label style={styles.radioLabel}>
                      <input type="radio" checked={schedPostType === 'assignment'} onChange={() => setSchedPostType('assignment')} />
                      {t('schedPostTypeAssignment')}
                    </label>
                    <label style={styles.radioLabel}>
                      <input type="radio" checked={schedPostType === 'announcement'} onChange={() => setSchedPostType('announcement')} />
                      {t('schedPostTypeAnnouncement')}
                    </label>
                  </div>

                  <input
                    type="text"
                    placeholder={t('postTitle')}
                    value={schedTitle}
                    onChange={(e) => setSchedTitle(e.target.value)}
                    style={styles.input}
                    required
                  />
                  <textarea
                    placeholder={t('schedContentPlaceholder')}
                    value={schedContent}
                    onChange={(e) => setSchedContent(e.target.value)}
                    style={styles.textarea}
                    rows={5}
                    required
                  />

                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '150px' }}>
                      <label style={styles.schedLabel}>{t('frequency')}</label>
                      <select value={schedFrequency} onChange={(e) => setSchedFrequency(e.target.value)} style={styles.input}>
                        <option value="weekly">{t('freqWeekly')}</option>
                        <option value="biweekly">{t('freqBiweeklyFull')}</option>
                        <option value="monthly">{t('freqMonthlySimple')}</option>
                      </select>
                    </div>

                    <div style={{ flex: 1, minWidth: '150px' }}>
                      <label style={styles.schedLabel}>{t('dayOfWeek')}</label>
                      <select value={schedDayOfWeek} onChange={(e) => setSchedDayOfWeek(Number(e.target.value))} style={styles.input}>
                        <option value={0}>{t('dayMon')}</option>
                        <option value={1}>{t('dayTue')}</option>
                        <option value={2}>{t('dayWed')}</option>
                        <option value={3}>{t('dayThu')}</option>
                        <option value={4}>{t('dayFri')}</option>
                        <option value={5}>{t('daySat')}</option>
                        <option value={6}>{t('daySun')}</option>
                      </select>
                    </div>

                    {schedFrequency === 'monthly' && (
                      <div style={{ flex: 1, minWidth: '150px' }}>
                        <label style={styles.schedLabel}>{t('schedWhichWeek')}</label>
                        <select value={schedWeekOfMonth} onChange={(e) => setSchedWeekOfMonth(Number(e.target.value))} style={styles.input}>
                          <option value={1}>{t('ordinal1')}</option>
                          <option value={2}>{t('ordinal2')}</option>
                          <option value={3}>{t('ordinal3')}</option>
                          <option value={4}>{t('ordinal4')}</option>
                        </select>
                      </div>
                    )}

                    <div style={{ flex: 1, minWidth: '120px' }}>
                      <label style={styles.schedLabel}>{t('timeOfDay')}</label>
                      <input type="time" value={schedTime} onChange={(e) => setSchedTime(e.target.value)} style={styles.input} />
                    </div>
                  </div>

                  {schedPostType === 'assignment' && (
                    <input
                      type="number"
                      placeholder={t('maxPointsOptional')}
                      value={schedMaxPoints}
                      onChange={(e) => setSchedMaxPoints(e.target.value)}
                      style={styles.input}
                      min="0"
                    />
                  )}

                  <p style={styles.hintText}>
                    {schedFrequency === 'monthly'
                      ? t('schedHintMonthly', {
                          ordinal: [t('ordinal1'),t('ordinal2'),t('ordinal3'),t('ordinal4')][schedWeekOfMonth-1],
                          day: [t('dayMon'),t('dayTue'),t('dayWed'),t('dayThu'),t('dayFri'),t('daySat'),t('daySun')][schedDayOfWeek],
                          time: schedTime
                        })
                      : schedFrequency === 'biweekly'
                        ? t('schedHintBiweekly', {
                            day: [t('dayMon'),t('dayTue'),t('dayWed'),t('dayThu'),t('dayFri'),t('daySat'),t('daySun')][schedDayOfWeek],
                            time: schedTime
                          })
                        : t('schedHintWeekly', {
                            day: [t('dayMon'),t('dayTue'),t('dayWed'),t('dayThu'),t('dayFri'),t('daySat'),t('daySun')][schedDayOfWeek],
                            time: schedTime
                          })
                    }
                  </p>

                  <button type="submit" disabled={loading || !schedTitle || !schedContent} style={styles.button}>
                    {loading ? t('schedCreating') : t('schedCreateBtn')}
                  </button>
                </form>
              )}

              {/* Scheduled Posts List */}
              {scheduledPosts.length === 0 ? (
                <p style={styles.emptyText}>{t('schedNoPosts')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {scheduledPosts.map((sp) => (
                    <div key={sp.id} style={{
                      padding: '1rem',
                      background: sp.active ? '#fff' : '#f8f9fa',
                      borderRadius: '8px',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      opacity: sp.active ? 1 : 0.6,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                            <strong>{sp.title}</strong>
                            <span style={{
                              fontSize: '0.7rem',
                              padding: '2px 8px',
                              borderRadius: '10px',
                              background: sp.post_type === 'announcement' ? '#fff3cd' : '#e8f0fe',
                              color: sp.post_type === 'announcement' ? '#856404' : '#1a73e8',
                            }}>
                              {sp.post_type === 'announcement' ? t('postTypeAnnouncement') : t('postTypeAssignment')}
                            </span>
                            <span style={{
                              fontSize: '0.7rem',
                              padding: '2px 8px',
                              borderRadius: '10px',
                              background: sp.active ? '#d4edda' : '#f8d7da',
                              color: sp.active ? '#155724' : '#721c24',
                            }}>
                              {sp.active ? t('active') : t('paused')}
                            </span>
                          </div>
                          <p style={{ fontSize: '0.85rem', color: '#555', margin: '0.25rem 0' }}>
                            {sp.frequency === 'monthly'
                              ? t('schedHintMonthly', {
                                  ordinal: [t('ordinal1'),t('ordinal2'),t('ordinal3'),t('ordinal4')][(sp.week_of_month || 1) - 1],
                                  day: [t('dayMonAbbr'),t('dayTueAbbr'),t('dayWedAbbr'),t('dayThuAbbr'),t('dayFriAbbr'),t('daySatAbbr'),t('daySunAbbr')][sp.day_of_week || 0],
                                  time: sp.time_of_day
                                })
                              : sp.frequency === 'biweekly'
                                ? t('schedHintBiweekly', {
                                    day: [t('dayMonAbbr'),t('dayTueAbbr'),t('dayWedAbbr'),t('dayThuAbbr'),t('dayFriAbbr'),t('daySatAbbr'),t('daySunAbbr')][sp.day_of_week || 0],
                                    time: sp.time_of_day
                                  })
                                : t('schedHintWeekly', {
                                    day: [t('dayMonAbbr'),t('dayTueAbbr'),t('dayWedAbbr'),t('dayThuAbbr'),t('dayFriAbbr'),t('daySatAbbr'),t('daySunAbbr')][sp.day_of_week || 0],
                                    time: sp.time_of_day
                                  })
                            }
                          </p>
                          <p style={{ fontSize: '0.8rem', color: '#888', margin: '0.25rem 0' }}>
                            {t('nextPost')} {new Date(sp.next_post_at).toLocaleDateString()}
                            {sp.last_posted_at && ` | ${t('lastPost')} ${new Date(sp.last_posted_at).toLocaleDateString()}`}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                          <button onClick={() => handlePostNow(sp.id)} disabled={loading} style={{ ...styles.smallButton, background: '#28a745', color: '#fff', border: 'none' }}>
                            {t('postNow')}
                          </button>
                          <button onClick={() => handleToggleSchedule(sp.id)} style={styles.smallButton}>
                            {sp.active ? t('pause') : t('resume')}
                          </button>
                          <button onClick={() => startEditPost(sp)} style={{ ...styles.smallButton, color: '#1a73e8' }}>
                            {tCommon('edit')}
                          </button>
                          <button onClick={() => handleDeleteSchedule(sp.id)} style={{ ...styles.smallButton, color: '#dc3545' }}>
                            {tCommon('delete')}
                          </button>
                        </div>
                      </div>
                      {editingPostId === sp.id ? (
                        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            style={styles.input}
                            placeholder={t('editTitlePlaceholder')}
                          />
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            style={{ ...styles.textarea, fontSize: '0.9rem' }}
                            rows={4}
                          />
                          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: '140px' }}>
                              <label style={styles.schedLabel}>{t('dayOfWeek')}</label>
                              <select value={editDayOfWeek} onChange={(e) => setEditDayOfWeek(Number(e.target.value))} style={styles.input}>
                                <option value={0}>{t('dayMon')}</option>
                                <option value={1}>{t('dayTue')}</option>
                                <option value={2}>{t('dayWed')}</option>
                                <option value={3}>{t('dayThu')}</option>
                                <option value={4}>{t('dayFri')}</option>
                                <option value={5}>{t('daySat')}</option>
                                <option value={6}>{t('daySun')}</option>
                              </select>
                            </div>
                            <div style={{ flex: 1, minWidth: '120px' }}>
                              <label style={styles.schedLabel}>{t('timeOfDay')}</label>
                              <input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} style={styles.input} />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button onClick={() => handleSaveEdit(sp.id)} style={{ ...styles.smallButton, background: '#28a745', color: '#fff', border: 'none' }}>{tCommon('save')}</button>
                            <button onClick={() => setEditingPostId(null)} style={styles.smallButton}>{tCommon('cancel')}</button>
                          </div>
                        </div>
                      ) : (
                        <p style={{ fontSize: '0.85rem', color: '#666', margin: '0.5rem 0 0 0', maxHeight: '60px', overflow: 'hidden' }}>
                          {sp.content.length > 200 ? sp.content.slice(0, 200) + '...' : sp.content}
                        </p>
                      )}
                    </div>
                  ))}
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
                <h2 style={styles.modalTitle}>{t('driveImportTitle')}</h2>
                <button onClick={() => setShowDriveImport(false)} style={styles.closeButton}>×</button>
              </div>
              <div style={styles.driveFileList}>
                {driveFiles.length === 0 ? (
                  <p style={styles.emptyText}>{t('driveNoFiles')}</p>
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
                        {loading ? '...' : t('importBtn')}
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
                <h2 style={styles.modalTitle}>{t('postToClassroomModalTitle')}</h2>
                <button onClick={() => setShowPostModal(false)} style={styles.closeButton}>×</button>
              </div>
              <div style={styles.saveModalContent}>
                {/* Post type toggle */}
                <label style={styles.saveLabel}>{t('postAs')}</label>
                <div style={styles.personalizationModeRow}>
                  <label style={styles.radioLabel}>
                    <input type="radio" checked={postMode === 'assignment'} onChange={() => setPostMode('assignment')} />
                    {t('postModeAssignment')}
                  </label>
                  <label style={styles.radioLabel}>
                    <input type="radio" checked={postMode === 'announcement'} onChange={() => setPostMode('announcement')} />
                    {t('postModeAnnouncement')}
                  </label>
                </div>

                {postMode === 'assignment' && (
                  <>
                    <label style={{...styles.saveLabel, marginTop: '1rem'}}>{t('assignmentTitleLabel')}</label>
                    <input
                      type="text"
                      value={postTitle}
                      onChange={(e) => setPostTitle(e.target.value)}
                      style={styles.input}
                      placeholder={t('assignmentTitleLabel')}
                    />

                    <label style={{...styles.saveLabel, marginTop: '1rem'}}>{t('pointsLabel')}</label>
                    <input
                      type="number"
                      value={postPoints}
                      onChange={(e) => setPostPoints(e.target.value)}
                      style={styles.input}
                      placeholder="e.g., 100"
                      min="0"
                    />

                    <label style={{...styles.saveLabel, marginTop: '1rem'}}>{t('dueDateLabel')}</label>
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
                      {t('saveAsDraftLabel')}
                    </label>
                  </>
                )}

                {postMode === 'announcement' && (
                  <p style={{ ...styles.hintText, marginTop: '1rem' }}>
                    {t('announcementStreamHint')}
                  </p>
                )}

                <div style={styles.saveModalActions}>
                  <button
                    onClick={() => setShowPostModal(false)}
                    style={styles.cancelButton}
                  >
                    {tCommon('cancel')}
                  </button>
                  <button
                    onClick={postToClassroom}
                    disabled={(postMode === 'assignment' && !postTitle) || loading}
                    style={styles.postConfirmButton}
                  >
                    {loading ? t('posting') : (
                      postMode === 'announcement'
                        ? t('postAnnouncement')
                        : (postAsDraft ? t('saveDraft') : t('postAssignmentBtn'))
                    )}
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
                <h2 style={styles.modalTitle}>{t('saveAssignmentModalTitle')}</h2>
                <button onClick={() => setShowSaveModal(false)} style={styles.closeButton}>×</button>
              </div>
              <div style={styles.saveModalContent}>
                <label style={styles.saveLabel}>{t('assignmentNameLabel')}</label>
                <input
                  type="text"
                  value={saveAssignmentName}
                  onChange={(e) => setSaveAssignmentName(e.target.value)}
                  style={styles.input}
                  placeholder={t('assignmentNamePlaceholder')}
                  autoFocus
                />
                <div style={styles.saveModalActions}>
                  <button
                    onClick={() => setShowSaveModal(false)}
                    style={styles.cancelButton}
                  >
                    {tCommon('cancel')}
                  </button>
                  <button
                    onClick={saveAssignment}
                    disabled={!saveAssignmentName || loading}
                    style={styles.saveConfirmButton}
                  >
                    {loading ? tCommon('saving') : tCommon('save')}
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
  app: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: '#f0f2f5',
  },
  main: {
    flex: 1,
    overflowY: 'auto',
    padding: '2rem',
    maxWidth: '1200px',
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
    border: '2px solid #1a73e8',
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
  personalizationModeRow: {
    display: 'flex',
    gap: '1.25rem',
    marginTop: '0.5rem',
    marginBottom: '0.25rem',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '0.9rem',
    cursor: 'pointer',
  },
  sharedBadge: {
    fontSize: '0.6rem',
    color: '#9334e6',
    background: '#f3e8ff',
    padding: '1px 5px',
    borderRadius: '8px',
    fontWeight: 600,
    flexShrink: 0,
  },
  schedLabel: {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: 500,
    color: '#555',
    marginBottom: '0.25rem',
  },
  checkPanel: {
    marginTop: '1rem',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  checkHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 14px',
    backgroundColor: '#f5f5f5',
    borderBottom: '1px solid #e0e0e0',
    fontSize: '0.88rem',
    fontWeight: 600,
    color: '#444',
  },
  checkClose: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1.2rem',
    color: '#888',
    lineHeight: 1,
    padding: 0,
  },
  checkBody: {
    padding: '12px 14px',
    backgroundColor: '#fafafa',
  },
  checkPre: {
    margin: 0,
    whiteSpace: 'pre-wrap' as const,
    fontFamily: 'inherit',
    fontSize: '0.9rem',
    lineHeight: '1.6',
    color: '#333',
  },
}
