-- nomic-embed-text produces 768-dimensional vectors. If you switch embedding models, add a migration
-- that changes the dimension and re-run POST /embeddings/reindex.
CREATE TABLE job_embeddings (
    job_id       BIGINT PRIMARY KEY REFERENCES jobs (id) ON DELETE CASCADE,
    embedding    vector(768) NOT NULL,
    content_hash TEXT        NOT NULL,
    updated_at   TIMESTAMP   NOT NULL DEFAULT now()
);

CREATE TABLE resume_chunks (
    id          BIGSERIAL PRIMARY KEY,
    chunk_index INTEGER     NOT NULL,
    content     TEXT        NOT NULL,
    embedding   vector(768) NOT NULL
);

CREATE TABLE chat_messages (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id TEXT      NOT NULL,
    role            TEXT      NOT NULL,
    content         TEXT      NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_conv ON chat_messages (conversation_id, id);
