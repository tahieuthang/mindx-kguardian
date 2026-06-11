-- ============================================================
-- K-Guardian Supabase Schema
-- Run these in Supabase SQL Editor in order.
-- ============================================================

-- Step 1: Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Table: knowledge_base ────────────────────────────────────────────────────
-- Stores approved, production-quality knowledge entries.
-- Extension reads from this table only.

CREATE TABLE IF NOT EXISTS knowledge_base (
  id          bigint        PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  title       text          NOT NULL,
  content     text          NOT NULL,
  reporter    text          NOT NULL,
  embedding   vector(768),
  created_at  timestamp     DEFAULT now(),
  updated_at  timestamp     DEFAULT now()
);

-- ─── Table: knowledge_queue ───────────────────────────────────────────────────
-- Staging table for new contributions pending review.

CREATE TABLE IF NOT EXISTS knowledge_queue (
  id          bigint        PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  title       text          NOT NULL,
  content     text          NOT NULL,
  reporter    text          NOT NULL,
  embedding   vector(768),
  status      text          DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  ai_notes    jsonb,
  created_at  timestamp     DEFAULT now()
);

-- ─── RPC: match_documents ─────────────────────────────────────────────────────
-- Semantic search using cosine similarity.
-- Called by the Extension (Search Tab).

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding  vector(768),
  match_threshold  float    DEFAULT 0.7,
  match_count      int      DEFAULT 10
)
RETURNS TABLE (
  id          bigint,
  title       text,
  content     text,
  reporter    text,
  similarity  float
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    title,
    content,
    reporter,
    1 - (embedding <=> query_embedding) AS similarity
  FROM knowledge_base
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
$$;

-- ─── RPC: check_duplicate_in_prod ─────────────────────────────────────────────
-- Checks if a new queue entry is similar to existing knowledge_base records.
-- Called by Admin moderation script (similarity > 0.8).

CREATE OR REPLACE FUNCTION check_duplicate_in_prod(
  query_embedding  vector(768),
  match_threshold  float DEFAULT 0.8
)
RETURNS TABLE (
  id          bigint,
  title       text,
  similarity  float
)
LANGUAGE sql STABLE AS $$
  SELECT
    id,
    title,
    1 - (embedding <=> query_embedding) AS similarity
  FROM knowledge_base
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC;
$$;

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Anon key (Extension) can only SELECT from knowledge_base and INSERT to queue.
-- All UPDATE/DELETE requires service_role (Admin Script).

ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_queue ENABLE ROW LEVEL SECURITY;

-- knowledge_base: anon can only read
CREATE POLICY "anon_select_knowledge_base"
  ON knowledge_base FOR SELECT
  TO anon USING (true);

-- knowledge_queue: anon can only insert pending entries
CREATE POLICY "anon_insert_knowledge_queue"
  ON knowledge_queue FOR INSERT
  TO anon WITH CHECK (status = 'pending');

-- service_role has full access (bypasses RLS by default in Supabase)
