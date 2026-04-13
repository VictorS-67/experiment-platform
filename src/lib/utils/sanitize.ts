/**
 * Validates that an ID contains only safe characters (no path traversal).
 * Allows alphanumeric, hyphens, underscores, and dots.
 */
export function validateSafeId(id: string): boolean {
	return /^[a-zA-Z0-9_.-]+$/.test(id) && id.length > 0 && id.length <= 255 && !id.includes('..');
}

/**
 * Iteratively sanitizes a path by removing all '..' and '//' sequences
 * until the result is stable. Prevents bypass via patterns like '....//'.
 */
export function sanitizePath(path: string): string {
	let prev = '';
	let current = path;
	while (current !== prev) {
		prev = current;
		current = current.replace(/\.\./g, '').replace(/\/\//g, '/');
	}
	return current;
}
