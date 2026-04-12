-- Stores per-chunk latin square / block order assignments for each participant.
-- Format: { "chunk_slug": { "blockOrder": ["block_a", "block_b", ...], "assignedAt": "ISO date" } }
ALTER TABLE participants ADD COLUMN IF NOT EXISTS chunk_assignments JSONB DEFAULT '{}';
