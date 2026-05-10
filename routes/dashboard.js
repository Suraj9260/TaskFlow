// routes/dashboard.js
const express = require('express');
const db      = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ─── GET /api/dashboard ─────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const uid   = req.user.id;
  const isAdm = req.user.role === 'admin';

  // Project IDs this user can see
  const projectIds = isAdm
    ? db.prepare('SELECT id FROM projects').all().map(r => r.id)
    : db.prepare('SELECT project_id AS id FROM project_members WHERE user_id = ?').all(uid).map(r => r.id);

  if (projectIds.length === 0) {
    return res.json({ stats: {}, tasksByStatus: [], overdue: [], recentTasks: [], myTasks: [] });
  }

  const inClause = projectIds.map(() => '?').join(',');

  // Overall stats
  const stats = db.prepare(`
    SELECT
      COUNT(*)                                                    AS total_tasks,
      SUM(status = 'done')                                        AS completed,
      SUM(status = 'in_progress')                                 AS in_progress,
      SUM(status = 'todo')                                        AS todo,
      SUM(status = 'review')                                      AS review,
      SUM(due_date < date('now') AND status != 'done')            AS overdue
    FROM tasks WHERE project_id IN (${inClause})
  `).get(...projectIds);

  // Tasks by project + status (for chart)
  const tasksByProject = db.prepare(`
    SELECT p.name AS project, p.color,
           SUM(t.status = 'todo')        AS todo,
           SUM(t.status = 'in_progress') AS in_progress,
           SUM(t.status = 'review')      AS review,
           SUM(t.status = 'done')        AS done
    FROM projects p
    LEFT JOIN tasks t ON t.project_id = p.id
    WHERE p.id IN (${inClause})
    GROUP BY p.id
  `).all(...projectIds);

  // Overdue tasks
  const overdue = db.prepare(`
    SELECT t.id, t.title, t.due_date, t.priority,
           p.name AS project_name, p.color AS project_color,
           u.name AS assignee_name
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN users u ON u.id = t.assignee_id
    WHERE t.project_id IN (${inClause})
      AND t.due_date < date('now')
      AND t.status != 'done'
    ORDER BY t.due_date ASC LIMIT 10
  `).all(...projectIds);

  // Recent tasks (last 10)
  const recentTasks = db.prepare(`
    SELECT t.id, t.title, t.status, t.priority, t.created_at,
           p.name AS project_name, p.color AS project_color,
           u.name AS assignee_name
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN users u ON u.id = t.assignee_id
    WHERE t.project_id IN (${inClause})
    ORDER BY t.created_at DESC LIMIT 10
  `).all(...projectIds);

  // My assigned tasks
  const myTasks = db.prepare(`
    SELECT t.id, t.title, t.status, t.priority, t.due_date,
           p.name AS project_name, p.color AS project_color
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    WHERE t.assignee_id = ? AND t.status != 'done'
    ORDER BY t.due_date ASC NULLS LAST LIMIT 10
  `).all(uid);

  // Member count visible to this user
  const memberCount = isAdm
    ? db.prepare('SELECT COUNT(*) AS cnt FROM users').get().cnt
    : db.prepare(`SELECT COUNT(DISTINCT user_id) AS cnt FROM project_members WHERE project_id IN (${inClause})`).get(...projectIds).cnt;

  const projectCount = projectIds.length;

  res.json({ stats: { ...stats, projectCount, memberCount }, tasksByProject, overdue, recentTasks, myTasks });
});

// ─── GET /api/dashboard/users — list all users (admin sees all, member sees project-mates) ──
router.get('/users', (req, res) => {
  if (req.user.role === 'admin') {
    const users = db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY name').all();
    return res.json(users);
  }
  const users = db.prepare(`
    SELECT DISTINCT u.id, u.name, u.email, u.role
    FROM users u
    JOIN project_members pm ON pm.user_id = u.id
    WHERE pm.project_id IN (
      SELECT project_id FROM project_members WHERE user_id = ?
    )
    ORDER BY u.name
  `).all(req.user.id);
  res.json(users);
});

module.exports = router;
