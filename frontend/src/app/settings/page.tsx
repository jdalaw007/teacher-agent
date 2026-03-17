'use client'

/**
 * Settings page — same onboarding form, accessible any time from the navbar.
 * Pre-fills from the saved profile.
 */
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const ROLES = ['Teacher', 'Coach', 'Tutor', 'Trainer', 'Instructor', 'Advisor', 'Other']
const LANGUAGES = ['English', 'Czech', 'Russian', 'Spanish', 'French']

const GRADE_OPTIONS = [
  'Pre-K', 'Kindergarten', '1st', '2nd', '3rd', '4th', '5th',
  '6th', '7th', '8th', '9th', '10th', '11th', '12th',
  'Undergraduate', 'Graduate', 'Adult Education',
]

interface FormData {
  display_name: string
  school_org: string
  role: string
  subjects: string[]
  grade_levels: string[]
  teaching_style: string
  about: string
  openai_api_key: string
  language: string
}

export default function SettingsPage() {
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>({
    display_name: '', school_org: '', role: 'Teacher',
    subjects: [], grade_levels: [], teaching_style: '', about: '', openai_api_key: '', language: 'English',
  })
  const [subjectInput, setSubjectInput] = useState('')
  const [keyStatus, setKeyStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid' | 'saved'>('idle')
  const [hasExistingKey, setHasExistingKey] = useState(false)
  const [keyError, setKeyError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = localStorage.getItem('token')
    if (!t) { router.push('/'); return }
    setToken(t)

    fetch(`${API_URL}/auth/user`, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json()).then(d => { setUserName(d.name || ''); setUserEmail(d.email || '') }).catch(() => {})

    fetch(`${API_URL}/onboarding/profile`, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(data => {
        if (data.exists) {
          setForm({
            display_name: data.display_name || '',
            school_org: data.school_org || '',
            role: data.role ? data.role.charAt(0).toUpperCase() + data.role.slice(1) : 'Teacher',
            subjects: data.subjects || [],
            grade_levels: data.grade_levels || [],
            teaching_style: data.teaching_style || '',
            about: data.about || '',
            openai_api_key: '',
            language: data.language || 'English',
          })
          setHasExistingKey(!!data.has_api_key)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [router])

  const update = (field: keyof FormData, value: any) =>
    setForm(f => ({ ...f, [field]: value }))

  const addSubject = () => {
    const s = subjectInput.trim()
    if (s && !form.subjects.includes(s)) update('subjects', [...form.subjects, s])
    setSubjectInput('')
  }

  const removeSubject = (s: string) =>
    update('subjects', form.subjects.filter(x => x !== s))

  const toggleGrade = (g: string) =>
    update('grade_levels',
      form.grade_levels.includes(g)
        ? form.grade_levels.filter(x => x !== g)
        : [...form.grade_levels, g]
    )

  const testKey = async () => {
    if (!form.openai_api_key.trim()) return
    setKeyStatus('testing'); setKeyError('')
    try {
      const r = await fetch(`${API_URL}/onboarding/test-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openai_api_key: form.openai_api_key.trim() }),
      })
      const data = await r.json()
      setKeyStatus(data.valid ? 'valid' : 'invalid')
      if (!data.valid) setKeyError(data.error || 'Invalid key')
    } catch {
      setKeyStatus('invalid'); setKeyError('Could not reach server')
    }
  }

  const handleSave = async () => {
    if (!token) return
    setSaving(true); setSaved(false)
    try {
      const r = await fetch(`${API_URL}/onboarding/profile`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role: form.role.toLowerCase() }),
      })
      if (!r.ok) throw new Error('Save failed')
      setSaved(true)
      if (form.openai_api_key) { setKeyStatus('saved'); setHasExistingKey(true) }
      setTimeout(() => setSaved(false), 3000)
    } catch {
      alert('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={s.loading}>Loading...</div>

  return (
    <div style={s.page}>
      <Sidebar />
      <div style={s.content}>
        <div style={s.header}>
          <h1 style={s.title}>Profile &amp; Settings</h1>
          <p style={s.sub}>Update your information anytime. The AI uses this to personalise its responses.</p>
        </div>

        <div style={s.section}>
          <h2 style={s.sectionTitle}>Google account</h2>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '0.95rem', color: '#333', fontWeight: 500 }}>{userEmail || '—'}</div>
              <div style={{ fontSize: '0.82rem', color: '#888', marginTop: '2px' }}>
                Connected via Google OAuth. Used for Classroom, Drive, and identity.
              </div>
            </div>
            <button
              style={s.switchBtn}
              onClick={() => { localStorage.removeItem('token'); window.location.href = '/' }}
            >
              Switch account
            </button>
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.sectionTitle}>About you</h2>

          <label style={s.label}>Your name</label>
          <input style={s.input} value={form.display_name}
            onChange={e => update('display_name', e.target.value)} placeholder="e.g. Ms. Johnson" />

          <label style={s.label}>School or organization</label>
          <input style={s.input} value={form.school_org}
            onChange={e => update('school_org', e.target.value)} placeholder="e.g. Lincoln Middle School" />

          <label style={s.label}>Role</label>
          <div style={s.roleGrid}>
            {ROLES.map(r => (
              <button key={r} onClick={() => update('role', r)}
                style={{ ...s.roleBtn, ...(form.role === r ? s.roleBtnActive : {}) }}>{r}</button>
            ))}
          </div>

          <label style={s.label}>About yourself</label>
          <textarea style={{ ...s.input, height: '80px', resize: 'vertical' }}
            value={form.about} onChange={e => update('about', e.target.value)}
            placeholder="Brief description of your background and teaching philosophy..." />
        </div>

        <div style={s.section}>
          <h2 style={s.sectionTitle}>Your work</h2>

          <label style={s.label}>Subjects</label>
          <div style={s.tagRow}>
            {form.subjects.map(sub => (
              <span key={sub} style={s.tag}>
                {sub}
                <button style={s.tagX} onClick={() => removeSubject(sub)}>×</button>
              </span>
            ))}
          </div>
          <div style={s.tagInput}>
            <input style={{ ...s.input, margin: 0, flex: 1 }} value={subjectInput}
              onChange={e => setSubjectInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubject() } }}
              placeholder="Type a subject and press Enter" />
            <button style={s.addBtn} onClick={addSubject}>Add</button>
          </div>

          <label style={s.label}>Grade levels</label>
          <div style={s.gradeGrid}>
            {GRADE_OPTIONS.map(g => (
              <button key={g} onClick={() => toggleGrade(g)}
                style={{ ...s.gradeBtn, ...(form.grade_levels.includes(g) ? s.gradeBtnActive : {}) }}>{g}</button>
            ))}
          </div>

          <label style={s.label}>Teaching style or philosophy</label>
          <textarea style={{ ...s.input, height: '90px', resize: 'vertical' }}
            value={form.teaching_style} onChange={e => update('teaching_style', e.target.value)}
            placeholder="Describe your teaching approach..." />
        </div>

        <div style={s.section}>
          <h2 style={s.sectionTitle}>Language</h2>
          <p style={{ fontSize: '0.88rem', color: '#666', marginBottom: '14px', lineHeight: '1.5' }}>
            The agent will respond in your chosen language. You can also ask the agent to switch languages at any time.
          </p>
          <div style={s.langGrid}>
            {LANGUAGES.map(lang => (
              <button key={lang} onClick={() => update('language', lang)}
                style={{ ...s.langBtn, ...(form.language === lang ? s.langBtnActive : {}) }}>
                {lang}
              </button>
            ))}
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.sectionTitle}>API key</h2>
          <p style={{ fontSize: '0.88rem', color: '#666', marginBottom: '14px', lineHeight: '1.5' }}>
            Your OpenAI key is used to power the AI assistant. Leave blank to use the default.
            Your key is stored securely and never shared.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ ...s.label, marginTop: 0, marginBottom: 0 }}>OpenAI API key</label>
            {hasExistingKey && keyStatus === 'idle' && !form.openai_api_key && (
              <span style={{ fontSize: '0.82rem', color: '#34a853', fontWeight: 500 }}>Key on file</span>
            )}
          </div>
          <input
            style={{
              ...s.input, fontFamily: 'monospace', marginTop: '6px',
              borderColor: keyStatus === 'valid' || keyStatus === 'saved' ? '#34a853'
                : keyStatus === 'invalid' ? '#ea4335' : '#ddd',
            }}
            type="password" value={form.openai_api_key}
            onChange={e => { update('openai_api_key', e.target.value); setKeyStatus('idle') }}
            placeholder={hasExistingKey ? 'Leave blank to keep existing key' : 'sk-...'} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
            <button style={{ ...s.testBtn, opacity: !form.openai_api_key.trim() ? 0.5 : 1 }}
              onClick={testKey} disabled={!form.openai_api_key.trim() || keyStatus === 'testing'}>
              {keyStatus === 'testing' ? 'Testing...' : 'Test key'}
            </button>
            {(keyStatus === 'valid' || keyStatus === 'saved') &&
              <span style={{ color: '#34a853', fontSize: '0.88rem' }}>
                {keyStatus === 'saved' ? 'Key saved' : 'Key is valid'}
              </span>}
            {keyStatus === 'invalid' &&
              <span style={{ color: '#ea4335', fontSize: '0.88rem' }}>{keyError}</span>}
          </div>
        </div>

        <div style={s.saveRow}>
          {saved && <span style={{ color: '#34a853', fontSize: '0.9rem' }}>Settings saved!</span>}
          <div style={{ flex: 1 }} />
          <button style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }}
            onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save settings'}
          </button>
        </div>

      </div>
    </div>
  )
}

const s: { [k: string]: React.CSSProperties } = {
  page: { display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: '#f0f2f5' },
  loading: { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#666' },
  content: { flex: 1, overflowY: 'auto', maxWidth: '680px', padding: '2rem 2rem 4rem' },
  header: { marginBottom: '2rem' },
  title: { fontSize: '1.8rem', fontWeight: 'bold', color: '#1a1a1a', margin: '0 0 6px' },
  sub: { color: '#666', fontSize: '0.95rem', margin: 0 },
  section: {
    backgroundColor: 'white', borderRadius: '12px', padding: '24px',
    marginBottom: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  sectionTitle: { fontSize: '1.05rem', fontWeight: 'bold', color: '#333', margin: '0 0 16px' },
  langGrid: { display: 'flex', flexWrap: 'wrap' as const, gap: '8px' },
  langBtn: {
    padding: '8px 20px', border: '1px solid #ddd', borderRadius: '20px',
    background: 'white', cursor: 'pointer', fontSize: '0.9rem', color: '#555',
  },
  langBtnActive: { backgroundColor: '#1a73e8', color: 'white', borderColor: '#1a73e8', fontWeight: 600 },
  label: { display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#444', marginBottom: '6px', marginTop: '16px' },
  input: {
    width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px',
    fontSize: '0.92rem', outline: 'none', boxSizing: 'border-box', marginBottom: '4px', fontFamily: 'inherit',
  },
  roleGrid: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '4px' },
  roleBtn: { padding: '7px 16px', border: '1.5px solid #ddd', borderRadius: '20px', backgroundColor: 'white', color: '#555', cursor: 'pointer', fontSize: '0.88rem' },
  roleBtnActive: { borderColor: '#1a73e8', backgroundColor: '#e8f0fe', color: '#1a73e8', fontWeight: '600' },
  gradeGrid: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' },
  gradeBtn: { padding: '5px 12px', border: '1.5px solid #ddd', borderRadius: '16px', backgroundColor: 'white', color: '#555', cursor: 'pointer', fontSize: '0.82rem' },
  gradeBtnActive: { borderColor: '#1a73e8', backgroundColor: '#e8f0fe', color: '#1a73e8', fontWeight: '600' },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', minHeight: '30px' },
  tag: { display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#e8f0fe', color: '#1a73e8', padding: '4px 10px', borderRadius: '14px', fontSize: '0.85rem', fontWeight: '500' },
  tagX: { background: 'none', border: 'none', cursor: 'pointer', color: '#1a73e8', fontSize: '1rem', padding: '0', lineHeight: '1' },
  tagInput: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' },
  addBtn: { padding: '10px 16px', backgroundColor: '#1a73e8', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.88rem', whiteSpace: 'nowrap' },
  testBtn: { padding: '8px 18px', backgroundColor: '#f0f4f8', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '0.88rem', color: '#333' },
  saveRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '4px 0' },
  saveBtn: { padding: '11px 28px', backgroundColor: '#1a73e8', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: '600' },
  switchBtn: { padding: '8px 16px', backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontSize: '0.88rem', color: '#444', whiteSpace: 'nowrap' as const },
}
