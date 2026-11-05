-- Job Compass schema, ported from the SQLAlchemy models.
-- pgvector is enabled now; embedding tables arrive with step 3.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE jobs (
    id                BIGSERIAL PRIMARY KEY,
    company           TEXT      NOT NULL,
    role              TEXT      NOT NULL,
    location          TEXT,
    date_applied      DATE,
    salary_min        INTEGER   CHECK (salary_min >= 0),
    salary_max        INTEGER   CHECK (salary_max >= 0),
    notes             TEXT,
    status            TEXT      NOT NULL DEFAULT 'applied'
                      CHECK (status IN ('applied','interview','offer','rejected','withdrawn')),
    job_description   TEXT,
    job_url           TEXT,
    match_score       INTEGER,
    match_summary     TEXT,
    match_details     TEXT,            -- JSON: strengths / gaps / suggestions
    matched_at        TIMESTAMP,
    created_at        TIMESTAMP NOT NULL,
    updated_at        TIMESTAMP NOT NULL,
    status_changed_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_jobs_status ON jobs (status);
CREATE INDEX idx_jobs_company_lower ON jobs (lower(company));

CREATE TABLE job_events (
    id          BIGSERIAL PRIMARY KEY,
    job_id      BIGINT    NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
    from_status TEXT,
    to_status   TEXT      NOT NULL,
    created_at  TIMESTAMP NOT NULL
);
CREATE INDEX idx_job_events_job ON job_events (job_id);

CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE boards (
    id       BIGSERIAL PRIMARY KEY,
    name     TEXT    NOT NULL,
    home     TEXT    NOT NULL,
    search   TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    builtin  BOOLEAN NOT NULL DEFAULT FALSE,
    hidden   BOOLEAN NOT NULL DEFAULT FALSE
);
