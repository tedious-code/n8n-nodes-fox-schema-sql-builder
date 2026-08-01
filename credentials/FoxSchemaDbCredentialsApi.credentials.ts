import { ICredentialType, INodeProperties } from 'n8n-workflow';

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
				{ name: 'MySQL', value: 'mysql' },
				{ name: 'MariaDB', value: 'mariadb' },
				{ name: 'SQL Server', value: 'sqlserver' },
				{ name: 'Oracle', value: 'oracle' },
			],
			default: 'postgres',
			description:
				'Database dialect. Db2 is not supported by this community node.',
		},
		{
			displayName: 'Host',
			name: 'host',
			type: 'string',
			required: true,
			default: 'localhost',
		},
		{
			displayName: 'Database / Service',
			name: 'database',
			type: 'string',
			required: true,
			default: '',
			description: 'Database name (Postgres/MySQL/SQL Server) or Oracle service name / SID',
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			required: true,
			default: '',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: {
				password: true,
			},
			required: true,
			default: '',
		},
		{
			displayName: 'Port',
			name: 'port',
			type: 'number',
			default: 5432,
			description: 'Default ports: Postgres 5432, MySQL 3306, SQL Server 1433, Oracle 1521',
		},
		{
			displayName: 'Schema',
			name: 'schema',
			type: 'string',
			default: '',
			description:
				'Schema / owner used to qualify objects. Defaults: public (Postgres), dbo (SQL Server), database name (MySQL), username (Oracle).',
		},
		{
			displayName: 'Use SSL',
			name: 'useSsl',
			type: 'boolean',
			default: false,
		},
		{
			displayName: 'Reject Unauthorized SSL',
			name: 'rejectUnauthorized',
			type: 'boolean',
			default: true,
			displayOptions: {
				show: {
					useSsl: [true],
				},
			},
		},
	];
}
