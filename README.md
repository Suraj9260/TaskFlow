# ⚡ TaskFlow — Team Task Manager

A full-stack web app for managing projects, assigning tasks, and tracking team progress — with role-based access control.

**Live Demo:** (https://taskflow-production-6aec.up.railway.app/)

---

## Features

- **Auth** — Signup/Login with JWT tokens (7-day expiry)
- **Role-Based Access** — Global Admin vs Member; per-project Admin vs Member
- **Projects** — Create, update, delete; color-coded; member management
- **Tasks** — Create/assign/update tasks with status, priority, due dates
- **Board & List Views** — Kanban board + sortable table view
- **Dashboard** — Stats, overdue tasks, recent activity, my tasks
- **Comments** — Thread comments on any task
- **Overdue Detection** — Visual alerts for overdue tasks

---

## Tech Stack

| Layer      | Technology                  |
|------------|-----------------------------|
| Backend    | Node.js, Express            |
| Database   | SQLite (better-sqlite3)     |
| Auth       | JWT + bcryptjs              |
| Validation | express-validator           |
| Frontend   | Vanilla JS SPA (no build)   |
| Deploy     | Railway                     |

---

## Local Setup (from scratch)

### 1. Prerequisites
- Node.js 18+ installed (`node -v`)
- Git installed

### 2. Clone & install
```bash
git clone https://github.com/Suraj9260/taskflow.git
cd taskflow
npm install
```

### 3. Configure environment
```bash
cp .env
# .env — change JWT_SECRET 
```

### 4. Run
```bash
npm start
# Visit  http://localhost:8080
```

The SQLite database (`taskflow.db`) is auto-created on first run.

---

## API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Register user |
| POST | `/api/auth/login` | Login, get JWT |
| GET | `/api/auth/me` | Get current user |

**Signup body:**
```json
{ "name": "Suraj", "email": "suraj@co.com", "password": "pass123", "role": "admin" }
```

### Projects
| Method | Endpoint | Auth | Role |
|--------|----------|------|------|
| GET | `/api/projects` | ✓ | Any |
| POST | `/api/projects` | ✓ | Any |
| GET | `/api/projects/:id` | ✓ | Member+ |
| PUT | `/api/projects/:id` | ✓ | Project Admin |
| DELETE | `/api/projects/:id` | ✓ | Project Admin |
| POST | `/api/projects/:id/members` | ✓ | Project Admin |
| DELETE | `/api/projects/:id/members/:uid` | ✓ | Project Admin |

### Tasks
| Method | Endpoint | Auth | Note |
|--------|----------|------|------|
| GET | `/api/projects/:pid/tasks` | ✓ | Filterable by status/priority/assignee |
| POST | `/api/projects/:pid/tasks` | ✓ | Any member |
| GET | `/api/projects/:pid/tasks/:tid` | ✓ | Includes comments |
| PUT | `/api/projects/:pid/tasks/:tid` | ✓ | Creator/assignee/admin only |
| DELETE | `/api/projects/:pid/tasks/:tid` | ✓ | Creator/admin only |
| POST | `/api/projects/:pid/tasks/:tid/comments` | ✓ | Any member |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard` | Stats, overdue, recent, my tasks |
| GET | `/api/dashboard/users` | List visible users |

---

## Role-Based Access Control

```
Global Roles:
  admin  → sees ALL projects, tasks, users
  member → sees only projects they're invited to

Project-Level Roles (per project_members table):
  admin  → can edit project, manage members, delete any task
  member → can create tasks, edit their own tasks/assignee tasks
```

---

## Deployment on Railway

### Step 1: Push to GitHub
```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/taskflow.git
git push -u origin main
```

### Step 2: Deploy on Railway
1. Go to [railway.app](https://railway.app) and sign in
2. Click **New Project → Deploy from GitHub repo**
3. Select your `taskflow` repository
4. Railway auto-detects Node.js and runs `npm start`

### Step 3: Set Environment Variables on Railway
In your Railway project → **Variables** tab, add:
```
JWT_SECRET=7f9094057864f141256086786a348006e88565a076709849500057088924377a
PORT=3000
```

> Railway auto-sets `PORT`. The `DB_PATH` defaults to `./taskflow.db` which works fine on Railway's ephemeral storage. For production persistence, swap to PostgreSQL (see below).

### Step 4: Get your URL
Railway gives you a `.railway.app` URL automatically. Done ✓

---

## Database Schema

```sql
users          (id, name, email, password, role, created_at)
projects       (id, name, description, color, owner_id, created_at)
project_members(project_id, user_id, role, joined_at)   ← junction table
tasks          (id, title, description, status, priority, project_id,
                assignee_id, creator_id, due_date, created_at, updated_at)
comments       (id, task_id, user_id, body, created_at)
```

---

## Quick Start Guide (for evaluators)

1. Open the live URL
2. **Sign up** as Admin (select "Admin" role)
3. Create a **Project**
4. Invite a second user as **Member** via Settings → Members
5. Create **Tasks**, assign them, set due dates
6. Switch views: Board / List
7. Open a task → update status, add a comment
8. Check **Dashboard** for overdue + stats

---

## Folder Structure

```
taskflow/
├── server.js           ← Express entry point
├── db.js               ← SQLite setup & schema
├── middleware/
│   └── auth.js         ← JWT auth + RBAC middleware
├── routes/
│   ├── auth.js         ← /api/auth/*
│   ├── projects.js     ← /api/projects/*
│   ├── tasks.js        ← /api/projects/:pid/tasks/*
│   └── dashboard.js    ← /api/dashboard/*
├── public/
│   └── index.html      ← Full SPA frontend
├── package.json
├── railway.json        ← Railway deploy config
└── .env.example
```

---


