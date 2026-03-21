'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

interface Course {
  id: string
  name: string
  section?: string
  description?: string
}

interface ClassListProps {
  courses: Course[]
}

export default function ClassList({ courses }: ClassListProps) {
  const router = useRouter()
  const t = useTranslations('classList')

  if (courses.length === 0) {
    return (
      <div style={styles.empty}>
        <p>{t('noClasses')}</p>
      </div>
    )
  }

  return (
    <div style={styles.grid}>
      {courses.map((course) => (
        <div
          key={course.id}
          style={styles.card}
          onClick={() => router.push(`/classes/${course.id}`)}
        >
          <h3 style={styles.cardTitle}>{course.name}</h3>
          {course.section && <p style={styles.cardSection}>{course.section}</p>}
        </div>
      ))}
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '1.5rem',
  },
  card: {
    backgroundColor: 'white',
    padding: '1.5rem',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  cardTitle: {
    marginBottom: '0.5rem',
    color: '#1a73e8',
  },
  cardSection: {
    color: '#666',
    fontSize: '0.9rem',
  },
  empty: {
    textAlign: 'center',
    padding: '2rem',
    color: '#666',
  },
}
