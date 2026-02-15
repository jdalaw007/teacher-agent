# Teacher Agent

AI-powered teaching assistant that integrates with Google Workspace to streamline teacher workflow.

## Project Structure

```
teacher-agent/
├── backend/          # Python FastAPI backend
│   ├── app/
│   │   ├── main.py       # FastAPI entry point
│   │   ├── config.py     # Environment settings
│   │   ├── routers/      # API routes (auth, classroom, drive)
│   │   ├── services/     # Google API clients
│   │   └── models/       # Pydantic schemas
│   └── requirements.txt
└── frontend/         # Next.js React frontend
    ├── src/
    │   ├── app/          # App router pages
    │   ├── components/   # React components
    │   └── lib/          # API client utilities
    └── package.json
```

## Tech Stack

- **Backend**: Python 3.11+, FastAPI, Google API Python Client
- **Frontend**: Next.js 14, React 18, TypeScript
- **Auth**: Google OAuth 2.0

## Commands

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate      # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload
```
Backend runs at http://localhost:8000

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Frontend runs at http://localhost:3000

## Environment Setup

### Backend (.env)
Copy `.env.example` to `.env` and fill in:
- `GOOGLE_CLIENT_ID` - From Google Cloud Console
- `GOOGLE_CLIENT_SECRET` - From Google Cloud Console
- `SECRET_KEY` - Random string for session security

### Frontend (.env.local)
Copy `.env.local.example` to `.env.local`:
- `NEXT_PUBLIC_API_URL=http://localhost:8000`

## Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable APIs: Google Classroom API, Google Drive API
4. Go to Credentials > Create Credentials > OAuth client ID
5. Choose "Web application"
6. Add authorized redirect URI: `http://localhost:8000/auth/callback`
7. Copy Client ID and Client Secret to backend `.env`

## API Endpoints

### Auth
- `GET /auth/login` - Redirect to Google OAuth
- `GET /auth/callback` - Handle OAuth callback
- `GET /auth/user` - Get current user info

### Classroom
- `GET /classroom/courses` - List teacher's courses
- `GET /classroom/courses/{id}` - Get course details
- `GET /classroom/courses/{id}/assignments` - List assignments

### Drive
- `GET /drive/files` - List files
- `GET /drive/files/{id}` - Get file metadata

## Development Notes

- Always run backend before frontend
- Token is stored in localStorage after OAuth
- All Classroom/Drive endpoints require Bearer token
