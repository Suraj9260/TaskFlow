// routes/projects.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../db');
const { authenticate, requireProjectAdmin, requireProjectMember } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ─── GET /api/projects — list projects the user belongs to ──────────────────
router.get('/', (req, res) => {
  let projects;
  if (req.user.role === 'admin') {
    projects = db.prepare(`
      SELECT p.*, u.name AS owner_name,
             (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
             (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) AS member_count
      FROM projects p
      JOIN users u ON u.id = p.owner_id
      ORDER BY p.created_at DESC
    `).all();
  } else {
    projects = db.prepare(`
      SELECT p.*, u.name AS owner_name, pm.role AS my_role,
             (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
             (SELECT COUNT(*) FROM project_members pm2 WHERE pm2.project_id = p.id) AS member_count
      FROM projects p
      JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
      JOIN users u ON u.id = p.owner_id
      ORDER BY p.created_at DESC
    `).all(req.user.id);
  }
  res.json(projects);
});

// ─── POST /api/projects ─────────────────────────────────────────────────────
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Project name required'),
    body('description').optional().trim(),
    body('color').optional().matches(/^#[0-9a-fA-F]{6}$/),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { name, description = '', color = '#6366f1' } = req.body;

    const info = db
      .prepare('INSERT INTO projects (name, description, color, owner_id) VALUES (?, ?, ?, ?)')
      .run(name, description, color, req.user.id);

    // Add creator as project admin
    db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)')
      .run(info.lastInsertRowid, req.user.id, 'admin');

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(project);
  }
);

// ─── GET /api/projects/:projectId ───────────────────────────────────────────
router.get('/:projectId', requireProjectMember, (req, res) => {
  const project = db.prepare(`
    SELECT p.*, u.name AS owner_name
    FROM projects p JOIN users u ON u.id = p.owner_id
    WHERE p.id = ?
  `).get(req.params.projectId);

  if (!project) return res.status(404).json({ error: 'Project not found' });

  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.role AS global_role, pm.role AS project_role, pm.joined_at
    FROM project_members pm JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ?
  `).all(req.params.projectId);

  res.json({ ...project, members });
});

// ─── PUT /api/projects/:projectId ───────────────────────────────────────────
router.put('/:projectId', requireProjectAdmin, (req, res) => {
  const { name, description, color } = req.body;
  db.prepare('UPDATE projects SET name = COALESCE(?, name), description = COALESCE(?, description), color = COALESCE(?, color) WHERE id = ?')
    .run(name, description, color, req.params.projectId);
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.projectId);
  res.json(project);
});

// ─── DELETE /api/projects/:projectId ────────────────────────────────────────
router.delete('/:projectId', requireProjectAdmin, (req, res) => {
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.projectId);
  res.json({ message: 'Project deleted' });
});

// ─── POST /api/projects/:projectId/members ───────────────────────────────────
router.post('/:projectId/members', requireProjectAdmin, (req, res) => {
  const { email, role = 'member' } = req.body;
  if (!email) return res.status(422).json({ error: 'Email required' });

  const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('INSERT OR REPLACE INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)')
    .run(req.params.projectId, user.id, role);

  res.json({ message: 'Member added', user });
});

// ─── DELETE /api/projects/:projectId/members/:userId ────────────────────────
router.delete('/:projectId/members/:userId', requireProjectAdmin, (req, res) => {
  db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?')
    .run(req.params.projectId, req.params.userId);
  res.json({ message: 'Member removed' });
});

module.exports = router;
