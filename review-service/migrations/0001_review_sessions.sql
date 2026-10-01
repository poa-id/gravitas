CREATE TABLE IF NOT EXISTS review_sessions (
  id TEXT PRIMARY KEY,
  public_token_hash TEXT NOT NULL UNIQUE,
  owner_key_hash TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  snapshot_key TEXT NOT NULL,
  snapshot_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_review_sessions_public_token_hash
  ON review_sessions(public_token_hash);
CREATE INDEX IF NOT EXISTS idx_review_sessions_owner_key_hash
  ON review_sessions(owner_key_hash);
CREATE INDEX IF NOT EXISTS idx_review_sessions_expires_at
  ON review_sessions(expires_at);

CREATE TABLE IF NOT EXISTS review_submissions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  reviewer_name TEXT NOT NULL,
  reviewer_note TEXT NOT NULL DEFAULT '',
  marks_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES review_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_review_submissions_session_id
  ON review_submissions(session_id);
