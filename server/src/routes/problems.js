const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/problems
 * Returns all problems for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM problems WHERE user_id = $1 ORDER BY date DESC, created_at DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET problems error:', err);
    res.status(500).json({ error: 'Failed to fetch problems' });
  }
});

/**
 * POST /api/problems
 * Create or update a problem for the authenticated user
 */
router.post('/', async (req, res) => {
  try {
    const p = req.body;
    if (!p.name) {
      return res.status(400).json({ error: 'Problem name is required' });
    }

    const id = p.id || uuidv4();

    const { rows } = await db.query(
      `INSERT INTO problems (id, user_id, date, name, url, platform, difficulty, topic, notes, hint_used, independent, needs_revision, time_spent, time_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET
         date = EXCLUDED.date,
         name = EXCLUDED.name,
         url = EXCLUDED.url,
         platform = EXCLUDED.platform,
         difficulty = EXCLUDED.difficulty,
         topic = EXCLUDED.topic,
         notes = EXCLUDED.notes,
         hint_used = EXCLUDED.hint_used,
         independent = EXCLUDED.independent,
         needs_revision = EXCLUDED.needs_revision,
         time_spent = EXCLUDED.time_spent,
         time_seconds = EXCLUDED.time_seconds,
         updated_at = NOW()
       RETURNING *`,
      [
        id,
        req.user.id,
        p.date || new Date().toISOString().split('T')[0],
        p.name,
        p.url || '',
        p.platform || 'N/A',
        p.difficulty || 'Medium',
        p.topic || 'General',
        p.notes || '',
        p.hint_used || p.hintUsed || false,
        p.independent || false,
        p.needs_revision || p.needsRevision || false,
        p.time_spent || p.timeSpent || '0s',
        p.time_seconds || p.timeSeconds || 0,
      ]
    );

    res.json({ success: true, problem: rows[0] });
  } catch (err) {
    console.error('POST problem error:', err);
    res.status(500).json({ error: 'Failed to save problem' });
  }
});

/**
 * PUT /api/problems/:id
 * Update a specific problem (verifies ownership)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const p = req.body;

    // Verify ownership
    const { rows: existing } = await db.query(
      'SELECT id FROM problems WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    const { rows } = await db.query(
      `UPDATE problems SET
        date = $1, name = $2, url = $3, platform = $4, difficulty = $5,
        topic = $6, notes = $7, hint_used = $8, independent = $9,
        needs_revision = $10, time_spent = $11, time_seconds = $12, updated_at = NOW()
       WHERE id = $13 AND user_id = $14
       RETURNING *`,
      [
        p.date, p.name, p.url || '', p.platform || 'N/A',
        p.difficulty || 'Medium', p.topic || 'General', p.notes || '',
        p.hint_used || p.hintUsed || false,
        p.independent || false,
        p.needs_revision || p.needsRevision || false,
        p.time_spent || p.timeSpent || '0s',
        p.time_seconds || p.timeSeconds || 0,
        id, req.user.id,
      ]
    );

    res.json({ success: true, problem: rows[0] });
  } catch (err) {
    console.error('PUT problem error:', err);
    res.status(500).json({ error: 'Failed to update problem' });
  }
});

/**
 * DELETE /api/problems/:id
 * Delete a problem (verifies ownership)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM problems WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE problem error:', err);
    res.status(500).json({ error: 'Failed to delete problem' });
  }
});

module.exports = router;
