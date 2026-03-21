'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const ROLES = ['Teacher', 'Coach', 'Tutor', 'Trainer', 'Instructor', 'Advisor', 'Other']

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
}

const EMPTY_FORM: FormData = {
  display_name: '',
  school_org: '',
  role: 'Teacher',
  subjects: [],
  grade_levels: [],
  teaching_style: '',
  about: '',
  openai_api_key: '',
}

export default function OnboardingPage() {
  const router = useRouter()
  const t = useTranslations('onboarding')
  const tCommon = useTranslations('common')
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [subjectInput, setSubjectInput] = useState('')
  const [keyStatus, setKeyStatus] = useState<'idle' | 'testing' | 'valid' | 'invalid'>('idle')
  const [keyError, setKeyError] = useState('')
  const [saving, setSaving] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [connectedEmail, setConnectedEmail] = useState('')

  useEffect(() => {
    const t = localStorage.getItem('token')
    if (!t) { router.push('/'); return }
    setToken(t)

    // Pre-fill name from auth if available
    fetch(`${API_URL}/auth/user`, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.json())
      .then(data => {
        if (data.name) setForm(f => ({ ...f, display_name: data.name }))
        if (data.email) setConnectedEmail(data.email)
        if (data.language) localStorage.setItem('language', data.language)
      })
      .catch(() => {})

    // Load existing profile if editing
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
            openai_api_key: '',  // never pre-fill key
          })
        }
      })
      .catch(() => {})
  }, [router])

  const update = (field: keyof FormData, value: any) =>
    setForm(f => ({ ...f, [field]: value }))

  const addSubject = () => {
    const s = subjectInput.trim()
    if (s && !form.subjects.includes(s)) {
      update('subjects', [...form.subjects, s])
    }
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
    setKeyStatus('testing')
    setKeyError('')
    try {
      const r = await fetch(`${API_URL}/onboarding/test-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openai_api_key: form.openai_api_key.trim() }),
      })
      const data = await r.json()
      if (data.valid) {
        setKeyStatus('valid')
        if (data.warning) setKeyError(data.warning)
      } else {
        setKeyStatus('invalid')
        setKeyError(data.error || 'Invalid key')
      }
    } catch {
      setKeyStatus('invalid')
      setKeyError('Could not reach server')
    }
  }

  const handleSubmit = async () => {
    if (!token) return
    setSaving(true)
    try {
      const r = await fetch(`${API_URL}/onboarding/profile`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...form,
          role: form.role.toLowerCase(),
        }),
      })
      if (!r.ok) throw new Error('Save failed')
      router.push('/dashboard')
    } catch {
      alert('Something went wrong saving your profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const canProceed1 = form.display_name.trim().length > 0
  const canProceed2 = form.subjects.length > 0 || form.grade_levels.length > 0
  const canFinish = keyStatus === 'valid' || form.openai_api_key.trim() === ''

  return (
    <div style={s.page}>
      <div style={s.card}>

        {/* Header */}
        <div style={s.header}>
          <div style={s.logo}>{t('title')}</div>
          <div style={s.stepLabel}>{t('stepOf', { step })}</div>
        </div>

        {/* Progress bar */}
        <div style={s.progressBar}>
          <div style={{ ...s.progressFill, width: `${(step / 3) * 100}%` }} />
        </div>

        {/* ── Step 1: About You ─────────────────────────────────── */}
        {step === 1 && (
          <div style={s.stepBody}>
            <h2 style={s.stepTitle}>{t('step1Title')}</h2>
            <p style={s.stepSub}>{t('step1Sub')}</p>

            {connectedEmail && (
              <div style={s.accountBanner}>
                {t('signedInAs')} <strong>{connectedEmail}</strong>
                <span style={s.accountSep}>·</span>
                <a
                  href="/"
                  style={s.switchLink}
                  onClick={() => localStorage.removeItem('token')}
                >
                  {t('switchAccount')}
                </a>
              </div>
            )}

            <label style={s.label}>{t('yourName')}</label>
            <input
              style={s.input}
              value={form.display_name}
              onChange={e => update('display_name', e.target.value)}
              placeholder={t('namePlaceholder')}
            />

            <label style={s.label}>{t('schoolOrg')}</label>
            <input
              style={s.input}
              value={form.school_org}
              onChange={e => update('school_org', e.target.value)}
              placeholder={t('schoolPlaceholder')}
            />

            <label style={s.label}>{t('yourRole')}</label>
            <div style={s.roleGrid}>
              {ROLES.map(r => (
                <button
                  key={r}
                  onClick={() => update('role', r)}
                  style={{ ...s.roleBtn, ...(form.role === r ? s.roleBtnActive : {}) }}
                >
                  {r}
                </button>
              ))}
            </div>

            <label style={s.label}>{t('aboutYourself')}</label>
            <textarea
              style={{ ...s.input, height: '80px', resize: 'vertical' }}
              value={form.about}
              onChange={e => update('about', e.target.value)}
              placeholder={t('aboutPlaceholder')}
            />
          </div>
        )}

        {/* ── Step 2: Your Work ─────────────────────────────────── */}
        {step === 2 && (
          <div style={s.stepBody}>
            <h2 style={s.stepTitle}>{t('step2Title')}</h2>
            <p style={s.stepSub}>{t('step2Sub')}</p>

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
              <input
                style={{ ...s.input, margin: 0, flex: 1 }}
                value={subjectInput}
                onChange={e => setSubjectInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSubject() } }}
                placeholder={t('subjectPlaceholder')}
              />
              <button style={s.addBtn} onClick={addSubject}>{tCommon('add')}</button>
            </div>

            <label style={s.label}>{t('gradeLevels')}</label>
            <div style={s.gradeGrid}>
              {GRADE_OPTIONS.map(g => (
                <button
                  key={g}
                  onClick={() => toggleGrade(g)}
                  style={{ ...s.gradeBtn, ...(form.grade_levels.includes(g) ? s.gradeBtnActive : {}) }}
                >
                  {g}
                </button>
              ))}
            </div>

            <label style={s.label}>{t('teachingStyle')}</label>
            <textarea
              style={{ ...s.input, height: '90px', resize: 'vertical' }}
              value={form.teaching_style}
              onChange={e => update('teaching_style', e.target.value)}
              placeholder={t('teachingStylePlaceholder')}
            />
          </div>
        )}

        {/* ── Step 3: API Key ───────────────────────────────────── */}
        {step === 3 && (
          <div style={s.stepBody}>
            <h2 style={s.stepTitle}>{t('step3Title')}</h2>
            <p style={s.stepSub}>{t('step3Sub')}</p>

            <div style={s.infoBox}>
              <strong>{t('apiKeyHowTo')}</strong>
              <ol style={{ margin: '8px 0 0 0', paddingLeft: '1.2rem', lineHeight: '1.8' }}>
                <li>{t('apiKeyStep1')}</li>
                <li>{t('apiKeyStep2')}</li>
                <li>{t('apiKeyStep3')}</li>
                <li>{t('apiKeyStep4')}</li>
              </ol>
            </div>

            <label style={s.label}>{t('apiKeyLabel')}</label>
            <input
              style={{
                ...s.input,
                fontFamily: 'monospace',
                border: `1px solid ${keyStatus === 'valid' ? '#34a853' : keyStatus === 'invalid' ? '#ea4335' : '#ddd'}`,
              }}
              type="password"
              value={form.openai_api_key}
              onChange={e => { update('openai_api_key', e.target.value); setKeyStatus('idle') }}
              placeholder="sk-..."
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <button
                style={{
                  ...s.testBtn,
                  opacity: !form.openai_api_key.trim() || keyStatus === 'testing' ? 0.5 : 1,
                }}
                onClick={testKey}
                disabled={!form.openai_api_key.trim() || keyStatus === 'testing'}
              >
                {keyStatus === 'testing' ? t('testingKey') : t('testKey')}
              </button>
              {keyStatus === 'valid' && (
                <span style={{ color: '#34a853', fontSize: '0.9rem' }}>{t('keyValid')}</span>
              )}
              {keyStatus === 'invalid' && (
                <span style={{ color: '#ea4335', fontSize: '0.9rem' }}>{keyError}</span>
              )}
            </div>

            <p style={{ fontSize: '0.8rem', color: '#888', lineHeight: '1.5' }}>
              {t('keyStored')}
            </p>
          </div>
        )}

        {/* Navigation */}
        <div style={s.navRow}>
          {step > 1 && (
            <button style={s.backBtn} onClick={() => setStep(s => s - 1)}>
              {t('back')}
            </button>
          )}
          <div style={{ flex: 1 }} />
          {step < 3 && (
            <button
              style={{ ...s.nextBtn, opacity: (step === 1 && !canProceed1) ? 0.5 : 1 }}
              disabled={step === 1 && !canProceed1}
              onClick={() => setStep(s => s + 1)}
            >
              {t('next')}
            </button>
          )}
          {step === 3 && (
            <button
              style={{ ...s.nextBtn, opacity: saving ? 0.6 : 1 }}
              disabled={saving}
              onClick={handleSubmit}
            >
              {saving ? t('finishing') : t('finishSetup')}
            </button>
          )}
        </div>

      </div>
    </div>
  )
}

const s: { [k: string]: React.CSSProperties } = {
  page: {
    minHeight: '100vh',
    backgroundColor: '#f0f4f8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '16px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    width: '100%',
    maxWidth: '560px',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 28px 0',
  },
  logo: {
    fontSize: '1.1rem',
    fontWeight: 'bold',
    color: '#1a73e8',
  },
  stepLabel: {
    fontSize: '0.85rem',
    color: '#888',
  },
  progressBar: {
    height: '4px',
    backgroundColor: '#e8edf2',
    margin: '12px 0 0',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1a73e8',
    transition: 'width 0.3s ease',
  },
  stepBody: {
    padding: '28px 28px 8px',
  },
  stepTitle: {
    fontSize: '1.4rem',
    fontWeight: 'bold',
    color: '#1a1a1a',
    margin: '0 0 6px',
  },
  stepSub: {
    color: '#666',
    fontSize: '0.92rem',
    margin: '0 0 24px',
    lineHeight: '1.5',
  },
  label: {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: '600',
    color: '#444',
    marginBottom: '6px',
    marginTop: '16px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '0.92rem',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: '4px',
    fontFamily: 'inherit',
  },
  roleGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '4px',
  },
  roleBtn: {
    padding: '7px 16px',
    border: '1.5px solid #ddd',
    borderRadius: '20px',
    backgroundColor: 'white',
    color: '#555',
    cursor: 'pointer',
    fontSize: '0.88rem',
    transition: 'all 0.15s',
  },
  roleBtnActive: {
    border: '1.5px solid #1a73e8',
    backgroundColor: '#e8f0fe',
    color: '#1a73e8',
    fontWeight: '600',
  },
  gradeGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginBottom: '4px',
  },
  gradeBtn: {
    padding: '5px 12px',
    border: '1.5px solid #ddd',
    borderRadius: '16px',
    backgroundColor: 'white',
    color: '#555',
    cursor: 'pointer',
    fontSize: '0.82rem',
    transition: 'all 0.15s',
  },
  gradeBtnActive: {
    border: '1.5px solid #1a73e8',
    backgroundColor: '#e8f0fe',
    color: '#1a73e8',
    fontWeight: '600',
  },
  tagRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginBottom: '8px',
    minHeight: '30px',
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: '#e8f0fe',
    color: '#1a73e8',
    padding: '4px 10px',
    borderRadius: '14px',
    fontSize: '0.85rem',
    fontWeight: '500',
  },
  tagX: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#1a73e8',
    fontSize: '1rem',
    padding: '0',
    lineHeight: '1',
  },
  tagInput: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '4px',
  },
  addBtn: {
    padding: '10px 16px',
    backgroundColor: '#1a73e8',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.88rem',
    whiteSpace: 'nowrap',
  },
  infoBox: {
    backgroundColor: '#f8f9fa',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '14px 16px',
    fontSize: '0.88rem',
    color: '#444',
    marginBottom: '4px',
    lineHeight: '1.5',
  },
  testBtn: {
    padding: '8px 18px',
    backgroundColor: '#f0f4f8',
    border: '1px solid #ddd',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.88rem',
    color: '#333',
  },
  accountBanner: {
    fontSize: '0.82rem',
    color: '#666',
    backgroundColor: '#f8f9fa',
    border: '1px solid #e8eaed',
    borderRadius: '8px',
    padding: '9px 12px',
    marginBottom: '16px',
  },
  accountSep: {
    margin: '0 6px',
    color: '#ccc',
  },
  switchLink: {
    color: '#1a73e8',
    textDecoration: 'none',
    cursor: 'pointer',
  },
  navRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '20px 28px 24px',
    borderTop: '1px solid #f0f0f0',
    marginTop: '16px',
  },
  backBtn: {
    padding: '10px 20px',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.92rem',
    color: '#555',
  },
  nextBtn: {
    padding: '10px 28px',
    backgroundColor: '#1a73e8',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.92rem',
    fontWeight: '600',
  },
}
