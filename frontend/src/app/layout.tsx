export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import './globals.css'
import FloatingAgent from '@/components/FloatingAgent'

export const metadata: Metadata = {
  title: 'Teacher Agent',
  description: 'AI-powered teaching assistant',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <FloatingAgent />
      </body>
    </html>
  )
}
