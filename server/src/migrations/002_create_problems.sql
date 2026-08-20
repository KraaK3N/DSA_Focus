-- Migration: 002_create_problems
-- Creates the problems table with user_id foreign key

CREATE TABLE IF NOT EXISTS problems (
  id VARCHAR(255) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date VARCHAR(20),
  name VARCHAR(500) NOT NULL,
  url TEXT,
  platform VARCHAR(50) DEFAULT 'N/A',
  difficulty VARCHAR(20) DEFAULT 'Medium',
  topic VARCHAR(100) DEFAULT 'General',
  notes TEXT,
  hint_used BOOLEAN DEFAULT false,
  independent BOOLEAN DEFAULT false,
  needs_revision BOOLEAN DEFAULT false,
  time_spent VARCHAR(50) DEFAULT '0s',
  time_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_problems_user_id ON problems(user_id);
CREATE INDEX idx_problems_date ON problems(user_id, date DESC);
CREATE INDEX idx_problems_difficulty ON problems(user_id, difficulty);
CREATE INDEX idx_problems_topic ON problems(user_id, topic);
