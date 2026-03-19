export interface ParticipantInfo {
	id: string;
	experimentId: string;
	email: string;
	registrationData: Record<string, unknown>;
	registeredAt: string;
}

class ParticipantStore {
	current = $state<ParticipantInfo | null>(null);

	get isAuthenticated(): boolean {
		return this.current !== null;
	}
}

export const participantStore = new ParticipantStore();
