-- Migration: 003_create_journals
-- Creates the journals table with user_id foreign key

CREATE TABLE IF NOT EXISTS journals (
  id VARCHAR(255) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date VARCHAR(20),
  timestamp BIGINT,
  title VARCHAR(500),
  content TEXT,
  updated_at BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_journals_user_id ON journals(user_id);
CREATE INDEX idx_journals_date ON journals(user_id, date DESC);
