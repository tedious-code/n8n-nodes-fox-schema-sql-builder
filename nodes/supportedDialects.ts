export const SUPPORTED_DIALECTS = [
	'postgres',
	'mysql',
	'mariadb',
	'sqlserver',
	'oracle',
] as const;

export type SupportedDialect = (typeof SUPPORTED_DIALECTS)[number];

export const DIALECT_DRIVER: Record<SupportedDialect, string> = {
	postgres: 'pg',
	mysql: 'mysql2',
	mariadb: 'mysql2',
	sqlserver: 'mssql',
	oracle: 'oracledb',
};

export const DEFAULT_SCHEMA: Record<SupportedDialect, string> = {
	postgres: 'public',
	mysql: '',
	mariadb: '',
	sqlserver: 'dbo',
	oracle: '',
};

export function isSupportedDialect(value: string): value is SupportedDialect {
	return (SUPPORTED_DIALECTS as readonly string[]).includes(value.toLowerCase());
}

export function assertSupportedDialect(dialect: string): SupportedDialect {
	const normalized = String(dialect ?? '')
		.trim()
		.toLowerCase();

	if (normalized === 'db2') {
		throw new Error(
			'Dialect "db2" is not supported by n8n-nodes-fox-schema-sql-builder. ' +
				'Db2 is intentionally unsupported because ibm_db cannot install via n8n community nodes. ' +
				'Use n8n-nodes-db2-sql-builder with a custom Docker image if you need Db2. ' +
				`Supported: ${SUPPORTED_DIALECTS.join(', ')}.`,
		);
	}

	if (!isSupportedDialect(normalized)) {
		throw new Error(
			`Dialect "${dialect}" is not supported. Supported: ${SUPPORTED_DIALECTS.join(', ')}.`,
		);
	}

	return normalized;
}
