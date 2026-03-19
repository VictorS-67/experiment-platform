import type { Actions } from './$types';
import { fail, isRedirect, redirect } from '@sveltejs/kit';
import { createExperiment } from '$lib/server/admin';
import { ExperimentConfigSchema } from '$lib/config/schema';

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.adminUser) return fail(401, { error: 'Unauthorized' });
		const formData = await request.formData();
		const slug = (formData.get('slug') as string)?.trim().toLowerCase();
		const titleEn = (formData.get('title_en') as string)?.trim();
		const titleJa = (formData.get('title_ja') as string)?.trim();
		const descEn = (formData.get('description_en') as string)?.trim();

		if (!slug) return fail(400, { error: 'Slug is required.' });
		if (!/^[a-z0-9-]+$/.test(slug)) return fail(400, { error: 'Slug must be lowercase letters, numbers, and hyphens only.' });
		if (!titleEn) return fail(400, { error: 'English title is required.' });

		const title: Record<string, string> = { en: titleEn };
		if (titleJa) title.ja = titleJa;

		const description: Record<string, string> = {};
		if (descEn) description.en = descEn;

		const languages = ['en'];
		if (titleJa) languages.push('ja');

		// Build minimal valid config
		const config = {
			slug,
			version: 1,
			status: 'draft',
			metadata: {
				title,
				description,
				languages,
				defaultLanguage: 'en'
			},
			registration: {
				introduction: {
					title: { en: 'Welcome' },
					body: { en: 'Please register to participate.' }
				},
				fields: [
					{
						id: 'email',
						type: 'email',
						label: { en: 'Email address' },
						required: true
					},
					{
						id: 'name',
						type: 'text',
						label: { en: 'Your name' },
						required: true
					}
				]
			},
			tutorial: null,
			phases: [
				{
					id: 'main',
					slug: 'main',
					type: 'stimulus-response',
					title: { en: titleEn },
					responseWidgets: [],
					stimulusOrder: 'sequential',
					allowRevisit: true,
					allowMultipleResponses: false,
					completion: {
						title: { en: 'Complete!' },
						body: { en: 'Thank you for participating.' }
					}
				}
			],
			stimuli: {
				type: 'video',
				source: 'supabase-storage',
				storagePath: `experiments/stimuli/${slug}/`,
				items: []
			}
		};

		// Validate with Zod
		const result = ExperimentConfigSchema.safeParse(config);
		if (!result.success) {
			return fail(400, { error: `Invalid config: ${result.error.issues[0]?.message}` });
		}

		try {
			const { id } = await createExperiment(slug, result.data);
			redirect(302, `/admin/experiments/${id}`);
		} catch (err) {
			if (isRedirect(err)) throw err;
			const message = err instanceof Error ? err.message : 'Failed to create experiment';
			if (message.includes('duplicate') || message.includes('unique')) {
				return fail(400, { error: `Slug "${slug}" is already taken.` });
			}
			return fail(500, { error: message });
		}
	}
};
