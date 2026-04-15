-- Enable pgvector extension (run once per database, safe to re-run)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column (1024 dims = voyage-multilingual-2)
ALTER TABLE "vocabulary" ADD COLUMN IF NOT EXISTS "embedding" vector(1024);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS vocabulary_embedding_idx
  ON "vocabulary" USING hnsw (embedding vector_cosine_ops);