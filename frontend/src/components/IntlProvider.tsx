'use client'
import { useState, useEffect } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import cs from '../../messages/cs.json'
import ru from '../../messages/ru.json'
import es from '../../messages/es.json'
import fr from '../../messages/fr.json'

const MESSAGE_MAP: Record<string, any> = { en, cs, ru, es, fr }

const LANG_MAP: Record<string, string> = {
  English: 'en', Czech: 'cs', Russian: 'ru', Spanish: 'es', French: 'fr',
}

export default function IntlProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState('en')

  useEffect(() => {
    const lang = localStorage.getItem('language') || 'English'
    const loc = LANG_MAP[lang] || 'en'
    console.log('[IntlProvider] language from localStorage:', lang, '→ locale:', loc)
    setLocale(loc)
  }, [])

  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGE_MAP[locale]}>
      {children}
    </NextIntlClientProvider>
  )
}
