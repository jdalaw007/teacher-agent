'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { useTranslations } from 'next-intl'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Course {
  id: string
  name: string
  section?: string
}

interface Folder {
  id: string
  class_id: string
  name: string
  parent_id: string | null
}

interface Doc {
  id: string
  title: string
  filename?: string
  folder_id?: string | null
  source?: string
}

interface Selection {
  class_id: string
  folder_id: string | null
}

interface PreviewState {
  doc: Doc
  content: string | null
  loading: boolean
}

export default function FilesPage() {
  const router = useRouter()
  const t = useTranslations('files')
  const tCommon = useTranslations('common')
  const [token, setToken] = useState<string | null>(null)
  const [courses, setCourses] = useState<Course[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [selected, setSelected] = useState<Selection>({ class_id: 'general', folder_id: null })
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['general']))
  const [loading, setLoading] = useState(true)
  const [docsLoading, setDocsLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [newFolderFor, setNewFolderFor] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState('')
  const [hoveredFolder, setHoveredFolder] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [driveFiles, setDriveFiles] = useState<{id: string, name: string, mimeType: string}[]>([])
  const [showDriveModal, setShowDriveModal] = useState(false)
  const [loadingDrive, setLoadingDrive] = useState(false)
  const [importingId, setImportingId] = useState<string | null>(null)

  useEffect(() => {
    const t = localStorage.getItem('token')
    if (!t) { router.push('/'); return }
    setToken(t)
    Promise.all([
      fetch(`${API_URL}/classroom/courses`, { headers: { Authorization: `Bearer ${t}` } }),
      fetch(`${API_URL}/files/folders`, { headers: { Authorization: `Bearer ${t}` } }),
    ]).then(async ([cRes, fRes]) => {
      if (cRes.ok) { const d = await cRes.json(); setCourses(d.courses || []) }
      if (fRes.ok) { const d = await fRes.json(); setFolders(d.folders || []) }
    }).finally(() => setLoading(false))
  }, [router])

  useEffect(() => {
    if (!token) return
    loadDocs(selected.class_id)
    setPreview(null)
  }, [selected.class_id, token])

  const loadDocs = async (class_id: string) => {
    if (!token) return
    setDocsLoading(true)
    try {
      const res = await fetch(`${API_URL}/files/documents?class_id=${class_id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) { const d = await res.json(); setDocs(d.documents || []) }
    } finally {
      setDocsLoading(false)
    }
  }

  const openPreview = async (doc: Doc) => {
    if (!token) return
    setPreview({ doc, content: null, loading: true })
    try {
      const res = await fetch(
        `${API_URL}/files/documents/${doc.id}/content?class_id=${selected.class_id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (res.ok) {
        const d = await res.json()
        setPreview({ doc, content: d.content, loading: false })
      } else {
        setPreview({ doc, content: '(Could not load content)', loading: false })
      }
    } catch {
      setPreview({ doc, content: '(Error loading content)', loading: false })
    }
  }

  const startRename = (doc: Doc, e: React.MouseEvent) => {
    e.stopPropagation()
    setRenamingId(doc.id)
    setRenameValue(doc.title)
  }

  const submitRename = async (docId: string) => {
    if (!token || !renameValue.trim()) { setRenamingId(null); return }
    const res = await fetch(`${API_URL}/files/documents/${docId}/rename`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ class_id: selected.class_id, title: renameValue.trim() }),
    })
    if (res.ok) {
      const updated = await res.json()
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, title: updated.title } : d))
      if (preview?.doc.id === docId) {
        setPreview(prev => prev ? { ...prev, doc: { ...prev.doc, title: updated.title } } : prev)
      }
    }
    setRenamingId(null)
  }

  const selectItem = (class_id: string, folder_id: string | null) => {
    setSelected({ class_id, folder_id })
    setExpanded(prev => new Set([...prev, class_id]))
  }

  const toggleExpand = (e: React.MouseEvent, class_id: string) => {
    e.stopPropagation()
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(class_id)) next.delete(class_id)
      else next.add(class_id)
      return next
    })
  }

  const createFolder = async (class_id: string) => {
    if (!newFolderName.trim() || !token) return
    try {
      const res = await fetch(`${API_URL}/files/folders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName.trim(), class_id }),
      })
      if (res.ok) { const f = await res.json(); setFolders(prev => [...prev, f]) }
    } finally {
      setNewFolderName('')
      setNewFolderFor(null)
    }
  }

  const deleteFolder = async (e: React.MouseEvent, folderId: string) => {
    e.stopPropagation()
    if (!token || !confirm(t('deleteFolder'))) return
    await fetch(`${API_URL}/files/folders/${folderId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    setFolders(prev => prev.filter(f => f.id !== folderId))
    if (selected.folder_id === folderId) setSelected(prev => ({ ...prev, folder_id: null }))
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !token) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('class_id', selected.class_id)
    if (selected.folder_id) fd.append('folder_id', selected.folder_id)
    try {
      const res = await fetch(`${API_URL}/files/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (res.ok) await loadDocs(selected.class_id)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const deleteDoc = async (docId: string) => {
    if (!token || !confirm(t('deleteFile'))) return
    await fetch(`${API_URL}/files/documents/${docId}?class_id=${selected.class_id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    setDocs(prev => prev.filter(d => d.id !== docId))
    if (preview?.doc.id === docId) setPreview(null)
  }

  const openDriveModal = async () => {
    setShowDriveModal(true)
    setLoadingDrive(true)
    try {
      const res = await fetch(`${API_URL}/files/drive-files`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) { const d = await res.json(); setDriveFiles(d.files || []) }
    } finally {
      setLoadingDrive(false)
    }
  }

  const importFromDrive = async (fileId: string, fileName: string) => {
    if (!token) return
    setImportingId(fileId)
    const fd = new FormData()
    fd.append('file_id', fileId)
    fd.append('class_id', selected.class_id)
    if (selected.folder_id) fd.append('folder_id', selected.folder_id)
    fd.append('title', fileName)
    try {
      const res = await fetch(`${API_URL}/files/import-from-drive`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (res.ok) {
        await loadDocs(selected.class_id)
        setShowDriveModal(false)
      }
    } finally {
      setImportingId(null)
    }
  }

  const classFolders = (class_id: string) => folders.filter(f => f.class_id === class_id)

  const visibleDocs = selected.folder_id
    ? docs.filter(d => d.folder_id === selected.folder_id)
    : docs

  const currentClass = courses.find(c => c.id === selected.class_id)
  const currentFolder = folders.find(f => f.id === selected.folder_id)
  const locationLabel = selected.class_id === 'general' ? tCommon('general') : (currentClass?.name ?? selected.class_id)

  const FileIcon = ({ filename }: { filename?: string }) => {
    const isPdf = filename?.toLowerCase().endsWith('.pdf')
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
        stroke={isPdf ? '#ea4335' : '#1a73e8'} strokeWidth="1.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
      </svg>
    )
  }

  const TreeItem = ({ label, isActive, onClick, icon, indent = 0, children, onDelete, id }: {
    label: string; isActive: boolean; onClick: () => void; icon: React.ReactNode;
    indent?: number; children?: React.ReactNode; onDelete?: (e: React.MouseEvent) => void; id?: string
  }) => (
    <div>
      <div
        style={{
          ...s.treeItem,
          paddingLeft: `${16 + indent}px`,
          ...(isActive ? s.treeItemActive : {}),
        }}
        onClick={onClick}
        onMouseEnter={() => id && setHoveredFolder(id)}
        onMouseLeave={() => id && setHoveredFolder(null)}
      >
        {icon}
        <span style={s.treeItemLabel}>{label}</span>
        {onDelete && id && hoveredFolder === id && (
          <button style={s.treeDeleteBtn} onClick={onDelete}>×</button>
        )}
      </div>
      {children}
    </div>
  )

  if (loading) return <div style={s.loading}>{tCommon('loading')}</div>

  return (
    <div style={s.page}>
      <Sidebar />

      {/* Left tree */}
      <div style={s.tree}>
        <div style={s.treeHeader}>{t('myFiles')}</div>

        {/* General */}
        <TreeItem
          label={tCommon('general')}
          isActive={selected.class_id === 'general' && !selected.folder_id}
          onClick={() => selectItem('general', null)}
          icon={<FolderIcon />}
        >
          {classFolders('general').map(f => (
            <TreeItem key={f.id} id={f.id} label={f.name}
              isActive={selected.folder_id === f.id}
              onClick={() => selectItem('general', f.id)}
              onDelete={(e) => deleteFolder(e, f.id)}
              icon={<FolderIcon size={13} />}
              indent={16}
            />
          ))}
          <NewFolderRow classId="general" />
        </TreeItem>

        <div style={s.divider} />

        {/* Classes */}
        {courses.map(course => (
          <div key={course.id}>
            <div
              style={{
                ...s.treeItem,
                ...(selected.class_id === course.id && !selected.folder_id ? s.treeItemActive : {}),
              }}
              onClick={() => selectItem(course.id, null)}
            >
              <BookIcon />
              <span style={s.treeItemLabel}>{course.name}</span>
              <span
                style={s.chevron}
                onClick={(e) => toggleExpand(e, course.id)}
              >
                {expanded.has(course.id) ? '▾' : '▸'}
              </span>
            </div>
            {expanded.has(course.id) && (
              <div>
                {classFolders(course.id).map(f => (
                  <TreeItem key={f.id} id={f.id} label={f.name}
                    isActive={selected.folder_id === f.id}
                    onClick={() => selectItem(course.id, f.id)}
                    onDelete={(e) => deleteFolder(e, f.id)}
                    icon={<FolderIcon size={13} />}
                    indent={16}
                  />
                ))}
                <NewFolderRow classId={course.id} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Right content */}
      <div style={s.content}>
        <div style={s.contentHeader}>
          <div style={s.breadcrumb}>
            <span style={s.breadcrumbRoot}>{locationLabel}</span>
            {currentFolder && (
              <>
                <span style={s.breadcrumbSep}>/</span>
                <span style={s.breadcrumbFolder}>{currentFolder.name}</span>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input ref={fileInputRef} type="file" style={{ display: 'none' }}
              onChange={handleUpload} accept=".pdf,.txt,.docx,.md" />
            <button style={{ ...s.uploadBtn, background: '#fff', color: '#1a73e8', border: '1px solid #1a73e8' }}
              onClick={openDriveModal}>
              Import from Drive
            </button>
            <button style={{ ...s.uploadBtn, opacity: uploading ? 0.6 : 1 }}
              onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? tCommon('uploading') : t('uploadFile')}
            </button>
          </div>
        </div>

        <div style={s.mainArea}>
          {/* File grid */}
          <div style={{ ...s.gridPane, flex: preview ? '0 0 280px' : 1 }}>
            {docsLoading ? (
              <div style={s.emptyState}><span style={{ color: '#aaa' }}>{tCommon('loading')}</span></div>
            ) : visibleDocs.length === 0 ? (
              <div style={s.emptyState}>
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ddd" strokeWidth="1.2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <div style={s.emptyTitle}>{t('noFiles')}</div>
                <div style={s.emptyHint}>{t('noFilesHint')}</div>
              </div>
            ) : (
              <div style={s.fileGrid}>
                {visibleDocs.map(doc => (
                  <div
                    key={doc.id}
                    style={{
                      ...s.fileCard,
                      ...(preview?.doc.id === doc.id ? s.fileCardActive : {}),
                    }}
                    onClick={() => openPreview(doc)}
                  >
                    <FileIcon filename={doc.filename} />
                    {renamingId === doc.id ? (
                      <input
                        autoFocus
                        style={s.renameInput}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => {
                          if (e.key === 'Enter') submitRename(doc.id)
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                        onBlur={() => submitRename(doc.id)}
                      />
                    ) : (
                      <div style={s.fileTitle}>{doc.title}</div>
                    )}
                    {doc.filename && doc.filename !== doc.title && renamingId !== doc.id && (
                      <div style={s.fileSubtitle}>{doc.filename}</div>
                    )}
                    <div style={s.fileActions}>
                      <button style={s.fileActionBtn} onClick={(e) => startRename(doc, e)}>{t('rename')}</button>
                      <button style={{ ...s.fileActionBtn, color: '#e57373' }} onClick={(e) => { e.stopPropagation(); deleteDoc(doc.id) }}>{t('delete')}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preview panel */}
          {preview && (
            <div style={s.previewPane}>
              <div style={s.previewHeader}>
                <div style={s.previewTitle}>{preview.doc.title}</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    style={s.previewRenameBtn}
                    onClick={(e) => startRename(preview.doc, e)}
                  >
                    {t('rename')}
                  </button>
                  <button style={s.previewCloseBtn} onClick={() => setPreview(null)}>✕</button>
                </div>
              </div>
              <div style={s.previewBody}>
                {preview.loading ? (
                  <span style={{ color: '#aaa' }}>{tCommon('loading')}</span>
                ) : (
                  <pre style={s.previewText}>{preview.content}</pre>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <DriveModal />
    </div>
  )

  function DriveModal() {
    if (!showDriveModal) return null
    return (
      <div style={s.modalOverlay} onClick={() => setShowDriveModal(false)}>
        <div style={s.modal} onClick={e => e.stopPropagation()}>
          <div style={s.modalHeader}>
            <span style={{ fontWeight: 600, fontSize: '1rem' }}>Import from Google Drive</span>
            <button style={s.modalClose} onClick={() => setShowDriveModal(false)}>×</button>
          </div>
          <div style={s.modalBody}>
            {loadingDrive ? (
              <div style={{ color: '#aaa', padding: '20px 0', textAlign: 'center' }}>Loading...</div>
            ) : driveFiles.length === 0 ? (
              <div style={{ color: '#aaa', padding: '20px 0', textAlign: 'center' }}>No supported files found in Drive.</div>
            ) : driveFiles.map(f => (
              <div key={f.id} style={s.driveRow}>
                <span style={s.driveFileName}>{f.name}</span>
                <button
                  style={{ ...s.uploadBtn, fontSize: '0.8rem', padding: '5px 12px', opacity: importingId === f.id ? 0.6 : 1 }}
                  disabled={importingId === f.id}
                  onClick={() => importFromDrive(f.id, f.name)}
                >
                  {importingId === f.id ? 'Importing...' : 'Import'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  function NewFolderRow({ classId }: { classId: string }) {
    if (newFolderFor === classId) {
      return (
        <div style={s.newFolderRow}>
          <input
            autoFocus
            style={s.newFolderInput}
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') createFolder(classId)
              if (e.key === 'Escape') setNewFolderFor(null)
            }}
            placeholder={t('folderNamePlaceholder')}
          />
          <button style={s.newFolderSave} onClick={() => createFolder(classId)}>{t('addFolder')}</button>
          <button style={s.newFolderCancel} onClick={() => setNewFolderFor(null)}>×</button>
        </div>
      )
    }
    return (
      <button
        style={s.addFolderBtn}
        onClick={() => { setNewFolderFor(classId); setNewFolderName('') }}
      >
        {t('newFolder')}
      </button>
    )
  }
}

function FolderIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  )
}

function BookIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
    </svg>
  )
}

const s: { [k: string]: React.CSSProperties } = {
  page: { display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: '#f0f2f5' },
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#888' },

  // Tree
  tree: {
    width: '240px', height: '100vh', backgroundColor: '#fff',
    borderRight: '1px solid #e8eaed', overflowY: 'auto', flexShrink: 0,
  },
  treeHeader: { padding: '20px 16px 8px', fontSize: '0.85rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' },
  treeItem: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '7px 12px 7px 16px', cursor: 'pointer',
    fontSize: '0.875rem', color: '#444',
    borderRadius: '0 20px 20px 0', marginRight: '8px',
    userSelect: 'none',
  },
  treeItemActive: { backgroundColor: '#e8f0fe', color: '#1a73e8' },
  treeItemLabel: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  treeDeleteBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#aaa', fontSize: '1rem', padding: '0 2px', lineHeight: '1', flexShrink: 0,
  },
  chevron: { fontSize: '0.7rem', color: '#bbb', padding: '2px 4px', borderRadius: '4px' },
  divider: { height: '1px', backgroundColor: '#f0f2f5', margin: '8px 0' },
  addFolderBtn: {
    display: 'block', width: '100%', textAlign: 'left' as const,
    padding: '4px 16px 4px 40px', background: 'none', border: 'none',
    cursor: 'pointer', fontSize: '0.78rem', color: '#bbb',
  },
  newFolderRow: { display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px 4px 32px' },
  newFolderInput: {
    flex: 1, padding: '4px 6px', border: '1px solid #ddd',
    borderRadius: '4px', fontSize: '0.82rem', outline: 'none',
  },
  newFolderSave: {
    padding: '3px 8px', background: '#1a73e8', color: '#fff',
    border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem',
  },
  newFolderCancel: {
    padding: '3px 6px', background: 'none', border: 'none',
    cursor: 'pointer', color: '#aaa', fontSize: '1.1rem', lineHeight: '1',
  },

  // Content
  content: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  contentHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 24px', borderBottom: '1px solid #e8eaed', backgroundColor: '#fff',
    flexShrink: 0,
  },
  breadcrumb: { display: 'flex', alignItems: 'center', gap: '8px' },
  breadcrumbRoot: { fontSize: '1.05rem', fontWeight: 700, color: '#333' },
  breadcrumbSep: { color: '#ccc', fontSize: '1rem' },
  breadcrumbFolder: { fontSize: '1.05rem', fontWeight: 600, color: '#555' },
  uploadBtn: {
    padding: '8px 18px', backgroundColor: '#1a73e8', color: '#fff',
    border: 'none', borderRadius: '8px', cursor: 'pointer',
    fontSize: '0.88rem', fontWeight: 500,
  },

  mainArea: { flex: 1, display: 'flex', overflow: 'hidden' },

  gridPane: {
    overflowY: 'auto', transition: 'flex 0.2s',
    display: 'flex', flexDirection: 'column',
  },

  emptyState: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '10px',
  },
  emptyTitle: { fontSize: '1rem', fontWeight: 600, color: '#ccc' },
  emptyHint: { fontSize: '0.85rem', color: '#ddd' },

  fileGrid: {
    padding: '20px 24px', flex: 1,
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: '12px', alignContent: 'start',
  },
  fileCard: {
    backgroundColor: '#fff', borderRadius: '10px', padding: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    display: 'flex', flexDirection: 'column', gap: '6px',
    cursor: 'pointer', borderWidth: '2px', borderStyle: 'solid', borderColor: 'transparent',
  },
  fileCardActive: {
    borderColor: '#1a73e8',
    boxShadow: '0 2px 8px rgba(26,115,232,0.15)',
  },
  fileTitle: {
    fontSize: '0.85rem', fontWeight: 600, color: '#333',
    overflow: 'hidden', textOverflow: 'ellipsis',
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
  },
  fileSubtitle: {
    fontSize: '0.73rem', color: '#bbb',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
  },
  renameInput: {
    fontSize: '0.85rem', padding: '2px 4px',
    border: '1px solid #1a73e8', borderRadius: '4px',
    outline: 'none', width: '100%',
  },
  fileActions: {
    marginTop: 'auto', paddingTop: '6px', display: 'flex', gap: '8px',
  },
  fileActionBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '0.75rem', color: '#bbb', padding: 0,
  },

  // Preview panel
  previewPane: {
    width: '420px', flexShrink: 0, borderLeft: '1px solid #e8eaed',
    backgroundColor: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  previewHeader: {
    padding: '16px 20px', borderBottom: '1px solid #f0f0f0',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
    flexShrink: 0,
  },
  previewTitle: {
    fontSize: '0.95rem', fontWeight: 600, color: '#222',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1,
  },
  previewRenameBtn: {
    padding: '4px 12px', fontSize: '0.8rem', border: '1px solid #ddd',
    borderRadius: '6px', cursor: 'pointer', background: '#fff', color: '#555',
  },
  previewCloseBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#bbb', fontSize: '1rem', padding: '4px',
  },
  previewBody: {
    flex: 1, overflowY: 'auto', padding: '20px',
  },
  previewText: {
    fontSize: '0.84rem', color: '#444', lineHeight: 1.65,
    whiteSpace: 'pre-wrap' as const, fontFamily: 'inherit', margin: 0,
  },
  modalOverlay: {
    position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#fff', borderRadius: '12px', width: '480px', maxWidth: '95vw',
    maxHeight: '70vh', display: 'flex', flexDirection: 'column' as const,
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px', borderBottom: '1px solid #eee',
  },
  modalClose: {
    background: 'none', border: 'none', fontSize: '1.4rem',
    cursor: 'pointer', color: '#aaa', lineHeight: 1,
  },
  modalBody: { overflowY: 'auto' as const, padding: '8px 0' },
  driveRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 20px', borderBottom: '1px solid #f5f5f5', gap: '12px',
  },
  driveFileName: {
    fontSize: '0.9rem', color: '#333', flex: 1,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const,
  },
}
