# Teacher Agent

An AI-powered teaching assistant that connects to Google Classroom, Gmail, Drive, and Calendar. Teachers can chat with an AI agent that knows their classes, students, and assignments — and can take actions like posting assignments and announcements directly from the chat.

## Features

- **AI Chat Agent** — ask questions about your classes, students, and assignments; the agent can search your documents, post content to Classroom, and remember past conversations
- **Google Classroom** — view courses, assignments, submissions, and rosters
- **Document Corpus** — upload PDFs and documents; the AI searches them when answering questions
- **File Manager** — organize documents by class and folder, preview and rename files
- **Student Profiles** — track individual students, notes, groups, and submission history
- **Assignment Generator** — AI-generated assignments saved directly to your file library
- **Scheduled Posts** — set recurring assignments or announcements on a weekly/monthly schedule
- **Gmail Inbox** — see recent emails from the dashboard
- **Google Calendar** — view upcoming events
- **Learning Analytics** — the agent distills insights from your conversation history over time

## Prerequisites

1. A **Google Cloud project** with these APIs enabled:
   - Google Classroom API
   - Google Drive API
   - Google Docs API
   - Gmail API
   - Google Calendar API
   - People API (for user info)

2. An **OAuth 2.0 Client ID** (Web application type) with your redirect URI added as an authorized redirect URI

3. An **OpenAI API key** (used as a fallback; teachers can also add their own in Settings)

4. **Python 3.11+** and **Node.js 18+**

## Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/your-username/teacher-agent.git
cd teacher-agent

# 2. Set up the backend
cd backend
python -m venv venv
venv/Scripts/pip install -r requirements.txt   # Windows
# or: venv/bin/pip install -r requirements.txt  # Mac/Linux

cp .env.example .env
# Edit .env and fill in your Google OAuth credentials, SECRET_KEY, and OPENAI_API_KEY

# 3. Set up the frontend
cd ../frontend
npm install
cp .env.local.example .env.local
# .env.local is updated automatically by start.sh

# 4. Start both servers
cd ..
./start.sh
```

Open http://localhost:3000 and sign in with Google.

### Google Cloud Console setup

1. Go to **APIs & Services → Credentials** and create an OAuth 2.0 Client ID (Web application)
2. Add `http://localhost:8003/auth/callback` as an authorized redirect URI
3. Enable all APIs listed in Prerequisites
4. Go to **OAuth consent screen** and add your Google account as a test user (required while the app is unverified)

## Deployment

### Backend → Railway

1. Create a new project at [railway.app](https://railway.app) and connect your GitHub repo
2. Railway will detect `railway.toml` and build automatically
3. Add a **Volume** in Railway and mount it at `/app/backend/data` to persist the SQLite database and uploaded files
4. Set these environment variables in Railway:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=https://your-app.railway.app/auth/callback
   SECRET_KEY=<long random string>
   FRONTEND_URL=https://your-app.vercel.app
   OPENAI_API_KEY=...
   ```
5. Copy your Railway backend URL (e.g. `https://teacher-agent-production.railway.app`)

### Frontend → Vercel

1. Import your repo at [vercel.com](https://vercel.com)
2. Set **Root Directory** to `frontend`
3. Add environment variable:
   ```
   NEXT_PUBLIC_API_URL=https://your-backend.railway.app
   ```
4. Deploy

### After deploying

- Add your Railway backend URL as an authorized redirect URI in Google Cloud Console
- Add your Vercel frontend URL to **Authorized JavaScript origins** in Google Cloud Console
- Update `GOOGLE_REDIRECT_URI` in Railway env vars to match

## Google App Verification

The app requests sensitive Google scopes (Classroom, Drive, Gmail, Calendar). Until Google verifies your app, users will see an "unverified app" warning screen. To bypass this during testing:

- Go to **OAuth consent screen → Test users** in Google Cloud Console
- Add each teacher's Google email address manually (up to 100 test users)

Submit for verification when you're ready for wider use.

## Tech Stack

- **Backend**: Python 3.11, FastAPI, SQLite, OpenAI GPT-4o
- **Frontend**: Next.js 16, React 18, TypeScript
- **Auth**: Google OAuth 2.0
- **Storage**: SQLite (structured data), flat files (document corpus)
