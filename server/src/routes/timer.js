const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/timer
 * Returns the timer state for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM timer_states WHERE user_id = $1',
      [req.user.id]
    );

    if (rows.length === 0) {
      // Create default timer state
      const { rows: newState } = await db.query(
        `INSERT INTO timer_states (user_id, time_left, total_duration, last_set_duration, is_running, is_break, saved_at)
         VALUES ($1, 1200, 1200, 1200, false, false, $2)
         RETURNING *`,
        [req.user.id, Date.now()]
      );
      return res.json(formatTimerState(newState[0]));
    }

    res.json(formatTimerState(rows[0]));
  } catch (err) {
    console.error('GET timer error:', err);
    res.status(500).json({ error: 'Failed to fetch timer state' });
  }
});

/**
 * POST /api/timer
 * Update the timer state for the authenticated user
 */
router.post('/', async (req, res) => {
  try {
    const { timeLeft, totalDuration, lastSetDuration, isRunning, isBreak } = req.body;

    const { rows } = await db.query(
      `INSERT INTO timer_states (user_id, time_left, total_duration, last_set_duration, is_running, is_break, saved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET
         time_left = EXCLUDED.time_left,
         total_duration = EXCLUDED.total_duration,
         last_set_duration = EXCLUDED.last_set_duration,
         is_running = EXCLUDED.is_running,
         is_break = EXCLUDED.is_break,
         saved_at = EXCLUDED.saved_at
       RETURNING *`,
      [
        req.user.id,
        typeof timeLeft === 'number' ? timeLeft : 1200,
        typeof totalDuration === 'number' ? totalDuration : 1200,
        typeof lastSetDuration === 'number' ? lastSetDuration : 1200,
        typeof isRunning === 'boolean' ? isRunning : false,
        typeof isBreak === 'boolean' ? isBreak : false,
        Date.now(),
      ]
    );

    res.json({ success: true, ...formatTimerState(rows[0]) });
  } catch (err) {
    console.error('POST timer error:', err);
    res.status(500).json({ error: 'Failed to save timer state' });
  }
});

function formatTimerState(row) {
  return {
    timeLeft: row.time_left,
    totalDuration: row.total_duration,
    lastSetDuration: row.last_set_duration,
    isRunning: row.is_running,
    isBreak: row.is_break,
    savedAt: row.saved_at ? Number(row.saved_at) : null,
  };
}

module.exports = router;
