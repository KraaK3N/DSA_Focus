-- Migration: 005_create_timer_states
-- Per-user timer state persistence

CREATE TABLE IF NOT EXISTS timer_states (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  time_left INTEGER DEFAULT 1200,
  total_duration INTEGER DEFAULT 1200,
  last_set_duration INTEGER DEFAULT 1200,
  is_running BOOLEAN DEFAULT false,
  is_break BOOLEAN DEFAULT false,
  saved_at BIGINT
);
