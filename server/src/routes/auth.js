const express = require('express');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { authenticate, generateToken } = require('../middleware/auth');

const router = express.Router();

// Input validation helpers
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateRegister(body) {
  const errors = [];
  if (!body.email || !isValidEmail(body.email)) errors.push('Valid email is required');
  if (!body.name || body.name.trim().length < 2) errors.push('Name must be at least 2 characters');
  if (!body.password || body.password.length < 8) errors.push('Password must be at least 8 characters');
  return errors;
}

function validateLogin(body) {
  const errors = [];
  if (!body.email || !isValidEmail(body.email)) errors.push('Valid email is required');
  if (!body.password) errors.push('Password is required');
  return errors;
}

/**
 * POST /api/auth/register
 * Create a new user account with email/password
 */
router.post('/register', async (req, res) => {
  try {
    const errors = validateRegister(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(', ') });
    }

    const { email, name, password } = req.body;

    // Check if email already exists
    const { rows: existing } = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password and create user
    const passwordHash = await bcrypt.hash(password, 10);
    const id = uuidv4();

    const { rows } = await db.query(
      `INSERT INTO users (id, email, name, password_hash, provider, role, theme)
       VALUES ($1, $2, $3, $4, 'local', 'user', 'light')
       RETURNING id, email, name, avatar_url, role, theme, created_at`,
      [id, email.toLowerCase(), name.trim(), passwordHash]
    );

    const user = rows[0];
    const token = generateToken(user);

    // Initialize timer state for new user
    await db.query(
      `INSERT INTO timer_states (user_id, time_left, total_duration, last_set_duration, is_running, is_break, saved_at)
       VALUES ($1, 1200, 1200, 1200, false, false, $2)`,
      [user.id, Date.now()]
    );

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

/**
 * POST /api/auth/login
 * Authenticate with email/password, returns JWT
 */
router.post('/login', async (req, res) => {
  try {
    const errors = validateLogin(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(', ') });
    }

    const { email, password } = req.body;

    // Find user
    const { rows } = await db.query(
      'SELECT id, email, name, avatar_url, password_hash, role, theme, is_active FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    if (!user.password_hash) {
      return res.status(401).json({ error: 'This account uses Google login. Please sign in with Google.' });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken(user);

    // Don't send password_hash to client
    delete user.password_hash;

    res.json({ token, user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

/**
 * GET /api/auth/me
 * Returns current authenticated user's profile
 */
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

/**
 * PATCH /api/auth/me
 * Update current user's profile (name, theme)
 */
router.patch('/me', authenticate, async (req, res) => {
  try {
    const { name, theme } = req.body;
    const updates = [];
    const values = [];
    let paramCount = 0;

    if (name && name.trim().length >= 2) {
      paramCount++;
      updates.push(`name = $${paramCount}`);
      values.push(name.trim());
    }

    if (theme && ['light', 'dark'].includes(theme)) {
      paramCount++;
      updates.push(`theme = $${paramCount}`);
      values.push(theme);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    paramCount++;
    updates.push(`updated_at = NOW()`);
    values.push(req.user.id);

    const { rows } = await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}
       RETURNING id, email, name, avatar_url, role, theme`,
      values
    );

    res.json({ user: rows[0] });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Server error updating profile' });
  }
});

module.exports = router;
