import type { PageServerLoad, Actions } from './$types';
import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { updateExperiment, deleteExperiment } from '$lib/server/admin';
import {
	requireExperimentAccess,
	listCollaborators,
	listPendingInvites,
	inviteCollaboratorByEmail,
	setCollaboratorRole,
	removeCollaborator,
	revokePendingInvite,
	LastOwnerError,
	type CollaboratorRole
} from '$lib/server/collaborators';
import { logAdminAction } from '$lib/server/audit';

function audit(params: { id: string }, locals: App.Locals, getClientAddress: () => string, action: string, metadata?: Record<string, unknown>) {
	return logAdminAction({
		adminUserId: locals.adminUser?.id ?? null,
		adminEmail: locals.adminUser?.email ?? null,
		experimentId: params.id,
		action,
		resourceType: 'experiment',
		resourceId: params.id,
		metadata,
		ip: getClientAddress()
	});
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const myRole = await requireExperimentAccess(locals.adminUser, params.id, 'viewer');
	const [collaborators, pendingInvites] = await Promise.all([
		listCollaborators(params.id),
		listPendingInvites(params.id)
	]);
	return { myRole, collaborators, pendingInvites };
};

const ROLES: CollaboratorRole[] = ['owner', 'editor', 'viewer'];

export const actions: Actions = {
	updateStatus: async ({ request, params, locals, getClientAddress }) => {
		await requireExperimentAccess(locals.adminUser, params.id, 'editor');
		const formData = await request.formData();
		const status = formData.get('status') as string;

		if (!['draft', 'active', 'paused', 'archived'].includes(status)) {
			return fail(400, { error: 'Invalid status.' });
		}

		try {
			await updateExperiment(params.id, { status });
			await audit(params, locals, getClientAddress, 'experiment.status_change', { status });
			return { success: true, statusUpdated: true };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to update status.' });
		}
	},

	delete: async ({ params, locals, getClientAddress }) => {
		await requireExperimentAccess(locals.adminUser, params.id, 'owner');
		try {
			// Log BEFORE the cascade delete — the audit row's experiment_id
			// column is a FK to experiments.id, so inserting it after the
			// row is gone would violate the constraint (the ON DELETE SET NULL
			// rule only applies when the parent is later deleted, not when
			// inserting a dangling reference to an already-deleted row).
			await audit(params, locals, getClientAddress, 'experiment.delete');
			await deleteExperiment(params.id);
			redirect(302, '/admin/experiments');
		} catch (err) {
			if (isRedirect(err)) throw err;
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to delete.' });
		}
	},

	invite: async ({ request, params, locals, url, getClientAddress }) => {
		await requireExperimentAccess(locals.adminUser, params.id, 'owner');
		const formData = await request.formData();
		const email = (formData.get('email') as string | null)?.trim() ?? '';
		const role = formData.get('role') as CollaboratorRole;

		if (!email) return fail(400, { error: 'Email is required.', form: 'invite' });
		if (!ROLES.includes(role)) return fail(400, { error: 'Invalid role.', form: 'invite' });

		try {
			const outcome = await inviteCollaboratorByEmail(
				params.id,
				email,
				role,
				locals.adminUser!.id,
				url.origin
			);
			await audit(params, locals, getClientAddress, `collaborator.${outcome.kind}`, { email, role });
			if (outcome.kind === 'added') {
				return { success: true, invited: true, message: `${email} added as ${role}.` };
			}
			const baseMessage = outcome.emailSent
				? `Invite emailed to ${email}.`
				: `Email could not be sent (${outcome.emailError ?? 'no SMTP configured'}). Share this link with them:`;
			return {
				success: true,
				invited: true,
				message: baseMessage,
				claimUrl: outcome.claimUrl
			};
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : 'Failed to invite.',
				form: 'invite'
			});
		}
	},

	setRole: async ({ request, params, locals, getClientAddress }) => {
		await requireExperimentAccess(locals.adminUser, params.id, 'owner');
		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		const role = formData.get('role') as CollaboratorRole;
		if (!userId) return fail(400, { error: 'Missing user.' });
		if (!ROLES.includes(role)) return fail(400, { error: 'Invalid role.' });

		try {
			await setCollaboratorRole(params.id, userId, role);
			await audit(params, locals, getClientAddress, 'collaborator.role_change', { userId, role });
			return { success: true, roleChanged: true };
		} catch (err) {
			if (err instanceof LastOwnerError) {
				return fail(400, { error: err.message });
			}
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to update role.' });
		}
	},

	remove: async ({ request, params, locals, getClientAddress }) => {
		await requireExperimentAccess(locals.adminUser, params.id, 'owner');
		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		if (!userId) return fail(400, { error: 'Missing user.' });

		try {
			await removeCollaborator(params.id, userId);
			await audit(params, locals, getClientAddress, 'collaborator.remove', { userId });
			return { success: true, removed: true };
		} catch (err) {
			if (err instanceof LastOwnerError) {
				return fail(400, { error: err.message });
			}
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to remove.' });
		}
	},

	revokeInvite: async ({ request, params, locals, getClientAddress }) => {
		await requireExperimentAccess(locals.adminUser, params.id, 'owner');
		const formData = await request.formData();
		const inviteId = formData.get('inviteId') as string;
		if (!inviteId) return fail(400, { error: 'Missing invite.' });

		try {
			await revokePendingInvite(params.id, inviteId);
			await audit(params, locals, getClientAddress, 'invite.revoke', { inviteId });
			return { success: true, inviteRevoked: true };
		} catch (err) {
			return fail(500, { error: err instanceof Error ? err.message : 'Failed to revoke.' });
		}
	}
};
