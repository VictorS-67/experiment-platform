import { describe, it, expect } from 'vitest';
import { applyMigrations, MIGRATIONS } from './migrate-configs-rules';

// Most of the rules pre-existed and have implicit coverage via the schema
// tests; the two NEW rules added in 2026-04 (nest-gatekeeper-question and
// strip-show-conditional-field) are the focus here.

function ruleByName(name: string) {
	const r = MIGRATIONS.find((m) => m.name === name);
	if (!r) throw new Error(`Migration rule not found: ${name}`);
	return r;
}

describe('migrate-configs rules', () => {
	describe('nest-gatekeeper-question', () => {
		const rule = ruleByName('nest-gatekeeper-question');

		it('lifts flat fields under initial and drops noResponseValue', () => {
			const config = {
				phases: [
					{
						gatekeeperQuestion: {
							text: { en: 'Engage?' },
							yesLabel: { en: 'Yes' },
							noLabel: { en: 'No' },
							noResponseValue: 'null',
							skipToNext: true
						}
					}
				]
			};
			const result = rule.apply(config);
			expect(result.changed).toBe(true);
			const gq = (result.config as { phases: Array<{ gatekeeperQuestion: Record<string, unknown> }> })
				.phases[0].gatekeeperQuestion;
			expect(gq.initial).toEqual({
				text: { en: 'Engage?' },
				yesLabel: { en: 'Yes' },
				noLabel: { en: 'No' }
			});
			expect(gq.skipToNext).toBe(true);
			expect(gq.noResponseValue).toBeUndefined();
			expect(gq.text).toBeUndefined();
		});

		it('is idempotent on already-nested configs', () => {
			const config = {
				phases: [
					{
						gatekeeperQuestion: {
							initial: {
								text: { en: 'Engage?' },
								yesLabel: { en: 'Yes' },
								noLabel: { en: 'No' }
							},
							skipToNext: true
						}
					}
				]
			};
			const result = rule.apply(config);
			expect(result.changed).toBe(false);
			expect(result.config).toEqual(config);
		});

		it('drops a stray noResponseValue alongside an already-nested config', () => {
			const config = {
				phases: [
					{
						gatekeeperQuestion: {
							initial: {
								text: { en: 'Engage?' },
								yesLabel: { en: 'Yes' },
								noLabel: { en: 'No' }
							},
							noResponseValue: 'leftover',
							skipToNext: true
						}
					}
				]
			};
			const result = rule.apply(config);
			expect(result.changed).toBe(true);
			const gq = (result.config as { phases: Array<{ gatekeeperQuestion: Record<string, unknown> }> })
				.phases[0].gatekeeperQuestion;
			expect(gq.noResponseValue).toBeUndefined();
			expect(gq.initial).toBeDefined();
		});

		it('leaves phases without a gatekeeperQuestion alone', () => {
			const config = { phases: [{ id: 'p1' }, { id: 'p2', gatekeeperQuestion: null }] };
			const result = rule.apply(config);
			expect(result.changed).toBe(false);
		});

		it('preserves a subsequent block when migrating a flat config that has both', () => {
			// Edge case: someone hand-edited a config to add `subsequent` while
			// the rest stayed flat. The rule should preserve `subsequent` via the
			// `...rest` spread.
			const config = {
				phases: [
					{
						gatekeeperQuestion: {
							text: { en: 'Engage?' },
							yesLabel: { en: 'Yes' },
							noLabel: { en: 'No' },
							subsequent: {
								text: { en: 'More?' },
								yesLabel: { en: 'Yes' },
								noLabel: { en: 'No' }
							}
						}
					}
				]
			};
			const result = rule.apply(config);
			expect(result.changed).toBe(true);
			const gq = (result.config as { phases: Array<{ gatekeeperQuestion: Record<string, unknown> }> })
				.phases[0].gatekeeperQuestion;
			expect(gq.subsequent).toEqual({
				text: { en: 'More?' },
				yesLabel: { en: 'Yes' },
				noLabel: { en: 'No' }
			});
			expect(gq.initial).toBeDefined();
		});
	});

	describe('strip-show-conditional-field', () => {
		const rule = ruleByName('strip-show-conditional-field');

		it('removes showConditionalField from every option that has it', () => {
			const config = {
				registration: {
					fields: [
						{
							id: 'lang',
							options: [
								{ value: 'en', label: { en: 'English' } },
								{ value: 'other', label: { en: 'Other' }, showConditionalField: 'other_lang' }
							]
						}
					]
				}
			};
			const result = rule.apply(config);
			expect(result.changed).toBe(true);
			const opts = (
				result.config as { registration: { fields: Array<{ options: Array<Record<string, unknown>> }> } }
			).registration.fields[0].options;
			expect(opts[1].showConditionalField).toBeUndefined();
			expect(opts[1].value).toBe('other');
			expect(opts[0]).toEqual({ value: 'en', label: { en: 'English' } });
			expect(result.notes.length).toBe(1);
			expect(result.notes[0]).toContain('lang');
			expect(result.notes[0]).toContain('other_lang');
		});

		it('is idempotent', () => {
			const config = {
				registration: {
					fields: [
						{
							id: 'lang',
							options: [{ value: 'en', label: { en: 'English' } }]
						}
					]
				}
			};
			const result = rule.apply(config);
			expect(result.changed).toBe(false);
		});

		it('leaves configs without registration.fields alone', () => {
			const result = rule.apply({ registration: {} });
			expect(result.changed).toBe(false);
		});
	});

	describe('full pipeline (applyMigrations)', () => {
		it('runs both new rules in one pass', () => {
			const config = {
				phases: [
					{
						gatekeeperQuestion: {
							text: { en: 'Engage?' },
							yesLabel: { en: 'Yes' },
							noLabel: { en: 'No' },
							noResponseValue: 'null'
						}
					}
				],
				registration: {
					fields: [
						{
							id: 'lang',
							options: [
								{ value: 'other', label: { en: 'Other' }, showConditionalField: 'other_lang' }
							]
						}
					]
				}
			};
			const result = applyMigrations(config);
			expect(result.changed).toBe(true);
			const gq = (result.config as { phases: Array<{ gatekeeperQuestion: Record<string, unknown> }> })
				.phases[0].gatekeeperQuestion;
			expect(gq.initial).toBeDefined();
			expect(gq.noResponseValue).toBeUndefined();
			const opt = (
				result.config as { registration: { fields: Array<{ options: Array<Record<string, unknown>> }> } }
			).registration.fields[0].options[0];
			expect(opt.showConditionalField).toBeUndefined();
		});

		it('is idempotent across the full pipeline', () => {
			const config = {
				phases: [
					{
						gatekeeperQuestion: {
							initial: {
								text: { en: 'Engage?' },
								yesLabel: { en: 'Yes' },
								noLabel: { en: 'No' }
							},
							skipToNext: true
						}
					}
				],
				registration: {
					fields: [{ id: 'lang', options: [{ value: 'en', label: { en: 'English' } }] }]
				}
			};
			const first = applyMigrations(config);
			const second = applyMigrations(first.config);
			expect(second.changed).toBe(false);
		});
	});
});
