// middleware/auth.js
const jwt = require('jsonwebtoken');
const db  = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'taskflow_dev_secret_change_in_prod';

/**
 * Verify JWT and attach req.user
 */
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user    = db.prepare('SELECT id, name, email, role, avatar FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Require admin role globally
 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Require admin OR project-level admin for project-scoped routes.
 * Expects req.params.projectId to be set.
 */
function requireProjectAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next();

  const membership = db
    .prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?')
    .get(req.params.projectId, req.user.id);

  if (membership?.role === 'admin') return next();
  return res.status(403).json({ error: 'Project admin access required' });
}

/**
 * Verify user is at least a member of the project.
 */
function requireProjectMember(req, res, next) {
  if (req.user?.role === 'admin') return next();

  const membership = db
    .prepare('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?')
    .get(req.params.projectId, req.user.id);

  if (!membership) return res.status(403).json({ error: 'Not a member of this project' });
  next();
}

module.exports = { authenticate, requireAdmin, requireProjectAdmin, requireProjectMember, JWT_SECRET };
