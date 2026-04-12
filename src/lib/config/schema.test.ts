import { describe, it, expect } from 'vitest';
import { ExperimentConfigSchema } from './schema';

// Minimal valid config for testing
function makeMinimalConfig(overrides: Record<string, unknown> = {}) {
	return {
		slug: 'test-experiment',
		metadata: {
			title: { en: 'Test' },
			languages: ['en'],
			defaultLanguage: 'en'
		},
		registration: {
			introduction: {
				title: { en: 'Intro' },
				body: { en: 'Body' }
			},
			fields: []
		},
		phases: [
			{
				id: 'p1',
				slug: 'survey',
				type: 'stimulus-response',
				title: { en: 'Survey' },
				completion: {
					title: { en: 'Done' },
					body: { en: 'Done body' }
				}
			}
		],
		stimuli: {
			type: 'video',
			items: [
				{ id: 'v1', filename: 'video1.mp4' },
				{ id: 'v2', filename: 'video2.mp4' }
			]
		},
		...overrides
	};
}

describe('ExperimentConfigSchema', () => {
	it('validates a minimal config', () => {
		const result = ExperimentConfigSchema.safeParse(makeMinimalConfig());
		expect(result.success).toBe(true);
	});

	it('rejects invalid slug', () => {
		const result = ExperimentConfigSchema.safeParse(
			makeMinimalConfig({ slug: 'Has Spaces!' })
		);
		expect(result.success).toBe(false);
	});

	it('requires at least one phase', () => {
		const result = ExperimentConfigSchema.safeParse(
			makeMinimalConfig({ phases: [] })
		);
		expect(result.success).toBe(false);
	});

	it('defaults status to draft', () => {
		const result = ExperimentConfigSchema.parse(makeMinimalConfig());
		expect(result.status).toBe('draft');
	});

	it('defaults version to 1', () => {
		const result = ExperimentConfigSchema.parse(makeMinimalConfig());
		expect(result.version).toBe(1);
	});

	it('accepts null tutorial', () => {
		const result = ExperimentConfigSchema.safeParse(
			makeMinimalConfig({ tutorial: null })
		);
		expect(result.success).toBe(true);
	});

	it('validates tutorial with allowSkip and introduction', () => {
		const result = ExperimentConfigSchema.safeParse(
			makeMinimalConfig({
				tutorial: {
					allowSkip: false,
					introduction: {
						title: { en: 'About' },
						body: { en: 'About text' }
					},
					welcome: {
						title: { en: 'Welcome' },
						body: { en: 'Welcome body' },
						buttonText: { en: 'Begin' }
					},
					steps: [],
					completion: {
						title: { en: 'Done' },
						body: { en: 'Done' },
						buttonText: { en: 'Go' }
					}
				}
			})
		);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.tutorial?.allowSkip).toBe(false);
			expect(result.data.tutorial?.introduction?.title).toEqual({ en: 'About' });
		}
	});

	it('validates timestamp-range widget with timestampReviewMode', () => {
		const result = ExperimentConfigSchema.safeParse(
			makeMinimalConfig({
				phases: [
					{
						id: 'p1',
						slug: 'survey',
						type: 'stimulus-response',
						title: { en: 'Survey' },
						responseWidgets: [
							{
								id: 'ts1',
								type: 'timestamp-range',
								label: { en: 'Timestamp' },
								config: {
									timestampReviewMode: 'segment'
								}
							}
						],
						completion: {
							title: { en: 'Done' },
							body: { en: 'Done' }
						}
					}
				]
			})
		);
		expect(result.success).toBe(true);
	});

	it('validates chunking config', () => {
		const result = ExperimentConfigSchema.safeParse(
			makeMinimalConfig({
				stimuli: {
					type: 'video',
					items: [
						{ id: 'v1', filename: 'video1.mp4' },
						{ id: 'v2', filename: 'video2.mp4' },
						{ id: 'v3', filename: 'video3.mp4' },
						{ id: 'v4', filename: 'video4.mp4' }
					],
					chunking: {
						enabled: true,
						blockOrder: 'latin-square',
						withinBlockOrder: 'random-per-participant',
						chunks: [
							{
								id: 'chunk-1',
								slug: 'chunk-1',
								blocks: [
									{ id: 'happy', stimulusIds: ['v1', 'v2'] },
									{ id: 'sad', stimulusIds: ['v3', 'v4'] }
								]
							}
						]
					}
				}
			})
		);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.stimuli.chunking?.enabled).toBe(true);
			expect(result.data.stimuli.chunking?.blockOrder).toBe('latin-square');
			expect(result.data.stimuli.chunking?.chunks).toHaveLength(1);
			expect(result.data.stimuli.chunking?.chunks[0].blocks).toHaveLength(2);
		}
	});

	it('rejects invalid chunk slug', () => {
		const result = ExperimentConfigSchema.safeParse(
			makeMinimalConfig({
				stimuli: {
					type: 'video',
					items: [],
					chunking: {
						enabled: true,
						chunks: [
							{
								id: 'c1',
								slug: 'Has Spaces!',
								blocks: []
							}
						]
					}
				}
			})
		);
		expect(result.success).toBe(false);
	});

	it('validates registration field with placeholder and defaultValue', () => {
		const result = ExperimentConfigSchema.safeParse(
			makeMinimalConfig({
				registration: {
					introduction: {
						title: { en: 'Intro' },
						body: { en: 'Body' }
					},
					fields: [
						{
							id: 'name',
							type: 'text',
							label: { en: 'Name' },
							placeholder: { en: 'Your name' },
							defaultValue: 'Anonymous',
							required: true
						}
					]
				}
			})
		);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.registration.fields[0].placeholder).toEqual({ en: 'Your name' });
			expect(result.data.registration.fields[0].defaultValue).toBe('Anonymous');
		}
	});

	it('validates phase with allowRevisit false', () => {
		const result = ExperimentConfigSchema.safeParse(
			makeMinimalConfig({
				phases: [
					{
						id: 'p1',
						slug: 'survey',
						type: 'stimulus-response',
						title: { en: 'Survey' },
						allowRevisit: false,
						completion: {
							title: { en: 'Done' },
							body: { en: 'Done' }
						}
					}
				]
			})
		);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.phases[0].allowRevisit).toBe(false);
		}
	});

	it('validates widget conditionalOn', () => {
		const result = ExperimentConfigSchema.safeParse(
			makeMinimalConfig({
				phases: [
					{
						id: 'p1',
						slug: 'survey',
						type: 'stimulus-response',
						title: { en: 'Survey' },
						responseWidgets: [
							{ id: 'w1', type: 'select', label: { en: 'Feeling' }, config: { options: [{ value: 'yes', label: { en: 'Yes' } }] } },
							{ id: 'w2', type: 'text', label: { en: 'Details' }, conditionalOn: { widgetId: 'w1', value: 'yes' } }
						],
						completion: { title: { en: 'Done' }, body: { en: 'Done' } }
					}
				]
			})
		);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.phases[0].responseWidgets[1].conditionalOn).toEqual({ widgetId: 'w1', value: 'yes' });
		}
	});

	it('validates skipRules on phase', () => {
		const result = ExperimentConfigSchema.safeParse(
			makeMinimalConfig({
				phases: [
					{
						id: 'p1',
						slug: 'survey',
						type: 'stimulus-response',
						title: { en: 'Survey' },
						skipRules: [
							{
								targetStimulusId: 'v2',
								condition: { stimulusId: 'v1', widgetId: 'w1', operator: 'equals', value: 'no' }
							}
						],
						responseWidgets: [{ id: 'w1', type: 'select', label: { en: 'Q' } }],
						completion: { title: { en: 'Done' }, body: { en: 'Done' } }
					}
				]
			})
		);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.phases[0].skipRules).toHaveLength(1);
			expect(result.data.phases[0].skipRules![0].condition.operator).toBe('equals');
		}
	});

	it('validates branchRules on phase', () => {
		const result = ExperimentConfigSchema.safeParse(
			makeMinimalConfig({
				phases: [
					{
						id: 'p1', slug: 'survey', type: 'stimulus-response', title: { en: 'Survey' },
						branchRules: [
							{ condition: { widgetId: 'w1', operator: 'equals', value: 'yes' }, nextPhaseSlug: 'follow-up' }
						],
						responseWidgets: [{ id: 'w1', type: 'select', label: { en: 'Q' } }],
						completion: { title: { en: 'Done' }, body: { en: 'Done' } }
					},
					{
						id: 'p2', slug: 'follow-up', type: 'stimulus-response', title: { en: 'Follow-up' },
						completion: { title: { en: 'Done' }, body: { en: 'Done' } }
					}
				]
			})
		);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.phases[0].branchRules).toHaveLength(1);
			expect(result.data.phases[0].branchRules![0].nextPhaseSlug).toBe('follow-up');
		}
	});

	it('validates branchRules with optional stimulusId', () => {
		const result = ExperimentConfigSchema.safeParse(
			makeMinimalConfig({
				phases: [
					{
						id: 'p1', slug: 'survey', type: 'stimulus-response', title: { en: 'Survey' },
						branchRules: [
							{ condition: { widgetId: 'w1', stimulusId: 'v1', operator: 'not_equals', value: 'skip' }, nextPhaseSlug: 'deep-dive' }
						],
						responseWidgets: [{ id: 'w1', type: 'text', label: { en: 'Q' } }],
						completion: { title: { en: 'Done' }, body: { en: 'Done' } }
					},
					{
						id: 'p2', slug: 'deep-dive', type: 'stimulus-response', title: { en: 'Deep Dive' },
						completion: { title: { en: 'Done' }, body: { en: 'Done' } }
					}
				]
			})
		);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.phases[0].branchRules![0].condition.stimulusId).toBe('v1');
			expect(result.data.phases[0].branchRules![0].condition.operator).toBe('not_equals');
		}
	});

	it('validates breakScreen in chunking config', () => {
		const result = ExperimentConfigSchema.safeParse(
			makeMinimalConfig({
				stimuli: {
					type: 'video',
					items: [{ id: 'v1' }, { id: 'v2' }],
					chunking: {
						enabled: true,
						chunks: [{ id: 'c1', slug: 'chunk-1', blocks: [{ id: 'b1', stimulusIds: ['v1', 'v2'] }] }],
						breakScreen: {
							title: { en: 'Break Time' },
							body: { en: 'Take a rest.' },
							duration: 10
						}
					}
				}
			})
		);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.stimuli.chunking?.breakScreen?.title).toEqual({ en: 'Break Time' });
			expect(result.data.stimuli.chunking?.breakScreen?.duration).toBe(10);
		}
	});

	it('validates breakScreen without duration', () => {
		const result = ExperimentConfigSchema.safeParse(
			makeMinimalConfig({
				stimuli: {
					type: 'video',
					items: [{ id: 'v1' }],
					chunking: {
						enabled: true,
						chunks: [{ id: 'c1', slug: 'chunk-1', blocks: [] }],
						breakScreen: {
							title: { en: 'Break' },
							body: { en: 'Rest.' }
						}
					}
				}
			})
		);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.stimuli.chunking?.breakScreen?.duration).toBeUndefined();
		}
	});

	it('validates response widget with stepNumber and stepLabel', () => {
		const result = ExperimentConfigSchema.safeParse(
			makeMinimalConfig({
				phases: [
					{
						id: 'p1',
						slug: 'survey',
						type: 'stimulus-response',
						title: { en: 'Survey' },
						responseWidgets: [
							{
								id: 'w1',
								type: 'text',
								label: { en: 'Widget' },
								placeholder: { en: 'Type here' },
								stepNumber: 1,
								stepLabel: { en: 'Step 1' }
							}
						],
						completion: {
							title: { en: 'Done' },
							body: { en: 'Done' }
						}
					}
				]
			})
		);
		expect(result.success).toBe(true);
		if (result.success) {
			const w = result.data.phases[0].responseWidgets[0];
			expect(w.stepNumber).toBe(1);
			expect(w.stepLabel).toEqual({ en: 'Step 1' });
			expect(w.placeholder).toEqual({ en: 'Type here' });
		}
	});
});
