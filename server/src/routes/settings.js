const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/settings/:key
 * Get a setting value for the authenticated user
 */
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { rows } = await db.query(
      'SELECT value FROM user_settings WHERE user_id = $1 AND key = $2',
      [req.user.id, key]
    );

    res.json({ key, value: rows.length > 0 ? rows[0].value : null });
  } catch (err) {
    console.error('GET setting error:', err);
    res.status(500).json({ error: 'Failed to fetch setting' });
  }
});

/**
 * POST /api/settings/:key
 * Set a setting value for the authenticated user
 */
router.post('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    await db.query(
      `INSERT INTO user_settings (user_id, key, value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
      [req.user.id, key, value]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('POST setting error:', err);
    res.status(500).json({ error: 'Failed to save setting' });
  }
});

/**
 * GET /api/settings
 * Get all settings for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT key, value FROM user_settings WHERE user_id = $1',
      [req.user.id]
    );

    const settings = {};
    rows.forEach((r) => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) {
    console.error('GET all settings error:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

module.exports = router;
