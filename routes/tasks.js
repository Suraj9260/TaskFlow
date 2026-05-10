// routes/tasks.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate, requireProjectMember, requireProjectAdmin } = require('../middleware/auth');

const router = express.Router({ mergeParams: true }); // mergeParams to get projectId
router.use(authenticate);
router.use(requireProjectMember);

const TASK_SELECT = `
  SELECT
    t.*,
    u_a.name  AS assignee_name,  u_a.email AS assignee_email,
    u_c.name  AS creator_name,
    p.name    AS project_name,   p.color   AS project_color
  FROM tasks t
  LEFT JOIN users u_a ON u_a.id = t.assignee_id
  LEFT JOIN users u_c ON u_c.id = t.creator_id
  LEFT JOIN projects p ON p.id  = t.project_id
`;

// ─── GET /api/projects/:projectId/tasks ─────────────────────────────────────
router.get('/', (req, res) => {
  const { status, priority, assignee } = req.query;

  let sql = TASK_SELECT + ' WHERE t.project_id = ?';
  const params = [req.params.projectId];

  if (status)   { sql += ' AND t.status = ?';      params.push(status); }
  if (priority) { sql += ' AND t.priority = ?';    params.push(priority); }
  if (assignee) { sql += ' AND t.assignee_id = ?'; params.push(assignee); }

  sql += ' ORDER BY t.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// ─── POST /api/projects/:projectId/tasks ────────────────────────────────────
router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('status').optional().isIn(['todo', 'in_progress', 'review', 'done']),
    body('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
    body('due_date').optional().isISO8601(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { title, description, status, priority, assignee_id, due_date } = req.body;

    // Validate assignee is a project member
    if (assignee_id) {
      const isMember = db
        .prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?')
        .get(req.params.projectId, assignee_id);
      if (!isMember && req.user.role !== 'admin') {
        return res.status(422).json({ error: 'Assignee is not a project member' });
      }
    }

    const info = db.prepare(`
      INSERT INTO tasks (title, description, status, priority, project_id, assignee_id, creator_id, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      title, description || null,
      status || 'todo', priority || 'medium',
      req.params.projectId, assignee_id || null,
      req.user.id, due_date || null
    );

    const task = db.prepare(TASK_SELECT + ' WHERE t.id = ?').get(info.lastInsertRowid);
    res.status(201).json(task);
  }
);

// ─── GET /api/projects/:projectId/tasks/:taskId ──────────────────────────────
router.get('/:taskId', (req, res) => {
  const task = db.prepare(TASK_SELECT + ' WHERE t.id = ? AND t.project_id = ?')
    .get(req.params.taskId, req.params.projectId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const comments = db.prepare(`
    SELECT c.*, u.name AS user_name FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.task_id = ? ORDER BY c.created_at ASC
  `).all(req.params.taskId);

  res.json({ ...task, comments });
});

// ─── PUT /api/projects/:projectId/tasks/:taskId ──────────────────────────────
router.put('/:taskId', (req, res) => {
  const task = db
    .prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?')
    .get(req.params.taskId, req.params.projectId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Members can only update tasks they created or are assigned to (unless project admin)
  const membership = db
    .prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?')
    .get(req.params.projectId, req.user.id);
  const isProjectAdmin = req.user.role === 'admin' || membership?.role === 'admin';
  const isInvolved = task.creator_id === req.user.id || task.assignee_id === req.user.id;

  if (!isProjectAdmin && !isInvolved) {
    return res.status(403).json({ error: 'Cannot edit tasks you did not create or are assigned to' });
  }

  const { title, description, status, priority, assignee_id, due_date } = req.body;

  db.prepare(`
    UPDATE tasks SET
      title       = COALESCE(?, title),
      description = COALESCE(?, description),
      status      = COALESCE(?, status),
      priority    = COALESCE(?, priority),
      assignee_id = CASE WHEN ? IS NOT NULL THEN ? ELSE assignee_id END,
      due_date    = COALESCE(?, due_date),
      updated_at  = datetime('now')
    WHERE id = ?
  `).run(title, description, status, priority, assignee_id, assignee_id, due_date, req.params.taskId);

  const updated = db.prepare(TASK_SELECT + ' WHERE t.id = ?').get(req.params.taskId);
  res.json(updated);
});

// ─── DELETE /api/projects/:projectId/tasks/:taskId ───────────────────────────
router.delete('/:taskId', (req, res) => {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND project_id = ?')
    .get(req.params.taskId, req.params.projectId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const membership = db.prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?')
    .get(req.params.projectId, req.user.id);
  const isProjectAdmin = req.user.role === 'admin' || membership?.role === 'admin';

  if (!isProjectAdmin && task.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the task creator or admin can delete this task' });
  }

  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.taskId);
  res.json({ message: 'Task deleted' });
});

// ─── POST /api/projects/:projectId/tasks/:taskId/comments ────────────────────
router.post('/:taskId/comments', (req, res) => {
  const { body: commentBody } = req.body;
  if (!commentBody?.trim()) return res.status(422).json({ error: 'Comment body required' });

  const info = db.prepare('INSERT INTO comments (task_id, user_id, body) VALUES (?, ?, ?)')
    .run(req.params.taskId, req.user.id, commentBody.trim());

  const comment = db.prepare(`
    SELECT c.*, u.name AS user_name FROM comments c
    JOIN users u ON u.id = c.user_id WHERE c.id = ?
  `).get(info.lastInsertRowid);

  res.status(201).json(comment);
});

module.exports = router;
