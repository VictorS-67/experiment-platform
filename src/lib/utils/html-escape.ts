/**
 * Escapes HTML special characters to prevent XSS when interpolating
 * user content into HTML strings (e.g., Driver.js popover descriptions).
 */
export function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
