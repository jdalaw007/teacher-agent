'use client'

/**
 * Settings page — same onboarding form, accessible any time from the navbar.
 * Pre-fills from the saved profile.
 */
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { useTranslations } from 'next-intl'

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
  gemini_api_key: string
  ai_provider: string
  language: string
}

export default function SettingsPage() {
  const router = useRouter()
  const t = useTranslations('settings')
  const tCommon = useTranslations('common')
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [token, setToken] = useState<string | null>(null)
  const [form, setForm] = useState<FormData>({
    display_name: '', school_org: '', role: 'Teacher',
    subjects: [], grade_levels: [], teaching_style: '', about: '',
    openai_api_key: '', gemini_api_key: '', ai_provider: 'openai', language: 'English',
  })
  const [subjectInput, setSubjectInput] = useState('')
  const [keyStatus, setKeyStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid' | 'saved'>('idle')
  const [hasExistingKey, setHasExistingKey] = useState(false)
  const [keyError, setKeyError] = useState('')
  const [geminiKeyStatus, setGeminiKeyStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid' | 'saved'>('idle')
  const [hasGeminiKey, setHasGeminiKey] = useState(false)
  const [geminiKeyError, setGeminiKeyError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)

  useEffect(() => {
    const t = localStorage.getItem('token')
    if (!t) { router.push('/'); return }
    setToken(t)

    fetch(`${API_URL}/auth/user`, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json()).then(d => {
        setUserName(d.name || ''); setUserEmail(d.email || '')
        if (d.language) localStorage.setItem('language', d.language)
      }).catch(() => {})

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
            gemini_api_key: '',
            ai_provider: data.ai_provider || 'openai',
            language: data.language || 'English',
          })
          setHasExistingKey(!!data.has_api_key)
          setHasGeminiKey(!!data.has_gemini_key)
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

  const testGeminiKey = async () => {
    if (!form.gemini_api_key.trim()) return
    setGeminiKeyStatus('testing'); setGeminiKeyError('')
    try {
      const r = await fetch(`${API_URL}/onboarding/test-gemini-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gemini_api_key: form.gemini_api_key.trim() }),
      })
      const data = await r.json()
      setGeminiKeyStatus(data.valid ? 'valid' : 'invalid')
      if (!data.valid) setGeminiKeyError(data.error || 'Invalid key')
    } catch {
      setGeminiKeyStatus('invalid'); setGeminiKeyError('Could not reach server')
    }
  }

  const handleExport = async () => {
    if (!token) return
    setExporting(true)
    try {
      const r = await fetch(`${API_URL}/export/my-data`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) throw new Error('Export failed')
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = r.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1]
        ?? 'teacher-agent-export.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Export failed. Please try again.')
    } finally {
      setExporting(false)
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
      if (form.gemini_api_key) { setGeminiKeyStatus('saved'); setHasGeminiKey(true) }
      const prevLang = localStorage.getItem('language')
      console.log('[Settings] prevLang:', prevLang, 'new lang:', form.language)
      localStorage.setItem('language', form.language)
      if (prevLang !== form.language) {
        console.log('[Settings] language changed, reloading...')
        window.location.reload()
        return
      }
      setTimeout(() => setSaved(false), 3000)
    } catch {
      alert('Something went wrong. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={s.loading}>{tCommon('loading')}</div>

  return (
    <div style={s.page}>
      <Sidebar />
      <div style={s.content}>
        <div style={s.header}>
          <h1 style={s.title}>{t('title')}</h1>
          <p style={s.sub}>{t('sub')}</p>
        </div>

        <div style={s.section}>
          <h2 style={s.sectionTitle}>{t('googleAccount')}</h2>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '0.95rem', color: '#333', fontWeight: 500 }}>{userEmail || '—'}</div>
              <div style={{ fontSize: '0.82rem', color: '#888', marginTop: '2px' }}>
                {t('googleAccountDesc')}
              </div>
            </div>
            <button
              style={s.switchBtn}
              onClick={() => { localStorage.removeItem('token'); window.location.href = '/' }}
            >
              {t('switchAccount')}
            </button>
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.sectionTitle}>{t('aboutYou')}</h2>

          <label style={s.label}>{t('yourName')}</label>
          <input style={s.input} value={form.display_name}
            onChange={e => update('display_name', e.target.value)} placeholder={t('namePlaceholder')} />

          <label style={s.label}>{t('schoolOrg')}</label>
          <input style={s.input} value={form.school_org}
            onChange={e => update('school_org', e.target.value)} placeholder={t('schoolPlaceholder')} />

          <label style={s.label}>{t('role')}</label>
          <div style={s.roleGrid}>
            {ROLES.map(r => (
              <button key={r} onClick={() => update('role', r)}
                style={{ ...s.roleBtn, ...(form.role === r ? s.roleBtnActive : {}) }}>{r}</button>
            ))}
          </div>

          <label style={s.label}>{t('aboutYourself')}</label>
          <textarea style={{ ...s.input, height: '80px', resize: 'vertical' }}
            value={form.about} onChange={e => update('about', e.target.value)}
            placeholder={t('aboutPlaceholder')} />
        </div>

        <div style={s.section}>
          <h2 style={s.sectionTitle}>{t('yourWork')}</h2>

          <label style={s.label}>{t('subjects')}</label>
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
              placeholder={t('subjectPlaceholder')} />
            <button style={s.addBtn} onClick={addSubject}>{tCommon('add')}</button>
          </div>

          <label style={s.label}>{t('gradeLevels')}</label>
          <div style={s.gradeGrid}>
            {GRADE_OPTIONS.map(g => (
              <button key={g} onClick={() => toggleGrade(g)}
                style={{ ...s.gradeBtn, ...(form.grade_levels.includes(g) ? s.gradeBtnActive : {}) }}>{g}</button>
            ))}
          </div>

          <label style={s.label}>{t('teachingStyle')}</label>
          <textarea style={{ ...s.input, height: '90px', resize: 'vertical' }}
            value={form.teaching_style} onChange={e => update('teaching_style', e.target.value)}
            placeholder={t('teachingStylePlaceholder')} />
        </div>

        <div style={s.section}>
          <h2 style={s.sectionTitle}>{t('language')}</h2>
          <p style={{ fontSize: '0.88rem', color: '#666', marginBottom: '14px', lineHeight: '1.5' }}>
            {t('languageDesc')}
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
          <h2 style={s.sectionTitle}>{t('aiProvider')}</h2>
          <p style={{ fontSize: '0.88rem', color: '#666', marginBottom: '14px', lineHeight: '1.5' }}>
            {t('aiProviderDesc')}
          </p>

          <label style={s.label}>{t('provider')}</label>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            {(['openai', 'gemini'] as const).map(p => (
              <button key={p} onClick={() => update('ai_provider', p)}
                style={{
                  ...s.roleBtn,
                  ...(form.ai_provider === p ? s.roleBtnActive : {}),
                  textTransform: 'none',
                  minWidth: '100px',
                }}>
                {p === 'openai' ? 'OpenAI (GPT-4o)' : 'Gemini (Google)'}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ ...s.label, marginTop: 0, marginBottom: 0 }}>{t('openaiKey')}</label>
            {hasExistingKey && keyStatus === 'idle' && !form.openai_api_key && (
              <span style={{ fontSize: '0.82rem', color: '#34a853', fontWeight: 500 }}>{t('keyOnFile')}</span>
            )}
          </div>
          <input
            style={{
              ...s.input, fontFamily: 'monospace', marginTop: '6px',
              border: `1px solid ${keyStatus === 'valid' || keyStatus === 'saved' ? '#34a853' : keyStatus === 'invalid' ? '#ea4335' : '#ddd'}`,
            }}
            type="password" value={form.openai_api_key}
            onChange={e => { update('openai_api_key', e.target.value); setKeyStatus('idle') }}
            placeholder={hasExistingKey ? t('keepExistingKey') : 'sk-...'} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
            <button style={{ ...s.testBtn, opacity: !form.openai_api_key.trim() ? 0.5 : 1 }}
              onClick={testKey} disabled={!form.openai_api_key.trim() || keyStatus === 'testing'}>
              {keyStatus === 'testing' ? tCommon('testing') : t('testKey')}
            </button>
            {(keyStatus === 'valid' || keyStatus === 'saved') &&
              <span style={{ color: '#34a853', fontSize: '0.88rem' }}>
                {keyStatus === 'saved' ? t('keySaved') : t('keyValid')}
              </span>}
            {keyStatus === 'invalid' &&
              <span style={{ color: '#ea4335', fontSize: '0.88rem' }}>{keyError}</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '20px' }}>
            <label style={{ ...s.label, marginTop: 0, marginBottom: 0 }}>{t('geminiKey')}</label>
            {hasGeminiKey && geminiKeyStatus === 'idle' && !form.gemini_api_key && (
              <span style={{ fontSize: '0.82rem', color: '#34a853', fontWeight: 500 }}>{t('keyOnFile')}</span>
            )}
          </div>
          <input
            style={{
              ...s.input, fontFamily: 'monospace', marginTop: '6px',
              border: `1px solid ${geminiKeyStatus === 'valid' || geminiKeyStatus === 'saved' ? '#34a853' : geminiKeyStatus === 'invalid' ? '#ea4335' : '#ddd'}`,
            }}
            type="password" value={form.gemini_api_key}
            onChange={e => { update('gemini_api_key', e.target.value); setGeminiKeyStatus('idle') }}
            placeholder={hasGeminiKey ? t('keepExistingKey') : 'AIza...'} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
            <button style={{ ...s.testBtn, opacity: !form.gemini_api_key.trim() ? 0.5 : 1 }}
              onClick={testGeminiKey} disabled={!form.gemini_api_key.trim() || geminiKeyStatus === 'testing'}>
              {geminiKeyStatus === 'testing' ? tCommon('testing') : t('testKey')}
            </button>
            {(geminiKeyStatus === 'valid' || geminiKeyStatus === 'saved') &&
              <span style={{ color: '#34a853', fontSize: '0.88rem' }}>
                {geminiKeyStatus === 'saved' ? t('keySaved') : t('keyValid')}
              </span>}
            {geminiKeyStatus === 'invalid' &&
              <span style={{ color: '#ea4335', fontSize: '0.88rem' }}>{geminiKeyError}</span>}
          </div>
        </div>

        <div style={s.section}>
          <h2 style={s.sectionTitle}>{t('yourData')}</h2>
          <p style={{ fontSize: '0.88rem', color: '#666', marginBottom: '16px', lineHeight: '1.6' }}>
            {t('gdprDesc')}
          </p>
          <button
            style={{ ...s.testBtn, opacity: exporting ? 0.6 : 1 }}
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? t('preparingDownload') : t('downloadData')}
          </button>
        </div>

        <div style={s.section}>
          <button
            style={s.privacyToggle}
            onClick={() => setPrivacyOpen(o => !o)}
          >
            <span style={{ fontWeight: 600, fontSize: '1.05rem', color: '#333' }}>{t('privacy')}</span>
            <span style={{ color: '#aaa', fontSize: '0.9rem' }}>{privacyOpen ? t('privacyHide') : t('privacyShow')}</span>
          </button>

          {privacyOpen && (
            <div style={s.privacyBody}>

              <div style={s.privacyBlock}>
                <div style={s.privacyHeading}>{t('privacyWhatCollect')}</div>
                <ul style={s.privacyList}>
                  <li>Your Google account name and email (for login and identity)</li>
                  <li>Student names, emails, and submission data synced from Google Classroom</li>
                  <li>Teacher notes you write about students</li>
                  <li>Conversation history with the AI assistant</li>
                  <li>Documents you upload to the corpus</li>
                  <li>AI-generated memories and teaching strategy logs</li>
                </ul>
              </div>

              <div style={s.privacyBlock}>
                <div style={s.privacyHeading}>{t('privacyWhyCollect')}</div>
                <p style={s.privacyText}>
                  To provide the AI teaching assistant service. The lawful basis for processing
                  student data is <strong>public task</strong> (Art. 6(1)(e) GDPR) under the Czech
                  Education Act No. 561/2004. Your profile and preferences are processed under
                  <strong> legitimate interests</strong> of the school.
                </p>
              </div>

              <div style={s.privacyBlock}>
                <div style={s.privacyHeading}>{t('privacyWhoProcess')}</div>
                <table style={s.privacyTable}>
                  <thead>
                    <tr>
                      <th style={s.privacyTh}>{t('privacyProcessor')}</th>
                      <th style={s.privacyTh}>{t('privacyPurpose')}</th>
                      <th style={s.privacyTh}>{t('privacyTransfer')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={s.privacyTd}>OpenAI Ireland Ltd</td>
                      <td style={s.privacyTd}>AI response generation</td>
                      <td style={s.privacyTd}>EU–US Data Privacy Framework</td>
                    </tr>
                    <tr>
                      <td style={s.privacyTd}>Google LLC</td>
                      <td style={s.privacyTd}>Classroom, Drive, Gmail, Calendar</td>
                      <td style={s.privacyTd}>Google Workspace for Education DPA</td>
                    </tr>
                    <tr>
                      <td style={s.privacyTd}>Railway (hosting)</td>
                      <td style={s.privacyTd}>Backend &amp; database hosting</td>
                      <td style={s.privacyTd}>Railway DPA, EU region</td>
                    </tr>
                    <tr>
                      <td style={s.privacyTd}>Vercel (hosting)</td>
                      <td style={s.privacyTd}>Frontend hosting</td>
                      <td style={s.privacyTd}>Vercel DPA</td>
                    </tr>
                  </tbody>
                </table>
                <p style={{ ...s.privacyText, marginTop: '8px' }}>
                  Student personal data sent to OpenAI is pseudonymised — names and emails
                  are stripped before any AI call. OpenAI does not train on API data.
                </p>
              </div>

              <div style={s.privacyBlock}>
                <div style={s.privacyHeading}>{t('privacyRetention')}</div>
                <table style={s.privacyTable}>
                  <thead>
                    <tr>
                      <th style={s.privacyTh}>{t('privacyData')}</th>
                      <th style={s.privacyTh}>{t('privacyRetentionPeriod')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td style={s.privacyTd}>Student records &amp; submissions</td><td style={s.privacyTd}>2 years from last activity</td></tr>
                    <tr><td style={s.privacyTd}>Conversation messages</td><td style={s.privacyTd}>90 days after conversation ends</td></tr>
                    <tr><td style={s.privacyTd}>AI memories &amp; strategies</td><td style={s.privacyTd}>2 years</td></tr>
                    <tr><td style={s.privacyTd}>Grader results</td><td style={s.privacyTd}>2 years</td></tr>
                    <tr><td style={s.privacyTd}>Audit log</td><td style={s.privacyTd}>Retained for legal accountability</td></tr>
                  </tbody>
                </table>
                <p style={{ ...s.privacyText, marginTop: '8px' }}>
                  Records are deleted automatically by a nightly process once the
                  retention period expires.
                </p>
              </div>

              <div style={s.privacyBlock}>
                <div style={s.privacyHeading}>{t('privacyRights')}</div>
                <ul style={s.privacyList}>
                  <li><strong>Access</strong> — download everything we hold about you using the button above.</li>
                  <li><strong>Erasure</strong> — contact your school's Data Protection Officer to request deletion of student records. Teachers can request full account deletion via the school DPO.</li>
                  <li><strong>Rectification</strong> — update student notes and profile data directly in the app.</li>
                  <li><strong>Portability</strong> — use "Download my data" above to receive your data in JSON format.</li>
                  <li><strong>Objection / restriction</strong> — contact your school DPO.</li>
                </ul>
                <p style={{ ...s.privacyText, marginTop: '8px' }}>
                  Supervisory authority: <strong>ÚOOÚ</strong> (Úřad pro ochranu osobních údajů) —{' '}
                  <span style={{ color: '#1a73e8' }}>uoou.gov.cz</span>
                </p>
              </div>

            </div>
          )}
        </div>

        <div style={s.saveRow}>
          {saved && <span style={{ color: '#34a853', fontSize: '0.9rem' }}>{t('settingsSaved')}</span>}
          <div style={{ flex: 1 }} />
          <button style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }}
            onClick={handleSave} disabled={saving}>
            {saving ? t('saving') : t('saveSettings')}
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
  langBtnActive: { backgroundColor: '#1a73e8', color: 'white', border: '1px solid #1a73e8', fontWeight: 600 },
  label: { display: 'block', fontSize: '0.85rem', fontWeight: '600', color: '#444', marginBottom: '6px', marginTop: '16px' },
  input: {
    width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px',
    fontSize: '0.92rem', outline: 'none', boxSizing: 'border-box', marginBottom: '4px', fontFamily: 'inherit',
  },
  roleGrid: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '4px' },
  roleBtn: { padding: '7px 16px', border: '1.5px solid #ddd', borderRadius: '20px', backgroundColor: 'white', color: '#555', cursor: 'pointer', fontSize: '0.88rem' },
  roleBtnActive: { border: '1.5px solid #1a73e8', backgroundColor: '#e8f0fe', color: '#1a73e8', fontWeight: '600' },
  gradeGrid: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '4px' },
  gradeBtn: { padding: '5px 12px', border: '1.5px solid #ddd', borderRadius: '16px', backgroundColor: 'white', color: '#555', cursor: 'pointer', fontSize: '0.82rem' },
  gradeBtnActive: { border: '1.5px solid #1a73e8', backgroundColor: '#e8f0fe', color: '#1a73e8', fontWeight: '600' },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', minHeight: '30px' },
  tag: { display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#e8f0fe', color: '#1a73e8', padding: '4px 10px', borderRadius: '14px', fontSize: '0.85rem', fontWeight: '500' },
  tagX: { background: 'none', border: 'none', cursor: 'pointer', color: '#1a73e8', fontSize: '1rem', padding: '0', lineHeight: '1' },
  tagInput: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' },
  addBtn: { padding: '10px 16px', backgroundColor: '#1a73e8', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.88rem', whiteSpace: 'nowrap' },
  testBtn: { padding: '8px 18px', backgroundColor: '#f0f4f8', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '0.88rem', color: '#333' },
  saveRow: { display: 'flex', alignItems: 'center', gap: '12px', padding: '4px 0' },
  saveBtn: { padding: '11px 28px', backgroundColor: '#1a73e8', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: '600' },
  switchBtn: { padding: '8px 16px', backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontSize: '0.88rem', color: '#444', whiteSpace: 'nowrap' as const },
  privacyToggle: {
    width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' as const,
  },
  privacyBody: { marginTop: '20px', display: 'flex', flexDirection: 'column' as const, gap: '20px' },
  privacyBlock: {},
  privacyHeading: { fontSize: '0.88rem', fontWeight: 700, color: '#444', marginBottom: '8px', textTransform: 'uppercase' as const, letterSpacing: '0.04em' },
  privacyText: { fontSize: '0.87rem', color: '#555', lineHeight: '1.6', margin: 0 },
  privacyList: { fontSize: '0.87rem', color: '#555', lineHeight: '1.7', margin: 0, paddingLeft: '18px' },
  privacyTable: { width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.84rem' },
  privacyTh: { textAlign: 'left' as const, padding: '6px 10px', backgroundColor: '#f8f9fa', color: '#666', fontWeight: 600, borderBottom: '1px solid #e8e8e8' },
  privacyTd: { padding: '6px 10px', color: '#444', borderBottom: '1px solid #f0f0f0', verticalAlign: 'top' as const },
}
