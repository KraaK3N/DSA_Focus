const express = require('express');
const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

/**
 * GET /api/export/problems?format=csv|json
 * Export user's problems as CSV or JSON
 */
router.get('/problems', async (req, res) => {
  try {
    const format = req.query.format || 'json';
    const { rows } = await db.query(
      'SELECT id, date, name, url, platform, difficulty, topic, notes, hint_used, independent, needs_revision, time_spent, time_seconds, created_at FROM problems WHERE user_id = $1 ORDER BY date DESC',
      [req.user.id]
    );

    if (format === 'csv') {
      const headers = ['id', 'date', 'name', 'url', 'platform', 'difficulty', 'topic', 'notes', 'hint_used', 'independent', 'needs_revision', 'time_spent', 'time_seconds', 'created_at'];
      const csvLines = [headers.join(',')];

      rows.forEach((row) => {
        const line = headers.map((h) => {
          const val = row[h] ?? '';
          const str = String(val);
          // Escape commas and quotes in CSV
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        });
        csvLines.push(line.join(','));
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="dsa_problems_export_${new Date().toISOString().split('T')[0]}.csv"`);
      return res.send(csvLines.join('\n'));
    }

    // JSON format
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="dsa_problems_export_${new Date().toISOString().split('T')[0]}.json"`);
    res.json(rows);
  } catch (err) {
    console.error('Export problems error:', err);
    res.status(500).json({ error: 'Failed to export problems' });
  }
});

/**
 * GET /api/export/journals?format=csv|json
 * Export user's journals as CSV or JSON
 */
router.get('/journals', async (req, res) => {
  try {
    const format = req.query.format || 'json';
    const { rows } = await db.query(
      'SELECT id, date, title, content, timestamp, updated_at, created_at FROM journals WHERE user_id = $1 ORDER BY date DESC',
      [req.user.id]
    );

    if (format === 'csv') {
      const headers = ['id', 'date', 'title', 'content', 'timestamp', 'updated_at', 'created_at'];
      const csvLines = [headers.join(',')];

      rows.forEach((row) => {
        const line = headers.map((h) => {
          const val = row[h] ?? '';
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        });
        csvLines.push(line.join(','));
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="dsa_journals_export_${new Date().toISOString().split('T')[0]}.csv"`);
      return res.send(csvLines.join('\n'));
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="dsa_journals_export_${new Date().toISOString().split('T')[0]}.json"`);
    res.json(rows);
  } catch (err) {
    console.error('Export journals error:', err);
    res.status(500).json({ error: 'Failed to export journals' });
  }
});

/**
 * GET /api/export/all?format=json
 * Full data dump — problems + journals + settings
 */
router.get('/all', async (req, res) => {
  try {
    const [problems, journals, settings] = await Promise.all([
      db.query('SELECT * FROM problems WHERE user_id = $1 ORDER BY date DESC', [req.user.id]),
      db.query('SELECT * FROM journals WHERE user_id = $1 ORDER BY date DESC', [req.user.id]),
      db.query('SELECT key, value FROM user_settings WHERE user_id = $1', [req.user.id]),
    ]);

    const data = {
      exportedAt: new Date().toISOString(),
      user: { email: req.user.email, name: req.user.name },
      problems: problems.rows,
      journals: journals.rows,
      settings: settings.rows.reduce((acc, r) => { acc[r.key] = r.value; return acc; }, {}),
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="dsa_focus_full_export_${new Date().toISOString().split('T')[0]}.json"`);
    res.json(data);
  } catch (err) {
    console.error('Export all error:', err);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

module.exports = router;
