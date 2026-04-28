-- Postgres-backed rate limiter.
--
-- Replaces the in-memory sliding-window limiter that resets on every Vercel
-- cold start. Uses a fixed window (per RATE_WINDOW_SECONDS) per (ip, endpoint).
-- The function returns true when the request is allowed and false when the
-- caller should reject with 429.
--
-- One row per (ip, endpoint, window_start). Old rows are cleaned up by the
-- nightly cron-friendly `cleanup_rate_limits` function — invoke from a
-- scheduled job (Supabase Cron, GitHub Actions, etc.).

CREATE TABLE rate_limits (
  ip TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, endpoint, window_start)
);

CREATE INDEX idx_rate_limits_window_start ON rate_limits(window_start);

-- Atomic increment + check. window_seconds is the bucket size; max_requests
-- is the per-window cap. Returns true if allowed (and increments the count),
-- false if the cap is reached.
CREATE OR REPLACE FUNCTION rate_limit_check(
    p_ip TEXT,
    p_endpoint TEXT,
    p_window_seconds INTEGER,
    p_max_requests INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    bucket_start TIMESTAMPTZ;
    new_count INTEGER;
BEGIN
    -- Floor "now" to the start of the current bucket.
    bucket_start := to_timestamp(
        floor(extract(epoch from NOW()) / p_window_seconds) * p_window_seconds
    );

    INSERT INTO rate_limits (ip, endpoint, window_start, count)
    VALUES (p_ip, p_endpoint, bucket_start, 1)
    ON CONFLICT (ip, endpoint, window_start)
    DO UPDATE SET count = rate_limits.count + 1
    RETURNING count INTO new_count;

    RETURN new_count <= p_max_requests;
END;
$$ LANGUAGE plpgsql;

-- House-keeping: delete buckets older than the lookback window. Call from a
-- scheduled job. Safe to run frequently — typically once per hour.
CREATE OR REPLACE FUNCTION cleanup_rate_limits(p_keep_seconds INTEGER DEFAULT 3600)
RETURNS INTEGER AS $$
DECLARE
    deleted INTEGER;
BEGIN
    DELETE FROM rate_limits
    WHERE window_start < NOW() - (p_keep_seconds || ' seconds')::INTERVAL;
    GET DIAGNOSTICS deleted = ROW_COUNT;
    RETURN deleted;
END;
$$ LANGUAGE plpgsql;

-- RLS: anon/authenticated have zero access; only service role manipulates.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
