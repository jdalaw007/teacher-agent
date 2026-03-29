'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { useTranslations } from 'next-intl'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const LANG_CODES: Record<string, string> = {
  English: 'en-US', Czech: 'cs-CZ', Slovak: 'sk-SK', Russian: 'ru-RU',
  Spanish: 'es-ES', French: 'fr-FR', German: 'de-DE', Polish: 'pl-PL',
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ToolStatus {
  name: string
  status: 'calling' | 'done'
}

interface EmailMessage {
  id: string
  from: string
  subject: string
  date: string
  snippet: string
  unread: boolean
}

interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  all_day: boolean
  location: string
}

interface Submission {
  student_name: string
  assignment_title: string
  class_id: string
  state: string
  submitted_at: string | null
}

interface Course {
  id: string
  name: string
}

// TOOL_LABELS now built dynamically inside component using translations

const FALLBACK_PROMPTS = [
  'How are my students doing on recent assignments?',
  'Draft a lesson plan for this week',
  'Create a formative assessment quiz',
  'What differentiation strategies should I try?',
]


function formatEmailDate(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (diffDays < 7) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function Dashboard() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const t = useTranslations('dashboard')
  const tCommon = useTranslations('common')

  const TOOL_LABELS: Record<string, string> = {
    search_corpus: t('toolSearchCorpus'),
    get_student_data: t('toolGetStudentData'),
    get_class_assignments: t('toolGetAssignments'),
    get_class_roster: t('toolGetRoster'),
    post_assignment: t('toolPostAssignment'),
    post_announcement: t('toolPostAnnouncement'),
    search_memories: t('toolSearchMemories'),
    log_strategy: t('toolLogStrategy'),
  }

  const [user, setUser] = useState<{ name: string; email: string } | null>(null)
  const [token, setToken] = useState<string | null>(null)

  // Chat state
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [toolStatuses, setToolStatuses] = useState<ToolStatus[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeConvId, setActiveConvId] = useState<string | null>(null)

  // Greeting state
  const [greetingText, setGreetingText] = useState('')
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>(FALLBACK_PROMPTS)

  // Live feed state
  const [emails, setEmails] = useState<EmailMessage[] | null>(null)
  const [emailsError, setEmailsError] = useState(false)
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[] | null>(null)
  const [calendarError, setCalendarError] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [feedbackSending, setFeedbackSending] = useState(false)

  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [langCode, setLangCode] = useState('cs-CZ')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  // Init
  useEffect(() => {
    const tokenFromUrl = searchParams.get('token')
    if (tokenFromUrl) {
      localStorage.setItem('token', tokenFromUrl)
      router.replace('/dashboard')
      return
    }

    setVoiceSupported(!!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition))

    const t = localStorage.getItem('token')
    if (!t) { router.push('/'); return }
    setToken(t)

    fetch(`${API_URL}/onboarding/profile`, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(d => {
        if (!d.onboarding_complete) router.push('/onboarding')
        if (d.language && LANG_CODES[d.language]) setLangCode(LANG_CODES[d.language])
        if (d.language) localStorage.setItem('language', d.language)
      })
      .catch(() => {})

    fetch(`${API_URL}/auth/user`, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => setUser(d))
      .catch(() => { localStorage.removeItem('token'); router.push('/') })

    fetch(`${API_URL}/classroom/courses`, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json()).then(d => setCourses(d.courses || [])).catch(() => {})

    fetch(`${API_URL}/dashboard/summary`, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json()).then(d => setSubmissions(d.submissions || [])).catch(() => {})

    fetch(`${API_URL}/gmail/messages?max_results=5`, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => setEmails(d.messages || []))
      .catch(() => { setEmails([]); setEmailsError(true) })

    fetch(`${API_URL}/calendar/events?max_results=20&days_ahead=7`, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => setCalendarEvents(d.events || []))
      .catch(() => { setCalendarEvents([]); setCalendarError(true) })

    fetch(`${API_URL}/scheduled-posts/check-due`, {
      method: 'POST', headers: { Authorization: `Bearer ${t}` },
    }).catch(() => {})

    fetch(`${API_URL}/dashboard/suggested-prompts`, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(d => { if (d.prompts?.length) setSuggestedPrompts(d.prompts) })
      .catch(() => {})
  }, [router, searchParams])

  // Set greeting instantly from user name
  useEffect(() => {
    if (!user) return
    const first = user.name?.split(' ')[0] || ''
    setGreetingText(t('greeting', { name: first }))
  }, [user, t])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setListening(false)
  }, [])

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return
    const recognition = new SpeechRecognition()
    recognition.lang = langCode
    recognition.continuous = true
    recognition.interimResults = true
    recognitionRef.current = recognition

    let silenceTimer: ReturnType<typeof setTimeout> | null = null
    const SILENCE_MS = 3000

    const resetSilenceTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer)
      silenceTimer = setTimeout(() => { recognition.stop() }, SILENCE_MS)
    }

    recognition.onstart = () => { setListening(true); resetSilenceTimer() }

    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .map((r: any) => r[0].transcript)
        .join('')
      setInputValue(transcript)
      resetSilenceTimer()
    }

    recognition.onend = () => {
      if (silenceTimer) clearTimeout(silenceTimer)
      setListening(false)
      recognitionRef.current = null
      setInputValue(prev => {
        if (prev.trim()) {
          setTimeout(() => {
            document.getElementById('dashboard-send-btn')?.click()
          }, 100)
        }
        return prev
      })
    }

    recognition.onerror = () => {
      if (silenceTimer) clearTimeout(silenceTimer)
      setListening(false)
      recognitionRef.current = null
    }

    recognition.start()
  }, [langCode])

  const sendMessage = async (text?: string) => {
    const msg = (text || inputValue).trim()
    if (!msg || !token || isStreaming) return

    stopListening()
    setInputValue('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setIsStreaming(true)
    setStreamingContent('')
    setToolStatuses([])

    try {
      let convId = activeConvId
      if (!convId) {
        const r = await fetch(`${API_URL}/chat/conversations`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: msg.slice(0, 60) }),
        })
        const d = await r.json()
        convId = d.id
        setActiveConvId(convId)
      }

      const res = await fetch(`${API_URL}/chat/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })
      if (!res.ok || !res.body) throw new Error('Stream failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const d = JSON.parse(line.slice(6))
            if (d.type === 'content') { fullContent += d.content; setStreamingContent(fullContent) }
            else if (d.type === 'tool_call') setToolStatuses(p => [...p, { name: d.name, status: 'calling' }])
            else if (d.type === 'tool_result') setToolStatuses(p => p.map(t => t.name === d.name ? { ...t, status: 'done' } : t))
          } catch {}
        }
      }

      if (fullContent) setMessages(prev => [...prev, { role: 'assistant', content: fullContent }])
      setStreamingContent('')
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: tCommon('error') }])
      setStreamingContent('')
    } finally {
      setIsStreaming(false)
      setToolStatuses([])
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const submissionsByClass = submissions.reduce((acc, s) => {
    const name = courses.find(c => c.id === s.class_id)?.name || tCommon('unknownClass')
    acc[name] = (acc[name] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const hasUserMessages = messages.some(m => m.role === 'user')

  return (
    <div style={styles.app}>
      <Sidebar />

      <div style={styles.body}>
        {/* Chat Panel */}
        <div style={styles.chatPanel}>
          <div style={styles.chatHeader}>
            <span style={styles.chatTitle}>{t('chatTitle')}</span>
          </div>

          <div style={styles.messagesArea}>
            {/* Greeting view (before any user message) */}
            {!hasUserMessages && (
              <>
                {greetingText && (
                  <div style={styles.greetingText}>{greetingText}</div>
                )}
                <div style={styles.suggestedSection}>
                  <div style={styles.suggestedLabel}>{t('suggestedLabel')}</div>
                  <div style={styles.suggestedBtns}>
                    {suggestedPrompts.map((p, i) => (
                      <button key={i} onClick={() => sendMessage(p)} style={styles.suggestedBtn}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Chat messages (after user sends first message) */}
            {hasUserMessages && messages.map((msg, i) => (
              <div key={i} style={msg.role === 'user' ? styles.userBubble : styles.aiBubble}>
                {msg.role === 'user' ? msg.content : renderContent(msg.content)}
              </div>
            ))}

            {/* Tool indicators */}
            {toolStatuses.length > 0 && (
              <div style={styles.toolArea}>
                {toolStatuses.map((t, i) => (
                  <div key={i} style={styles.toolItem}>
                    <span style={{ color: '#1a73e8', fontSize: '0.75rem', minWidth: 14 }}>
                      {t.status === 'calling' ? '...' : '✓'}
                    </span>
                    <span>{TOOL_LABELS[t.name] || t.name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Streaming response */}
            {streamingContent && hasUserMessages && (
              <div style={styles.aiBubble}>
                {renderContent(streamingContent)}
                <span style={styles.cursor}>|</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div style={styles.inputRow}>
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={voiceSupported ? t('placeholderVoice') : t('placeholderText')}
              disabled={isStreaming}
              style={styles.textarea}
              rows={1}
            />
            {voiceSupported && (
              <button
                onClick={() => listening ? stopListening() : startListening()}
                disabled={isStreaming}
                title={listening ? t('listeningStop') : "Voice input — use student codenames, not real names"}
                style={{ ...styles.micBtn, background: listening ? '#ea4335' : '#f1f3f4', opacity: isStreaming ? 0.4 : 1 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={listening ? '#fff' : '#555'}>
                  <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/>
                  <path d="M19 10a7 7 0 0 1-14 0" stroke={listening ? '#fff' : '#555'} strokeWidth="2" fill="none" strokeLinecap="round"/>
                  <line x1="12" y1="19" x2="12" y2="23" stroke={listening ? '#fff' : '#555'} strokeWidth="2" strokeLinecap="round"/>
                  <line x1="8" y1="23" x2="16" y2="23" stroke={listening ? '#fff' : '#555'} strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            )}
            <button
              id="dashboard-send-btn"
              onClick={() => sendMessage()}
              disabled={!inputValue.trim() || isStreaming}
              style={{ ...styles.sendBtn, opacity: !inputValue.trim() || isStreaming ? 0.4 : 1 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>

        {/* Live Feed */}
        <div style={styles.liveFeed}>
          <div style={styles.liveFeedTitle}>{t('liveFeed')}</div>

          {/* Inbox */}
          <div style={styles.card}>
            <div style={styles.cardHead}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </svg>
              <span style={styles.cardLabel}>{t('inbox')}</span>
            </div>
            {emails === null && !emailsError ? (
              <p style={styles.cardHint}>{tCommon('loading')}</p>
            ) : emailsError ? (
              <div>
                <p style={styles.cardHint}>{t('gmailNotConnected')}</p>
                <button
                  style={styles.reloginBtn}
                  onClick={() => { localStorage.removeItem('token'); window.location.href = `${API_URL}/auth/login` }}
                >
                  {t('signInAgain')}
                </button>
              </div>
            ) : emails!.length === 0 ? (
              <p style={styles.cardHint}>{t('noRecentEmails')}</p>
            ) : (
              emails!.map(em => (
                <div key={em.id} style={styles.feedRow}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ ...styles.feedFrom, ...(em.unread ? { fontWeight: 700, color: '#111' } : {}) }}>
                      {em.from.replace(/<.*>/, '').trim() || em.from}
                    </span>
                    <span style={styles.feedDate}>{formatEmailDate(em.date)}</span>
                  </div>
                  <div style={{ ...styles.feedSubject, ...(em.unread ? { fontWeight: 600, color: '#222' } : {}) }}>
                    {em.subject}
                  </div>
                  {em.snippet && (
                    <div style={styles.feedSnippet}>{em.snippet}</div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Calendar */}
          <div style={styles.card}>
            <div style={styles.cardHead}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span style={styles.cardLabel}>{t('calendar')}</span>
            </div>
            {calendarError ? (
              <p style={styles.cardHint}>{t('calendarError')}</p>
            ) : calendarEvents === null ? (
              <p style={styles.cardHint}>...</p>
            ) : calendarEvents.length === 0 ? (
              <p style={styles.cardHint}>{t('calendarNoEvents')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {calendarEvents.map(ev => {
                  const start = new Date(ev.start)
                  const isToday = new Date().toDateString() === start.toDateString()
                  const dayLabel = isToday
                    ? start.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase() + ' (today)'
                    : start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
                  const timeLabel = ev.all_day
                    ? t('calendarAllDay')
                    : start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                  return (
                    <div key={ev.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <div style={{ minWidth: '44px', textAlign: 'right' }}>
                        <div style={{ fontSize: '10px', color: '#888', fontWeight: 500, lineHeight: 1.3 }}>{dayLabel.split(' ')[0]}</div>
                        <div style={{ fontSize: '10px', color: isToday ? '#1a73e8' : '#aaa' }}>{timeLabel}</div>
                      </div>
                      <div style={{ flex: 1, borderLeft: `2px solid ${isToday ? '#1a73e8' : '#e0e0e0'}`, paddingLeft: '8px' }}>
                        <div style={{ fontSize: '13px', fontWeight: isToday ? 600 : 400, color: isToday ? '#1a73e8' : '#333', lineHeight: 1.3 }}>{ev.title}</div>
                        {ev.location && <div style={{ fontSize: '11px', color: '#888', marginTop: '1px' }}>{ev.location}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Suggestion Box */}
          <div style={styles.card}>
            <div style={styles.cardHead}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span style={styles.cardLabel}>{t('suggestionBox')}</span>
            </div>
            {feedbackSent ? (
              <p style={{ ...styles.cardHint, color: '#34a853' }}>{t('feedbackSent')}</p>
            ) : feedbackOpen ? (
              <div>
                <textarea
                  autoFocus
                  value={feedbackText}
                  onChange={e => setFeedbackText(e.target.value)}
                  placeholder={t('feedbackPlaceholder')}
                  style={styles.feedbackTextarea}
                  rows={3}
                />
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button
                    style={{ ...styles.reloginBtn, opacity: feedbackSending || !feedbackText.trim() ? 0.5 : 1 }}
                    disabled={feedbackSending || !feedbackText.trim()}
                    onClick={async () => {
                      if (!token || !feedbackText.trim()) return
                      setFeedbackSending(true)
                      try {
                        await fetch(`${API_URL}/feedback/submit`, {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                          body: JSON.stringify({ message: feedbackText.trim() }),
                        })
                        setFeedbackSent(true)
                        setFeedbackOpen(false)
                        setFeedbackText('')
                      } finally {
                        setFeedbackSending(false)
                      }
                    }}
                  >
                    {feedbackSending ? tCommon('sending') : t('feedbackSend')}
                  </button>
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: '#aaa' }}
                    onClick={() => { setFeedbackOpen(false); setFeedbackText('') }}
                  >
                    {t('feedbackCancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button style={styles.reloginBtn} onClick={() => setFeedbackOpen(true)}>
                {t('leaveSuggestion')}
              </button>
            )}
          </div>

          {/* Google Classroom */}
          <div style={styles.card}>
            <div style={styles.cardHead}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="3" width="20" height="18" rx="2" fill="#34a853" />
                <rect x="6" y="8" width="12" height="1.5" rx="0.75" fill="white" />
                <rect x="6" y="12" width="12" height="1.5" rx="0.75" fill="white" />
                <rect x="6" y="16" width="7" height="1.5" rx="0.75" fill="white" />
              </svg>
              <span style={styles.cardLabel}>{t('googleClassroom')}</span>
            </div>
            {Object.keys(submissionsByClass).length === 0 ? (
              <p style={styles.cardHint}>{t('noNewSubmissions')}</p>
            ) : (
              Object.entries(submissionsByClass).map(([name, count]) => (
                <div key={name} style={styles.feedRow}>
                  <span style={{ fontWeight: 600, color: '#333', fontSize: '0.85rem' }}>{name}: </span>
                  <span style={{ color: '#555', fontSize: '0.85rem' }}>
                    {count !== 1 ? t('newSubmissions', { count }) : t('newSubmission', { count })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function renderContent(text: string) {
  const cleaned = text.replace(/\[ACTION:[^\]]+\]/g, '').trim()
  const lines = cleaned.split('\n')
  return lines.map((line, i) => {
    let processed = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const content = line.trim().slice(2).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      return <div key={i} style={{ paddingLeft: '1rem', marginBottom: '2px' }}><span dangerouslySetInnerHTML={{ __html: '&bull; ' + content }} /></div>
    }
    const numMatch = line.trim().match(/^(\d+)\.\s(.+)/)
    if (numMatch) {
      processed = numMatch[2].replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      return <div key={i} style={{ paddingLeft: '1rem', marginBottom: '2px' }}><span dangerouslySetInnerHTML={{ __html: numMatch[1] + '. ' + processed }} /></div>
    }
    if (line.trim().startsWith('## ')) return <div key={i} style={{ fontWeight: 'bold', fontSize: '1.05rem', marginTop: '8px', marginBottom: '4px' }}>{line.trim().slice(3)}</div>
    if (line.trim().startsWith('# ')) return <div key={i} style={{ fontWeight: 'bold', fontSize: '1.1rem', marginTop: '8px', marginBottom: '4px' }}>{line.trim().slice(2)}</div>
    if (!line.trim()) return <div key={i} style={{ height: '8px' }} />
    return <div key={i} style={{ marginBottom: '2px' }}><span dangerouslySetInnerHTML={{ __html: processed }} /></div>
  })
}

const styles: { [key: string]: React.CSSProperties } = {
  app: {
    display: 'flex',
    height: '100vh',
    overflow: 'hidden',
    backgroundColor: '#f0f2f5',
  },
  body: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    padding: '12px',
    gap: '12px',
  },
  chatPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#fff',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    overflow: 'hidden',
  },
  chatHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid #f0f0f0',
    display: 'flex',
    alignItems: 'center',
  },
  chatTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#333',
  },
  messagesArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '28px 28px 12px',
  },
  greetingText: {
    fontSize: '1.65rem',
    fontWeight: 600,
    color: '#1a1a2e',
    lineHeight: 1.35,
    marginBottom: '32px',
    whiteSpace: 'pre-wrap',
  },
  suggestedSection: {
    marginTop: '4px',
  },
  suggestedLabel: {
    fontSize: '0.82rem',
    color: '#bbb',
    marginBottom: '12px',
    fontStyle: 'italic',
  },
  suggestedBtns: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  suggestedBtn: {
    padding: '10px 16px',
    backgroundColor: '#f8f9fa',
    border: '1px solid #e0e0e0',
    borderRadius: '20px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    color: '#444',
  },
  userBubble: {
    backgroundColor: '#1a73e8',
    color: '#fff',
    padding: '10px 14px',
    borderRadius: '18px 18px 4px 18px',
    fontSize: '0.92rem',
    lineHeight: 1.5,
    maxWidth: '80%',
    marginBottom: '12px',
    marginLeft: 'auto',
    wordBreak: 'break-word' as const,
  },
  aiBubble: {
    backgroundColor: '#f0f4ff',
    padding: '12px 16px',
    borderRadius: '18px 18px 18px 4px',
    fontSize: '0.92rem',
    lineHeight: 1.5,
    color: '#222',
    maxWidth: '85%',
    marginBottom: '12px',
    wordBreak: 'break-word' as const,
  },
  toolArea: {
    padding: '2px 0 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  toolItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '0.8rem',
    color: '#888',
    fontStyle: 'italic',
  },
  cursor: {
    animation: 'blink 1s infinite',
    color: '#1a73e8',
  },
  inputRow: {
    display: 'flex',
    gap: '8px',
    padding: '12px 16px',
    borderTop: '1px solid #f0f0f0',
    alignItems: 'flex-end',
  },
  textarea: {
    flex: 1,
    padding: '10px 14px',
    border: '1px solid #e0e0e0',
    borderRadius: '10px',
    fontSize: '0.92rem',
    fontFamily: 'inherit',
    resize: 'none' as const,
    outline: 'none',
    minHeight: '42px',
    maxHeight: '120px',
    backgroundColor: '#f8f9fa',
  },
  micBtn: {
    width: '38px',
    height: '38px',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'background 0.15s',
  },
  sendBtn: {
    width: '42px',
    height: '42px',
    backgroundColor: '#1a73e8',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  liveFeed: {
    width: '320px',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    flexShrink: 0,
  },
  liveFeedTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#444',
    padding: '4px 2px',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '14px 16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '10px',
  },
  cardLabel: {
    fontSize: '0.7rem',
    fontWeight: 700,
    color: '#888',
    letterSpacing: '0.06em',
  },
  cardHint: {
    color: '#bbb',
    fontSize: '0.85rem',
    margin: 0,
  },
  feedRow: {
    padding: '6px 0',
    borderBottom: '1px solid #f5f5f5',
  },
  feedFrom: {
    fontSize: '0.82rem',
    color: '#555',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1,
  },
  feedDate: {
    fontSize: '0.75rem',
    color: '#bbb',
    whiteSpace: 'nowrap' as const,
  },
  feedSubject: {
    fontSize: '0.82rem',
    color: '#777',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    marginTop: '1px',
  },
  feedSnippet: {
    fontSize: '0.78rem',
    color: '#bbb',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    marginTop: '2px',
  },
  feedbackTextarea: {
    width: '100%', padding: '8px 10px', fontSize: '0.83rem',
    border: '1px solid #e0e0e0', borderRadius: '8px', resize: 'none' as const,
    fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' as const,
    backgroundColor: '#f8f9fa',
  },
  reloginBtn: {
    marginTop: '6px',
    padding: '5px 12px',
    backgroundColor: '#1a73e8',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
}
