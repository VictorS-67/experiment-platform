-- Experiment config version history
CREATE TABLE experiment_config_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    config JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(experiment_id, version_number)
);

CREATE INDEX idx_config_versions_experiment
    ON experiment_config_versions(experiment_id, version_number DESC);

ALTER TABLE experiment_config_versions ENABLE ROW LEVEL SECURITY;
-- No public access; only service role reads/writes this table
