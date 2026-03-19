// Shared type definitions used by both client and server code

// --- Participants ---

export interface ParticipantRecord {
	id: string;
	experiment_id: string;
	email: string;
	registration_data: Record<string, unknown>;
	registered_at: string;
}

// --- Responses ---

export interface ResponseRecord {
	id: string;
	experiment_id: string;
	participant_id: string;
	phase_id: string;
	stimulus_id: string;
	response_data: Record<string, unknown>;
	response_index: number;
	created_at: string;
	updated_at: string;
}
