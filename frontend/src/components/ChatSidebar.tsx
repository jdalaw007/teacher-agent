'use client'

import { useTranslations } from 'next-intl'

interface Conversation {
  id: string
  title: string
  started_at: string
  ended_at: string | null
  summary: string | null
}

interface ChatSidebarProps {
  conversations: Conversation[]
  activeConversationId: string | null
  focusClassId: string
  focusClassName: string
  classes: { id: string; name: string }[]
  studentCount: number
  recentInsights: string[]
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  onSelectClass: (id: string) => void
}

export default function ChatSidebar({
  conversations,
  activeConversationId,
  focusClassId,
  focusClassName,
  classes,
  studentCount,
  recentInsights,
  onSelectConversation,
  onNewConversation,
  onSelectClass,
}: ChatSidebarProps) {
  const t = useTranslations('chatSidebar')
  return (
    <div style={styles.sidebar}>
      {/* New Conversation Button */}
      <button onClick={onNewConversation} style={styles.newChatBtn}>
        {t('newConversation')}
      </button>

      {/* Class Focus */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>{t('focusClass')}</div>
        <select
          value={focusClassId}
          onChange={(e) => onSelectClass(e.target.value)}
          style={styles.classSelect}
        >
          <option value="">{t('allClasses')}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {focusClassId && (
          <div style={styles.classInfo}>
            <span>{t('studentCount', { count: studentCount })}</span>
          </div>
        )}
      </div>

      {/* Recent Insights */}
      {recentInsights.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>{t('agentInsights')}</div>
          {recentInsights.map((insight, i) => (
            <div key={i} style={styles.insightItem}>
              {insight}
            </div>
          ))}
        </div>
      )}

      {/* Past Conversations */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>{t('pastConversations')}</div>
        <div style={styles.convList}>
          {conversations.length === 0 && (
            <div style={styles.emptyText}>{t('noConversations')}</div>
          )}
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelectConversation(conv.id)}
              style={{
                ...styles.convItem,
                ...(conv.id === activeConversationId ? styles.convItemActive : {}),
              }}
            >
              <div style={styles.convTitle}>
                {conv.title || t('untitled')}
              </div>
              <div style={styles.convDate}>
                {new Date(conv.started_at).toLocaleDateString()}
                {conv.ended_at && ` ${t('ended')}`}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  sidebar: {
    width: '280px',
    minWidth: '280px',
    backgroundColor: '#f8f9fa',
    borderRight: '1px solid #e0e0e0',
    display: 'flex',
    flexDirection: 'column',
    padding: '1rem',
    overflowY: 'auto',
    gap: '0.5rem',
  },
  newChatBtn: {
    width: '100%',
    padding: '10px',
    backgroundColor: '#1a73e8',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: 'bold',
    marginBottom: '0.5rem',
  },
  section: {
    marginBottom: '0.5rem',
  },
  sectionTitle: {
    fontSize: '0.75rem',
    fontWeight: 'bold',
    color: '#666',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: '0.5rem',
  },
  classSelect: {
    width: '100%',
    padding: '8px',
    borderRadius: '6px',
    border: '1px solid #ddd',
    fontSize: '0.85rem',
    backgroundColor: 'white',
  },
  classInfo: {
    marginTop: '4px',
    fontSize: '0.8rem',
    color: '#666',
    padding: '4px 8px',
  },
  insightItem: {
    fontSize: '0.8rem',
    color: '#555',
    padding: '6px 8px',
    backgroundColor: '#e8f0fe',
    borderRadius: '4px',
    marginBottom: '4px',
    lineHeight: '1.3',
  },
  convList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  convItem: {
    width: '100%',
    textAlign: 'left' as const,
    padding: '8px 10px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    transition: 'background-color 0.15s',
  },
  convItemActive: {
    backgroundColor: '#e8f0fe',
  },
  convTitle: {
    fontSize: '0.85rem',
    color: '#333',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  convDate: {
    fontSize: '0.7rem',
    color: '#999',
    marginTop: '2px',
  },
  emptyText: {
    fontSize: '0.8rem',
    color: '#999',
    padding: '8px',
    fontStyle: 'italic',
  },
}
