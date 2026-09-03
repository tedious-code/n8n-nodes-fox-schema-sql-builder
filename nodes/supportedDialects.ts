export const SUPPORTED_DIALECTS = [
	'postgres',
	'cockroachdb',
	'yugabytedb',
	'redshift',
	'mysql',
	'mariadb',
	'tidb',
	'sqlserver',
	'azuresql',
	'oracle',
	'sqlite',
	'duckdb',
	'clickhouse',
] as const;

export type SupportedDialect = (typeof SUPPORTED_DIALECTS)[number];

export type DialectFamily =
	| 'postgres'
	| 'mysql'
	| 'sqlserver'
	| 'oracle'
	| 'sqlite'
	| 'clickhouse';

export const DIALECT_DRIVER: Record<SupportedDialect, string> = {
	postgres: 'pg',
	cockroachdb: 'pg',
	yugabytedb: 'pg',
	redshift: 'pg',
	mysql: 'mysql2',
	mariadb: 'mysql2',
	tidb: 'mysql2',
	sqlserver: 'mssql',
	azuresql: 'mssql',
	oracle: 'oracledb',
	sqlite: 'better-sqlite3',
	duckdb: '@duckdb/node-api',
	clickhouse: '@clickhouse/client',
};

export const DEFAULT_SCHEMA: Record<SupportedDialect, string> = {
	postgres: 'public',
	cockroachdb: 'public',
	yugabytedb: 'public',
	redshift: 'public',
	mysql: '',
	mariadb: '',
	tidb: '',
	sqlserver: 'dbo',
	azuresql: 'dbo',
	oracle: '',
	sqlite: '',
	duckdb: 'main',
	clickhouse: '',
};

export const FILE_DIALECTS: readonly SupportedDialect[] = ['sqlite', 'duckdb'];

export function dialectFamily(dialect: SupportedDialect): DialectFamily {
	switch (dialect) {
		case 'postgres':
		case 'cockroachdb':
		case 'yugabytedb':
		case 'redshift':
			return 'postgres';
		case 'mysql':
		case 'mariadb':
		case 'tidb':
			return 'mysql';
		case 'sqlserver':
		case 'azuresql':
			return 'sqlserver';
		case 'oracle':
			return 'oracle';
		case 'clickhouse':
			return 'clickhouse';
		case 'sqlite':
		case 'duckdb':
			return 'sqlite';
	}
}

export function isFileDialect(dialect: string): boolean {
	return (FILE_DIALECTS as readonly string[]).includes(dialect.toLowerCase());
}

export function isMysqlFamily(dialect: SupportedDialect): boolean {
	return dialectFamily(dialect) === 'mysql';
}

export function isPostgresFamily(dialect: SupportedDialect): boolean {
	return dialectFamily(dialect) === 'postgres';
}

export function isSqlServerFamily(dialect: SupportedDialect): boolean {
	return dialectFamily(dialect) === 'sqlserver';
}

/** INSERT … RETURNING * is reliable on these engines. */
export function supportsInsertReturning(dialect: SupportedDialect): boolean {
	return (
		dialect === 'postgres' ||
		dialect === 'cockroachdb' ||
		dialect === 'yugabytedb' ||
		dialect === 'sqlite' ||
		dialect === 'duckdb'
	);
}

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

	if (normalized === 'mongodb' || normalized === 'redis') {
		throw new Error(
			`Dialect "${dialect}" is not a SQL engine. This node is a SQL Builder. ` +
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
