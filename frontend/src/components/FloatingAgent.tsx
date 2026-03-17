'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ToolStatus {
  name: string
  status: 'calling' | 'done'
}

const TOOL_LABELS: Record<string, string> = {
  search_corpus: 'Searching documents...',
  get_student_data: 'Looking up students...',
  get_class_assignments: 'Fetching assignments...',
  get_class_roster: 'Loading roster...',
  post_assignment: 'Posting assignment...',
  post_announcement: 'Posting announcement...',
  search_memories: 'Searching memories...',
  log_strategy: 'Logging strategy...',
}

const PAGE_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/classes': 'Classes',
  '/files': 'Files',
  '/inbox': 'Inbox',
  '/calendar': 'Calendar',
  '/settings': 'Settings',
  '/admin': 'Admin',
  '/onboarding': 'Onboarding',
  '/agent': 'Assignment Generator',
}

function getPageLabel(pathname: string): string {
  if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname]
  if (pathname.startsWith('/classes/')) return 'Class Detail'
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
  const [open, setOpen] = useState(false)
  const [hasToken, setHasToken] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [toolStatuses, setToolStatuses] = useState<ToolStatus[]>([])
  const [convId, setConvId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setHasToken(!!localStorage.getItem('token'))
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Hide on login page and dashboard (dashboard has the full agent already)
  const hide = pathname === '/' || pathname === '/dashboard' || !hasToken
  if (hide) return null

  const pageLabel = getPageLabel(pathname)

  const send = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || streaming) return
    setInput('')
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
            else if (d.type === 'tool_call') setToolStatuses(p => [...p, { name: d.name, status: 'calling' }])
            else if (d.type === 'tool_result') setToolStatuses(p => p.map(t => t.name === d.name ? { ...t, status: 'done' } : t))
          } catch { /* ignore */ }
        }
      }

      if (full) setMessages(prev => [...prev, { role: 'assistant', content: full }])
      setStreamingContent('')
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
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
  }

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={s.fab}
        title="Open Agent"
        aria-label="Toggle agent chat"
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>

      {/* Panel */}
      {open && (
        <div style={s.panel}>
          {/* Header */}
          <div style={s.header}>
            <div style={s.headerLeft}>
              <span style={s.headerTitle}>Agent</span>
              <span style={s.pageTag}>{pageLabel}</span>
            </div>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              {messages.length > 0 && (
                <button onClick={clearChat} style={s.headerBtn} title="New conversation">
                  <NewIcon />
                </button>
              )}
              <button onClick={() => setOpen(false)} style={s.headerBtn} title="Minimize">
                <MinimizeIcon />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={s.messages}>
            {messages.length === 0 && !streaming && (
              <div style={s.emptyState}>
                Ask me anything about your students, classes, or content.
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
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              placeholder="Ask your agent..."
              style={s.textarea}
              disabled={streaming}
            />
            <button
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
    color: '#666',
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
    gap: '8px',
    padding: '10px 12px',
    borderTop: '1px solid #f0f0f0',
    flexShrink: 0,
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
