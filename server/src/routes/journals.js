const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/journals
 * Returns all journals for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM journals WHERE user_id = $1 ORDER BY date DESC, timestamp DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET journals error:', err);
    res.status(500).json({ error: 'Failed to fetch journals' });
  }
});

/**
 * POST /api/journals
 * Create or update a journal entry for the authenticated user
 */
router.post('/', async (req, res) => {
  try {
    const j = req.body;
    if (!j.date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    const id = j.id || uuidv4();
    const now = Date.now();

    const { rows } = await db.query(
      `INSERT INTO journals (id, user_id, date, timestamp, title, content, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         date = EXCLUDED.date,
         title = EXCLUDED.title,
         content = EXCLUDED.content,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [
        id,
        req.user.id,
        j.date,
        j.timestamp || now,
        j.title || '',
        j.content || '',
        j.updatedAt || j.updated_at || now,
      ]
    );

    res.json({ success: true, journal: rows[0] });
  } catch (err) {
    console.error('POST journal error:', err);
    res.status(500).json({ error: 'Failed to save journal' });
  }
});

/**
 * PUT /api/journals/:id
 * Update a specific journal (verifies ownership)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const j = req.body;

    const { rows: existing } = await db.query(
      'SELECT id FROM journals WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Journal not found' });
    }

    const { rows } = await db.query(
      `UPDATE journals SET
        date = $1, title = $2, content = $3, updated_at = $4
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [j.date, j.title || '', j.content || '', Date.now(), id, req.user.id]
    );

    res.json({ success: true, journal: rows[0] });
  } catch (err) {
    console.error('PUT journal error:', err);
    res.status(500).json({ error: 'Failed to update journal' });
  }
});

/**
 * DELETE /api/journals/:id
 * Delete a journal entry (verifies ownership)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM journals WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Journal not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE journal error:', err);
    res.status(500).json({ error: 'Failed to delete journal' });
  }
});

module.exports = router;
