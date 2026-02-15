const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')

  const headers = {
    ...options.headers,
    Authorization: token ? `Bearer ${token}` : '',
    'Content-Type': 'application/json',
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  })

  if (response.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/'
    throw new Error('Unauthorized')
  }

  return response
}

export async function getCourses() {
  const response = await fetchWithAuth('/classroom/courses')
  if (!response.ok) throw new Error('Failed to fetch courses')
  return response.json()
}

export async function getCourse(courseId: string) {
  const response = await fetchWithAuth(`/classroom/courses/${courseId}`)
  if (!response.ok) throw new Error('Failed to fetch course')
  return response.json()
}

export async function getAssignments(courseId: string) {
  const response = await fetchWithAuth(`/classroom/courses/${courseId}/assignments`)
  if (!response.ok) throw new Error('Failed to fetch assignments')
  return response.json()
}

export async function getFiles(folderId?: string) {
  const params = folderId ? `?folder_id=${folderId}` : ''
  const response = await fetchWithAuth(`/drive/files${params}`)
  if (!response.ok) throw new Error('Failed to fetch files')
  return response.json()
}

export async function getUser() {
  const response = await fetchWithAuth('/auth/user')
  if (!response.ok) throw new Error('Failed to fetch user')
  return response.json()
}
