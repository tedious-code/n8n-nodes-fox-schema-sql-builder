import type { SupportedDialect } from '../supportedDialects';

export function buildLimit(limit?: number, dialect?: SupportedDialect): string {
	if (limit === undefined || limit === null) return '';
	const n = Number(limit);
	if (!Number.isInteger(n) || n <= 0) {
		throw new Error('Limit must be a positive integer');
	}
	if (n > 100000) {
		throw new Error('Limit cannot exceed 100000');
	}

	const d = dialect ?? 'postgres';
	switch (d) {
		case 'mysql':
		case 'mariadb':
		case 'postgres':
			return `LIMIT ${n}`;
		case 'sqlserver':
			return `OFFSET 0 ROWS FETCH NEXT ${n} ROWS ONLY`;
		case 'oracle':
		default:
			return `FETCH FIRST ${n} ROWS ONLY`;
	}
}
