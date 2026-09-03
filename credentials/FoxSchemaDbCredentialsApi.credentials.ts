import { ICredentialType, INodeProperties } from 'n8n-workflow';

const NETWORK_DIALECTS = [
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
	'clickhouse',
];

const FILE_DIALECTS = ['sqlite', 'duckdb'];

export class FoxSchemaDbCredentialsApi implements ICredentialType {
	name = 'foxSchemaDbCredentialsApi';
	displayName = 'Fox Schema Database';
	documentationUrl = 'https://foxschema.com';
	icon = {
		light: 'file:foxschema.svg',
		dark: 'file:foxschema.dark.svg',
	} as const;

	properties: INodeProperties[] = [
		{
			displayName: 'Dialect',
			name: 'dialect',
			type: 'options',
			options: [
				{ name: 'PostgreSQL', value: 'postgres' },
				{ name: 'CockroachDB', value: 'cockroachdb' },
				{ name: 'YugabyteDB', value: 'yugabytedb' },
				{ name: 'Amazon Redshift', value: 'redshift' },
				{ name: 'MySQL', value: 'mysql' },
				{ name: 'MariaDB', value: 'mariadb' },
				{ name: 'TiDB', value: 'tidb' },
				{ name: 'SQL Server', value: 'sqlserver' },
				{ name: 'Azure SQL', value: 'azuresql' },
				{ name: 'Oracle', value: 'oracle' },
				{ name: 'SQLite', value: 'sqlite' },
				{ name: 'DuckDB', value: 'duckdb' },
				{ name: 'ClickHouse', value: 'clickhouse' },
			],
			default: 'postgres',
			description:
				'Database dialect. Db2 is not supported by this community node (use n8n-nodes-db2-sql-builder).',
		},
		{
			displayName: 'Host',
			name: 'host',
			type: 'string',
			required: true,
			default: 'localhost',
			displayOptions: {
				show: {
					dialect: NETWORK_DIALECTS,
				},
			},
		},
		{
			displayName: 'Database / Service',
			name: 'database',
			type: 'string',
			required: true,
			default: '',
			description:
				'Database name (Postgres/MySQL/SQL Server/Redshift/Cockroach/Yugabyte/TiDB/ClickHouse) or Oracle service name / SID',
			displayOptions: {
				show: {
					dialect: NETWORK_DIALECTS,
				},
			},
		},
		{
			displayName: 'Database File Path',
			name: 'database',
			type: 'string',
			required: true,
			default: '',
			placeholder: '/data/app.db',
			description: 'Absolute path to the SQLite (.db) or DuckDB (.duckdb) file',
			displayOptions: {
				show: {
					dialect: FILE_DIALECTS,
				},
			},
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			required: true,
			default: '',
			displayOptions: {
				show: {
					dialect: NETWORK_DIALECTS,
				},
			},
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			required: false,
			default: '',
			description:
				'Leave empty for engines that allow passwordless login (Cockroach insecure, local Yugabyte).',
			displayOptions: {
				show: {
					dialect: NETWORK_DIALECTS,
				},
			},
		},
		{
			displayName: 'Port',
			name: 'port',
			type: 'number',
			default: 5432,
			description:
				'Defaults: Postgres 5432, Cockroach 26257, Yugabyte 5433, Redshift 5439, MySQL/MariaDB 3306, TiDB 4000, SQL Server/Azure SQL 1433, Oracle 1521, ClickHouse 8123',
			displayOptions: {
				show: {
					dialect: NETWORK_DIALECTS,
				},
			},
		},
		{
			displayName: 'Schema',
			name: 'schema',
			type: 'string',
			default: '',
			description:
				'Schema / owner / database used to qualify objects. Defaults: public (Postgres family), dbo (SQL Server / Azure SQL), database name (MySQL / TiDB / ClickHouse), username (Oracle), main (DuckDB).',
		},
		{
			displayName: 'Use SSL',
			name: 'useSsl',
			type: 'boolean',
			default: false,
			description: 'Azure SQL always encrypts. Enable this for Redshift, Cockroach Cloud, and other TLS endpoints.',
			displayOptions: {
				show: {
					dialect: NETWORK_DIALECTS,
				},
			},
		},
		{
			displayName: 'Reject Unauthorized SSL',
			name: 'rejectUnauthorized',
			type: 'boolean',
			default: true,
			displayOptions: {
				show: {
					useSsl: [true],
					dialect: NETWORK_DIALECTS,
				},
			},
		},
	];
}
