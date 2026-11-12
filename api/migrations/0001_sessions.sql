-- Refresh and access tokens are encrypted by the Worker before they reach D1.
-- No Google account identifier or profile data is stored here.
CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,
  app TEXT NOT NULL CHECK (app IN ('finapp', 'garapp')),
  return_to TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS oauth_states_expires ON oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS sessions (
  session_hash TEXT PRIMARY KEY,
  app TEXT NOT NULL CHECK (app IN ('finapp', 'garapp')),
  refresh_iv TEXT NOT NULL,
  refresh_ciphertext TEXT NOT NULL,
  refresh_expires_at INTEGER,
  access_iv TEXT,
  access_ciphertext TEXT,
  access_expires_at INTEGER,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_expires ON sessions (expires_at);
