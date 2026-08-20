const express = require('express');
const db = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All admin routes require authentication + admin role
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/admin/users
 * Paginated user list with activity stats
 */
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let whereClause = '';
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      whereClause = `WHERE u.email ILIKE $${params.length} OR u.name ILIKE $${params.length}`;
    }

    const countQuery = `SELECT COUNT(*) FROM users u ${whereClause}`;
    const { rows: countRows } = await db.query(countQuery, params);
    const total = parseInt(countRows[0].count);

    params.push(limit, offset);
    const usersQuery = `
      SELECT
        u.id, u.email, u.name, u.avatar_url, u.provider, u.role,
        u.theme, u.is_active, u.created_at, u.updated_at,
        (SELECT COUNT(*) FROM problems p WHERE p.user_id = u.id) as problems_count,
        (SELECT COUNT(*) FROM journals j WHERE j.user_id = u.id) as journals_count,
        (SELECT MAX(p.created_at) FROM problems p WHERE p.user_id = u.id) as last_problem_at
      FROM users u
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const { rows: users } = await db.query(usersQuery, params);

    res.json({
      users,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Admin get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * PATCH /api/admin/users/:id
 * Update user role or active status
 */
router.patch('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { role, is_active } = req.body;

    // Don't allow admin to disable themselves
    if (id === req.user.id && is_active === false) {
      return res.status(400).json({ error: 'Cannot disable your own account' });
    }

    const updates = [];
    const values = [];
    let paramCount = 0;

    if (role && ['user', 'admin'].includes(role)) {
      paramCount++;
      updates.push(`role = $${paramCount}`);
      values.push(role);
    }

    if (typeof is_active === 'boolean') {
      paramCount++;
      updates.push(`is_active = $${paramCount}`);
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    paramCount++;
    values.push(id);

    const { rows } = await db.query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramCount} RETURNING id, email, name, role, is_active`,
      values
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: rows[0] });
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete a user and all their data (CASCADE)
 */
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const result = await db.query('DELETE FROM users WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/**
 * GET /api/admin/analytics
 * Platform-wide analytics
 */
router.get('/analytics', async (req, res) => {
  try {
    const [
      totalUsers,
      activeUsers7d,
      totalProblems,
      problemsToday,
      problemsThisWeek,
      topTopics,
      signupsOverTime,
    ] = await Promise.all([
      db.query('SELECT COUNT(*) FROM users'),
      db.query("SELECT COUNT(DISTINCT user_id) FROM problems WHERE created_at > NOW() - INTERVAL '7 days'"),
      db.query('SELECT COUNT(*) FROM problems'),
      db.query("SELECT COUNT(*) FROM problems WHERE date = $1", [new Date().toISOString().split('T')[0]]),
      db.query("SELECT COUNT(*) FROM problems WHERE created_at > NOW() - INTERVAL '7 days'"),
      db.query("SELECT topic, COUNT(*) as count FROM problems GROUP BY topic ORDER BY count DESC LIMIT 10"),
      db.query("SELECT DATE(created_at) as date, COUNT(*) as count FROM users WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY DATE(created_at) ORDER BY date"),
    ]);

    res.json({
      totalUsers: parseInt(totalUsers.rows[0].count),
      activeUsers7d: parseInt(activeUsers7d.rows[0].count),
      totalProblems: parseInt(totalProblems.rows[0].count),
      problemsToday: parseInt(problemsToday.rows[0].count),
      problemsThisWeek: parseInt(problemsThisWeek.rows[0].count),
      topTopics: topTopics.rows,
      signupsOverTime: signupsOverTime.rows,
    });
  } catch (err) {
    console.error('Admin analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * GET /api/admin/users/:id/data
 * View a specific user's data (for moderation)
 */
router.get('/users/:id/data', async (req, res) => {
  try {
    const { id } = req.params;

    const [user, problems, journals] = await Promise.all([
      db.query('SELECT id, email, name, role, is_active, created_at FROM users WHERE id = $1', [id]),
      db.query('SELECT * FROM problems WHERE user_id = $1 ORDER BY date DESC LIMIT 50', [id]),
      db.query('SELECT * FROM journals WHERE user_id = $1 ORDER BY date DESC LIMIT 20', [id]),
    ]);

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: user.rows[0],
      problems: problems.rows,
      journals: journals.rows,
    });
  } catch (err) {
    console.error('Admin user data error:', err);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

module.exports = router;
