import type { ICredentialDataDecryptedObject } from 'n8n-workflow';
import type { WhereGroup } from './type/where.condition';
import { getActiveDialect } from './dialectContext';
import {
	assertSafeIdentifier,
	DEFAULT_PORTS,
	placeholderStyleFor,
	quoteSqlIdentifier,
	renderPlaceholder,
	sqlReadingsFor,
	sqlTokens,
} from './foxSchema';
import {
	assertSupportedDialect,
	DEFAULT_SCHEMA,
	isFileDialect,
	isMysqlFamily,
	type SupportedDialect,
} from './supportedDialects';

const SAFE_INSERT_LITERALS = new Set([
	'CURRENT_TIMESTAMP',
	'CURRENT TIMESTAMP',
	'CURRENT_DATE',
	'CURRENT DATE',
	'CURRENT_TIME',
	'CURRENT TIME',
	'NOW()',
]);

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_$#]*$/;

export function assertIdent(name: string, label = 'identifier'): string {
	const trimmed = String(name ?? '').trim();
	if (!trimmed) {
		throw new Error(`${label} is required`);
	}
	if (!IDENT_RE.test(trimmed)) {
		throw new Error(
			`Invalid ${label} "${name}". Use letters, digits, underscore, $, or # only.`,
		);
	}
	return assertSafeIdentifier(trimmed, label);
}

export function quoteIdent(
	name: string,
	label = 'identifier',
	dialect?: SupportedDialect,
): string {
	const id = assertIdent(name, label);
	const d = dialect ?? getActiveDialect();
	const normalized = d === 'oracle' ? id.toUpperCase() : id;
	return quoteSqlIdentifier(normalized, d);
}

export function quoteAlias(alias: string, dialect?: SupportedDialect): string {
	const trimmed = String(alias ?? '').trim();
	if (!trimmed) {
		throw new Error('alias is required');
	}
	if (
		trimmed.includes(';') ||
		trimmed.includes('--') ||
		trimmed.includes('/*') ||
		trimmed.includes('*/') ||
		/[\r\n]/.test(trimmed)
	) {
		throw new Error(`Invalid alias: "${alias}"`);
	}
	const d = dialect ?? getActiveDialect();
	const normalized = d === 'oracle' ? trimmed.toUpperCase() : trimmed;
	return quoteSqlIdentifier(normalized, d);
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

	if (isMysqlFamily(dialect) || dialect === 'clickhouse') {
		return String(credentials.database ?? '').trim();
	}
	if (dialect === 'oracle') {
		return String(credentials.username ?? '').trim().toUpperCase();
	}
	return DEFAULT_SCHEMA[dialect];
}

export function qualifyTable(
	schema: string | undefined,
	table: string,
	dialect?: SupportedDialect,
): string {
	const quotedTable = quoteIdent(table, 'table', dialect);
	const s = schema?.trim();
	if (!s) return quotedTable;
	return `${quoteIdent(s, 'schema', dialect)}.${quotedTable}`;
}

export function toConnectionOptions(
	credentials: ICredentialDataDecryptedObject,
): Record<string, unknown> {
	const dialect = resolveDialect(credentials);
	const database = String(credentials.database ?? '').trim();
	if (isFileDialect(dialect) && !database) {
		throw new Error(
			`Dialect "${dialect}" needs a database file path (for example /data/app.db).`,
		);
	}

	const options: Record<string, unknown> = {
		database,
		username: String(credentials.username ?? ''),
		password: String(credentials.password ?? ''),
		schema: resolveSchema(credentials),
	};

	if (!isFileDialect(dialect)) {
		options.host = String(credentials.host ?? 'localhost');
		options.port = Number(credentials.port ?? defaultPort(dialect));
		options.ssl = {
			enabled: Boolean(credentials.useSsl) || dialect === 'azuresql',
			rejectUnauthorized: credentials.rejectUnauthorized !== false,
		};
	}

	return options;
}

export function defaultPort(dialect: SupportedDialect): number {
	return DEFAULT_PORTS[dialect] ?? 5432;
}

/**
 * Convert `?` placeholders to the dialect's bind style using @foxschema/sql's
 * lexer so comments, quoted identifiers, dollar-quotes, and string literals
 * are never rewritten.
 */
export function rewritePlaceholders(dialect: SupportedDialect, sql: string): string {
	const style = placeholderStyleFor(dialect);
	if (style === 'question') {
		return sql;
	}

	const reading = sqlReadingsFor(sql, dialect)[0] ?? {};
	let index = 0;
	let out = '';

	for (const token of sqlTokens(sql, reading)) {
		const raw = sql.slice(token.start, token.end);
		if (token.kind === 'punct' && raw === '?') {
			index += 1;
			out += renderPlaceholder(style, index);
		} else {
			out += raw;
		}
	}

	return out;
}

/**
 * Count `?` bind placeholders outside strings, quoted identifiers, comments,
 * and dollar-quoted blocks using @foxschema/sql's tokenizer.
 */
export function countSqlPlaceholders(
	sql: string,
	dialect?: SupportedDialect,
): number {
	const reading = sqlReadingsFor(sql, dialect)[0] ?? {};
	let count = 0;
	for (const token of sqlTokens(sql, reading)) {
		if (token.kind === 'punct' && sql.slice(token.start, token.end) === '?') {
			count += 1;
		}
	}
	return count;
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
