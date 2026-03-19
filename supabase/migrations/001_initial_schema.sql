-- Experiment Platform: Initial Schema

-- Experiments store the full config as JSONB
CREATE TABLE experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  config JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_experiments_slug ON experiments(slug);
CREATE INDEX idx_experiments_status ON experiments(status);

-- Participants: one per experiment per email
CREATE TABLE participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  registration_data JSONB NOT NULL DEFAULT '{}',
  registered_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(experiment_id, email)
);

CREATE INDEX idx_participants_experiment ON participants(experiment_id);
CREATE INDEX idx_participants_email ON participants(email);
CREATE INDEX idx_participants_registration ON participants USING GIN(registration_data);

-- Responses: arbitrary response data per stimulus per phase
CREATE TABLE responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  phase_id TEXT NOT NULL,
  stimulus_id TEXT NOT NULL,
  response_data JSONB NOT NULL DEFAULT '{}',
  response_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_responses_experiment ON responses(experiment_id);
CREATE INDEX idx_responses_participant ON responses(participant_id);
CREATE INDEX idx_responses_lookup ON responses(experiment_id, participant_id, phase_id);
CREATE INDEX idx_responses_data ON responses USING GIN(response_data);

-- File uploads (audio recordings, etc.)
CREATE TABLE file_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID REFERENCES responses(id) ON DELETE CASCADE,
  experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  widget_id TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_file_uploads_response ON file_uploads(response_id);

-- Admin users
CREATE TABLE admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  role TEXT NOT NULL DEFAULT 'researcher' CHECK (role IN ('admin', 'researcher')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Flat view for easy data export
CREATE OR REPLACE VIEW response_flat AS
SELECT
  r.id,
  e.slug AS experiment_slug,
  p.email AS participant_email,
  p.registration_data->>'name' AS participant_name,
  r.phase_id,
  r.stimulus_id,
  r.response_data,
  r.response_index,
  r.created_at,
  r.updated_at
FROM responses r
JOIN experiments e ON e.id = r.experiment_id
JOIN participants p ON p.id = r.participant_id;
