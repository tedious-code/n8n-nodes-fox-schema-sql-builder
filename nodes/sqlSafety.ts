import type { ICredentialDataDecryptedObject } from 'n8n-workflow';
import type { WhereGroup } from './type/where.condition';
import { getActiveDialect } from './dialectContext';
import {
	assertSupportedDialect,
	DEFAULT_SCHEMA,
	type SupportedDialect,
} from './supportedDialects';

/** Ordinary SQL identifier */
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_$#]*$/;

const SAFE_INSERT_LITERALS = new Set([
	'CURRENT_TIMESTAMP',
	'CURRENT TIMESTAMP',
	'CURRENT_DATE',
	'CURRENT DATE',
	'CURRENT_TIME',
	'CURRENT TIME',
	'NOW()',
]);

export function assertIdent(name: string, label = 'identifier'): string {
	const trimmed = String(name ?? '').trim();
	if (!trimmed) {
		throw new Error(`${label} is required`);
	}
	if (trimmed.includes('"') || trimmed.includes('`') || trimmed.includes('[') || trimmed.includes('.') || trimmed.includes(';')) {
		throw new Error(`Invalid ${label}: "${name}"`);
	}
	if (!IDENT_RE.test(trimmed)) {
		throw new Error(
			`Invalid ${label} "${name}". Use letters, digits, underscore, $, or # only.`,
		);
	}
	return trimmed;
}

export function quoteIdent(name: string, label = 'identifier'): string {
	const id = assertIdent(name, label);
	const dialect = getActiveDialect();

	switch (dialect) {
		case 'mysql':
		case 'mariadb':
			return `\`${id.replace(/`/g, '``')}\``;
		case 'sqlserver':
			return `[${id.replace(/]/g, ']]')}]`;
		case 'oracle':
			return `"${id.toUpperCase()}"`;
		case 'postgres':
		default:
			return `"${id.replace(/"/g, '""')}"`;
	}
}

export function quoteAlias(alias: string): string {
	const trimmed = String(alias ?? '').trim();
	if (!trimmed) {
		throw new Error('alias is required');
	}
	if (trimmed.includes(';') || trimmed.includes('--')) {
		throw new Error(`Invalid alias: "${alias}"`);
	}
	const dialect = getActiveDialect();
	if (dialect === 'mysql' || dialect === 'mariadb') {
		return `\`${trimmed.replace(/`/g, '``')}\``;
	}
	if (dialect === 'sqlserver') {
		return `[${trimmed.replace(/]/g, ']]')}]`;
	}
	return `"${trimmed.replace(/"/g, '""')}"`;
}

export function resolveDialect(
	credentials: ICredentialDataDecryptedObject,
): SupportedDialect {
	return assertSupportedDialect(String(credentials.dialect ?? 'postgres'));
}

export function resolveSchema(credentials: ICredentialDataDecryptedObject): string {
	const dialect = resolveDialect(credentials);
	const schema = String(credentials.schema ?? '').trim();
	if (schema) return schema;

	if (dialect === 'mysql' || dialect === 'mariadb') {
		return String(credentials.database ?? '').trim();
	}
	if (dialect === 'oracle') {
		return String(credentials.username ?? '').trim().toUpperCase();
	}
	return DEFAULT_SCHEMA[dialect];
}

export function qualifyTable(schema: string | undefined, table: string): string {
	const quotedTable = quoteIdent(table, 'table');
	const s = schema?.trim();
	if (!s) return quotedTable;
	return `${quoteIdent(s, 'schema')}.${quotedTable}`;
}

export function toConnectionOptions(
	credentials: ICredentialDataDecryptedObject,
): Record<string, unknown> {
	const dialect = resolveDialect(credentials);
	return {
		host: String(credentials.host ?? 'localhost'),
		port: Number(credentials.port ?? defaultPort(dialect)),
		database: String(credentials.database ?? ''),
		username: String(credentials.username ?? ''),
		password: String(credentials.password ?? ''),
		schema: resolveSchema(credentials),
		ssl: {
			enabled: Boolean(credentials.useSsl),
			rejectUnauthorized: credentials.rejectUnauthorized !== false,
		},
	};
}

export function defaultPort(dialect: SupportedDialect): number {
	switch (dialect) {
		case 'mysql':
		case 'mariadb':
			return 3306;
		case 'sqlserver':
			return 1433;
		case 'oracle':
			return 1521;
		case 'postgres':
		default:
			return 5432;
	}
}

/** Convert `?` placeholders to the dialect's bind style. */
export function rewritePlaceholders(dialect: SupportedDialect, sql: string): string {
	if (dialect === 'mysql' || dialect === 'mariadb') {
		return sql;
	}

	let index = 0;
	let inSingle = false;
	let inDouble = false;
	let inBacktick = false;
	let result = '';

	for (let i = 0; i < sql.length; i++) {
		const c = sql[i];
		if (c === "'" && !inDouble && !inBacktick) inSingle = !inSingle;
		else if (c === '"' && !inSingle && !inBacktick) inDouble = !inDouble;
		else if (c === '`' && !inSingle && !inDouble) inBacktick = !inBacktick;
		else if (c === '?' && !inSingle && !inDouble && !inBacktick) {
			if (dialect === 'postgres') {
				index += 1;
				result += `$${index}`;
				continue;
			}
			if (dialect === 'sqlserver') {
				result += `@p${index}`;
				index += 1;
				continue;
			}
			if (dialect === 'oracle') {
				index += 1;
				result += `:${index}`;
				continue;
			}
		}
		result += c;
	}

	return result;
}

export function poolCacheKey(c: ICredentialDataDecryptedObject): string {
	const dialect = resolveDialect(c);
	return [
		dialect,
		String(c.host ?? ''),
		String(c.port ?? ''),
		String(c.database ?? ''),
		String(c.username ?? ''),
		resolveSchema(c),
		c.useSsl ? 'ssl' : 'plain',
	].join('|');
}

export function normalizeSafeInsertLiteral(value: string): string | null {
	const t = value
		.trim()
		.toUpperCase()
		.replace(/^NOW\(\)$/i, 'CURRENT_TIMESTAMP');
	if (SAFE_INSERT_LITERALS.has(t) || SAFE_INSERT_LITERALS.has(value.trim().toUpperCase())) {
		return t
			.replace('CURRENT TIMESTAMP', 'CURRENT_TIMESTAMP')
			.replace('CURRENT DATE', 'CURRENT_DATE')
			.replace('CURRENT TIME', 'CURRENT_TIME')
			.replace('NOW()', 'CURRENT_TIMESTAMP');
	}
	return null;
}

export function assertSafeWhereGroups(
	groups: WhereGroup[] | undefined,
	allowUnsafeSql: boolean,
): void {
	if (allowUnsafeSql || !groups?.length) return;

	for (const group of groups) {
		for (const cond of group.conditions ?? []) {
			if (
				cond.mode === 'expression' ||
				cond.mode === 'exists' ||
				cond.mode === 'not_exists' ||
				cond.mode === 'subquery_in' ||
				cond.mode === 'subquery_not_in'
			) {
				throw new Error(
					'Raw SQL conditions (expression / EXISTS / subquery) require "Allow Unsafe SQL" to be enabled.',
				);
			}
		}
		if (group.groups?.length) {
			assertSafeWhereGroups(group.groups, allowUnsafeSql);
		}
	}
}

export function assertSafeSqlFragment(
	allowUnsafeSql: boolean,
	fragment: string | undefined,
	label: string,
): void {
	if (!fragment?.trim()) return;
	if (!allowUnsafeSql) {
		throw new Error(`${label} requires "Allow Unsafe SQL" to be enabled.`);
	}
}
