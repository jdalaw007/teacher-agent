'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ToolStatus {
  name: string
  status: 'calling' | 'done'
}

const LANG_CODES: Record<string, string> = {
  English: 'en-US',
  Czech: 'cs-CZ',
  Russian: 'ru-RU',
  Spanish: 'es-ES',
  French: 'fr-FR',
}

function getPageLabel(pathname: string, pageLabels: Record<string, string>, classDetailLabel: string): string {
  if (pageLabels[pathname]) return pageLabels[pathname]
  if (pathname.startsWith('/classes/')) return classDetailLabel
  return pathname.replace('/', '').replace(/-/g, ' ') || 'App'
}

function renderContent(text: string) {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    const boldLine = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    return (
      <span key={i}>
        <span dangerouslySetInnerHTML={{ __html: boldLine }} />
        {i < lines.length - 1 && <br />}
      </span>
    )
  })
}

export default function FloatingAgent() {
  const pathname = usePathname() || ''
  const router = useRouter()
  const t = useTranslations('floatingAgent')
  const tCommon = useTranslations('common')
  const tNav = useTranslations('nav')

  const TOOL_LABELS: Record<string, string> = {
    navigate: t('toolNavigating'),
    search_corpus: t('toolSearchCorpus'),
    get_student_data: t('toolGetStudents'),
    get_class_assignments: t('toolGetAssignments'),
    get_class_roster: t('toolGetRoster'),
    post_assignment: t('toolPostAssignment'),
    post_announcement: t('toolPostAnnouncement'),
    search_memories: t('toolSearchMemories'),
    log_strategy: t('toolLogStrategy'),
    set_language: t('toolSetLanguage'),
  }

  const PAGE_LABELS: Record<string, string> = {
    '/dashboard': tNav('dashboard'),
    '/classes': tNav('classes'),
    '/files': tNav('files'),
    '/inbox': tNav('inbox'),
    '/calendar': tNav('calendar'),
    '/settings': tNav('settings'),
    '/admin': tNav('admin'),
    '/onboarding': t('pageOnboarding'),
    '/agent': tNav('agent'),
  }

  const [open, setOpen] = useState(false)
  const [hasToken, setHasToken] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [toolStatuses, setToolStatuses] = useState<ToolStatus[]>([])
  const [convId, setConvId] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(false)
  const [langCode, setLangCode] = useState('en-US')
  const [voiceSupported, setVoiceSupported] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    setHasToken(!!localStorage.getItem('token'))
    setTtsEnabled(localStorage.getItem('agent_tts') === 'true')
    // Check voice support
    const hasSTT = !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
    setVoiceSupported(hasSTT)
    // Fetch language preference
    const token = localStorage.getItem('token')
    if (token) {
      fetch(`${API_URL}/onboarding/profile`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => { if (d.language && LANG_CODES[d.language]) setLangCode(LANG_CODES[d.language]) })
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const speak = useCallback((text: string) => {
    if (!ttsEnabled || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    // Strip markdown
    const clean = text.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')
    const utt = new SpeechSynthesisUtterance(clean)
    utt.lang = langCode
    utt.rate = 1.0
    window.speechSynthesis.speak(utt)
  }, [ttsEnabled, langCode])

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
    recognition.continuous = false
    recognition.interimResults = true
    recognitionRef.current = recognition

    recognition.onstart = () => setListening(true)

    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .map((r: any) => r[0].transcript)
        .join('')
      setInput(transcript)
    }

    recognition.onend = () => {
      setListening(false)
      recognitionRef.current = null
      // Auto-send if we captured something
      setInput(prev => {
        if (prev.trim()) {
          setTimeout(() => {
            const sendBtn = document.getElementById('agent-send-btn')
            sendBtn?.click()
          }, 100)
        }
        return prev
      })
    }

    recognition.onerror = () => {
      setListening(false)
      recognitionRef.current = null
    }

    recognition.start()
  }, [langCode])

  const toggleListening = () => {
    if (listening) {
      stopListening()
    } else {
      startListening()
    }
  }

  const toggleTts = () => {
    const next = !ttsEnabled
    setTtsEnabled(next)
    localStorage.setItem('agent_tts', String(next))
    if (!next) window.speechSynthesis?.cancel()
  }

  // Hide on login page and dashboard
  const hide = pathname === '/' || pathname === '/dashboard' || !hasToken
  if (hide) return null

  const pageLabel = getPageLabel(pathname, PAGE_LABELS, t('pageClassDetail'))

  const send = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || streaming) return
    setInput('')
    stopListening()
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setStreaming(true)
    setStreamingContent('')
    setToolStatuses([])

    const token = localStorage.getItem('token')

    try {
      let cid = convId
      if (!cid) {
        const r = await fetch(`${API_URL}/chat/conversations`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: msg.slice(0, 60) }),
        })
        const d = await r.json()
        cid = d.id
        setConvId(cid)
      }

      const res = await fetch(`${API_URL}/chat/conversations/${cid}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, page_context: pageLabel }),
      })
      if (!res.ok || !res.body) throw new Error('Stream failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let full = ''

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
            if (d.type === 'content') { full += d.content; setStreamingContent(full) }
            else if (d.type === 'navigate') { router.push(d.path) }
            else if (d.type === 'tool_call') setToolStatuses(p => [...p, { name: d.name, status: 'calling' }])
            else if (d.type === 'tool_result') setToolStatuses(p => p.map(t => t.name === d.name ? { ...t, status: 'done' } : t))
          } catch { /* ignore */ }
        }
      }

      if (full) {
        setMessages(prev => [...prev, { role: 'assistant', content: full }])
        speak(full)
      }
      setStreamingContent('')
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: tCommon('error') }])
      setStreamingContent('')
    } finally {
      setStreaming(false)
      setToolStatuses([])
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const clearChat = () => {
    setMessages([])
    setConvId(null)
    setStreamingContent('')
    setToolStatuses([])
    window.speechSynthesis?.cancel()
  }

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={s.fab}
        title={t('openAgent')}
        aria-label={t('openAgent')}
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>

      {/* Panel */}
      {open && (
        <div style={s.panel}>
          {/* Header */}
          <div style={s.header}>
            <div style={s.headerLeft}>
              <span style={s.headerTitle}>{t('agentTitle')}</span>
              <span style={s.pageTag}>{pageLabel}</span>
            </div>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              {/* TTS toggle */}
              <button
                onClick={toggleTts}
                style={{ ...s.headerBtn, color: ttsEnabled ? '#1a73e8' : '#ccc' }}
                title={ttsEnabled ? t('muteVoice') : t('enableVoice')}
              >
                <SpeakerIcon active={ttsEnabled} />
              </button>
              {messages.length > 0 && (
                <button onClick={clearChat} style={s.headerBtn} title={t('newConversation')}>
                  <NewIcon />
                </button>
              )}
              <button onClick={() => setOpen(false)} style={s.headerBtn} title={t('minimize')}>
                <MinimizeIcon />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={s.messages}>
            {messages.length === 0 && !streaming && (
              <div style={s.emptyState}>
                {voiceSupported ? t('emptyVoice') : t('emptyText')}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} style={msg.role === 'user' ? s.userBubble : s.aiBubble}>
                {msg.role === 'user' ? msg.content : renderContent(msg.content)}
              </div>
            ))}

            {toolStatuses.length > 0 && (
              <div style={s.toolArea}>
                {toolStatuses.map((t, i) => (
                  <div key={i} style={s.toolItem}>
                    <span style={{ color: '#1a73e8', fontSize: '0.7rem', minWidth: 12 }}>
                      {t.status === 'calling' ? '···' : '✓'}
                    </span>
                    <span>{TOOL_LABELS[t.name] || t.name}</span>
                  </div>
                ))}
              </div>
            )}

            {streamingContent && (
              <div style={s.aiBubble}>
                {renderContent(streamingContent)}
                <span style={s.cursor}>|</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={s.inputRow}>
            {voiceSupported && (
              <button
                onClick={toggleListening}
                disabled={streaming}
                style={{
                  ...s.micBtn,
                  background: listening ? '#ea4335' : '#f1f3f4',
                  boxShadow: listening ? '0 0 0 4px rgba(234,67,53,0.2)' : 'none',
                }}
                title={listening ? t('stopListening') : t('speak')}
              >
                <MicIcon active={listening} />
              </button>
            )}
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              placeholder={listening ? t('listening') : t('askAgent')}
              style={{ ...s.textarea, borderColor: listening ? '#ea4335' : '#e0e0e0' }}
              disabled={streaming}
            />
            <button
              id="agent-send-btn"
              onClick={() => send()}
              disabled={!input.trim() || streaming}
              style={{ ...s.sendBtn, opacity: (!input.trim() || streaming) ? 0.4 : 1 }}
            >
              <SendIcon />
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function MinimizeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2.5" strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function NewIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? '#fff' : '#666'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  )
}

function SpeakerIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? '#1a73e8' : '#ccc'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {active && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
      {active && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
    </svg>
  )
}

const s: { [k: string]: React.CSSProperties } = {
  fab: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    background: '#1a73e8',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 16px rgba(26,115,232,0.4)',
    zIndex: 1000,
    transition: 'transform 0.15s ease',
  },
  panel: {
    position: 'fixed',
    bottom: '88px',
    right: '24px',
    width: '360px',
    height: '480px',
    backgroundColor: '#fff',
    borderRadius: '14px',
    boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 999,
    overflow: 'hidden',
    border: '1px solid #e8eaed',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafafa',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  headerTitle: {
    fontWeight: 600,
    fontSize: '0.9rem',
    color: '#333',
  },
  pageTag: {
    fontSize: '0.72rem',
    backgroundColor: '#e8f0fe',
    color: '#1a73e8',
    padding: '2px 7px',
    borderRadius: '10px',
    fontWeight: 500,
  },
  headerBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  emptyState: {
    color: '#aaa',
    fontSize: '0.85rem',
    textAlign: 'center',
    marginTop: '60px',
    lineHeight: 1.6,
    padding: '0 16px',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#1a73e8',
    color: '#fff',
    padding: '8px 12px',
    borderRadius: '14px 14px 4px 14px',
    maxWidth: '85%',
    fontSize: '0.87rem',
    lineHeight: 1.45,
    wordBreak: 'break-word',
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#f1f3f4',
    color: '#333',
    padding: '8px 12px',
    borderRadius: '14px 14px 14px 4px',
    maxWidth: '90%',
    fontSize: '0.87rem',
    lineHeight: 1.55,
    wordBreak: 'break-word',
  },
  toolArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    paddingLeft: '4px',
  },
  toolItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '0.78rem',
    color: '#888',
  },
  cursor: {
    display: 'inline-block',
    animation: 'blink 1s step-start infinite',
    marginLeft: '2px',
    color: '#1a73e8',
  },
  inputRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '6px',
    padding: '10px 12px',
    borderTop: '1px solid #f0f0f0',
    flexShrink: 0,
  },
  micBtn: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'background 0.15s, box-shadow 0.15s',
  },
  textarea: {
    flex: 1,
    resize: 'none',
    border: '1px solid #e0e0e0',
    borderRadius: '10px',
    padding: '8px 10px',
    fontSize: '0.87rem',
    lineHeight: 1.4,
    outline: 'none',
    fontFamily: 'inherit',
    backgroundColor: '#fafafa',
    maxHeight: '100px',
    overflowY: 'auto',
    transition: 'border-color 0.15s',
  },
  sendBtn: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    background: '#1a73e8',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    flexShrink: 0,
    transition: 'opacity 0.15s',
  },
}
