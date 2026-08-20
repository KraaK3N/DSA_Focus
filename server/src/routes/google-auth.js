const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// Configure Google Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== 'your-google-client-id') {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback',
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails[0].value.toLowerCase();
          const name = profile.displayName;
          const avatarUrl = profile.photos?.[0]?.value || null;
          const googleId = profile.id;

          // Check if user exists by google_id
          let { rows } = await db.query(
            'SELECT * FROM users WHERE google_id = $1',
            [googleId]
          );

          if (rows.length > 0) {
            // Existing Google user — update avatar if changed
            if (avatarUrl && rows[0].avatar_url !== avatarUrl) {
              await db.query('UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2', [avatarUrl, rows[0].id]);
              rows[0].avatar_url = avatarUrl;
            }
            return done(null, rows[0]);
          }

          // Check if email exists with a local account — link it
          const { rows: existingByEmail } = await db.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
          );

          if (existingByEmail.length > 0) {
            // Link Google to existing local account
            await db.query(
              'UPDATE users SET google_id = $1, avatar_url = COALESCE($2, avatar_url), updated_at = NOW() WHERE id = $3',
              [googleId, avatarUrl, existingByEmail[0].id]
            );
            existingByEmail[0].google_id = googleId;
            existingByEmail[0].avatar_url = avatarUrl || existingByEmail[0].avatar_url;
            return done(null, existingByEmail[0]);
          }

          // New user — create account
          const id = uuidv4();
          const { rows: newUser } = await db.query(
            `INSERT INTO users (id, email, name, avatar_url, google_id, provider, role, theme)
             VALUES ($1, $2, $3, $4, $5, 'google', 'user', 'light')
             RETURNING id, email, name, avatar_url, role, theme, created_at`,
            [id, email, name, avatarUrl, googleId]
          );

          // Initialize timer state for new user
          await db.query(
            `INSERT INTO timer_states (user_id, time_left, total_duration, last_set_duration, is_running, is_break, saved_at)
             VALUES ($1, 1200, 1200, 1200, false, false, $2)`,
            [id, Date.now()]
          );

          return done(null, newUser[0]);
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );
}

// Initialize passport (no sessions — we use JWT)
router.use(passport.initialize());

/**
 * GET /api/auth/google
 * Redirects to Google consent screen
 */
router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
);

/**
 * GET /api/auth/google/callback
 * Handles the OAuth callback from Google
 */
router.get(
  '/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: '/login?error=google_auth_failed',
  }),
  (req, res) => {
    // Generate JWT for the authenticated user
    const token = generateToken(req.user);
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    // Redirect to frontend with token as URL param
    res.redirect(`${clientUrl}/auth/callback?token=${token}`);
  }
);

module.exports = router;
