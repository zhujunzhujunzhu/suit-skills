DROP TABLE IF EXISTS platform_documents;

CREATE TABLE IF NOT EXISTS platform_schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  password_hash TEXT,
  password_updated_at TEXT,
  disabled INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL CHECK (role IN ('user', 'admin')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_sessions_user_id
  ON platform_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_platform_sessions_expires_at
  ON platform_sessions(expires_at);

CREATE TABLE IF NOT EXISTS platform_sources (
  name TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  url TEXT,
  branch TEXT,
  skills_directory TEXT,
  publish_enabled INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS platform_skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  author TEXT NOT NULL,
  source TEXT NOT NULL,
  category TEXT NOT NULL,
  version TEXT NOT NULL,
  installs INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 0,
  reviews INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('verified', 'review', 'new')),
  command TEXT NOT NULL,
  owner TEXT,
  upload_status TEXT CHECK (
    upload_status IS NULL OR upload_status IN ('draft', 'validating', 'validated', 'waiting_publish', 'published')
  ),
  git_url TEXT,
  package_file_name TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_skill_tags (
  skill_id TEXT NOT NULL REFERENCES platform_skills(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (skill_id, tag)
);

CREATE TABLE IF NOT EXISTS platform_skill_files (
  skill_id TEXT NOT NULL REFERENCES platform_skills(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (skill_id, path)
);

CREATE TABLE IF NOT EXISTS platform_evaluations (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  skill_name TEXT,
  version TEXT,
  rating REAL,
  title TEXT,
  comment TEXT,
  reviewer_json TEXT,
  status TEXT NOT NULL CHECK (status IN ('submitted', 'reviewing', 'approved', 'rejected', 'archived')),
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_evaluations_skill_id
  ON platform_evaluations(skill_id);

CREATE INDEX IF NOT EXISTS idx_platform_evaluations_status
  ON platform_evaluations(status);

CREATE TABLE IF NOT EXISTS platform_git_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  logged_in INTEGER NOT NULL,
  user_name TEXT NOT NULL,
  email TEXT NOT NULL,
  default_git_url TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  skills_directory TEXT NOT NULL,
  publish_strategy TEXT NOT NULL CHECK (publish_strategy IN ('direct', 'pull_request', 'review')),
  auth_type TEXT NOT NULL CHECK (auth_type IN ('none', 'ssh', 'token')),
  last_test_at TEXT,
  last_test_status TEXT CHECK (
    last_test_status IS NULL OR last_test_status IN ('untested', 'success', 'failed')
  )
);

CREATE TABLE IF NOT EXISTS platform_package_uploads (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  package_dir TEXT NOT NULL,
  original_file_path TEXT NOT NULL,
  owner TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('parsed', 'waiting_review', 'rejected', 'publishing', 'published', 'publish_failed')
  ),
  metadata_skill_id TEXT NOT NULL,
  published_commit TEXT,
  publish_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_upload_metadata (
  upload_id TEXT PRIMARY KEY REFERENCES platform_package_uploads(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  author TEXT NOT NULL,
  source TEXT NOT NULL,
  category TEXT NOT NULL,
  version TEXT NOT NULL,
  installs INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 0,
  reviews INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('verified', 'review', 'new')),
  command TEXT NOT NULL,
  owner TEXT,
  upload_status TEXT CHECK (
    upload_status IS NULL OR upload_status IN ('draft', 'validating', 'validated', 'waiting_publish', 'published')
  ),
  git_url TEXT,
  package_file_name TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_upload_validation (
  upload_id TEXT NOT NULL REFERENCES platform_package_uploads(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  position INTEGER NOT NULL,
  PRIMARY KEY (upload_id, position)
);

CREATE TABLE IF NOT EXISTS platform_upload_metadata_tags (
  upload_id TEXT NOT NULL REFERENCES platform_package_uploads(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (upload_id, tag)
);
