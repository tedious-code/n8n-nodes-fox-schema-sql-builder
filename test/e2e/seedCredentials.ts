import type { ICredentialDataDecryptedObject } from 'n8n-workflow';
import type { SupportedDialect } from '../../nodes/supportedDialects';

/**
 * Credentials matching foxSchema docker-compose + scripts/seed/seed-all.sh
 * (demo_a source schema). Override via FOX_E2E_* env vars when needed.
 */
export type SeedDialect = SupportedDialect;

export interface SeedExpectation {
	tables: string[];
	views: string[];
	functions: string[];
	procedures: string[];
	/** Table used for column + SELECT smoke tests */
	sampleTable: string;
	/** Expected column names (case-insensitive) on sampleTable */
	sampleColumns: string[];
	/** Procedure/function used for parameter assertions; empty when the seed has no routines */
	sampleRoutine: string;
	sampleRoutineType: 'PROCEDURE' | 'FUNCTION';
	/** Expected parameter name fragments (case-insensitive) */
	sampleParamNames: string[];
	/** Bound INSERT/SELECT/DELETE against customers (false for ClickHouse MergeTree) */
	rowDml: boolean;
}

const env = (key: string, fallback: string) => process.env[key] ?? fallback;

const PG_LIKE_EXPECT: SeedExpectation = {
	tables: ['categories', 'customers', 'products', 'orders', 'order_items'],
	views: ['v_customer_orders', 'v_low_stock', 'v_active_products'],
	functions: ['fn_get_discount', 'fn_order_total'],
	procedures: ['sp_confirm_order'],
	sampleTable: 'customers',
	sampleColumns: ['id', 'name'],
	sampleRoutine: 'fn_get_discount',
	sampleRoutineType: 'FUNCTION',
	sampleParamNames: ['p_price', 'p_qty'],
	rowDml: true,
};

const MYSQL_LIKE_EXPECT: SeedExpectation = { ...PG_LIKE_EXPECT };

const TABLE_VIEW_ONLY: SeedExpectation = {
	tables: ['categories', 'customers', 'products', 'orders', 'order_items'],
	views: ['v_customer_orders', 'v_low_stock', 'v_active_products'],
	functions: [],
	procedures: [],
	sampleTable: 'customers',
	sampleColumns: ['id', 'name'],
	sampleRoutine: '',
	sampleRoutineType: 'FUNCTION',
	sampleParamNames: [],
	rowDml: true,
};

export function seedCredentials(dialect: SeedDialect): ICredentialDataDecryptedObject {
	switch (dialect) {
		case 'postgres':
			return {
				dialect: 'postgres',
				host: env('FOX_E2E_PG_HOST', 'localhost'),
				port: Number(env('FOX_E2E_PG_PORT', '5432')),
				database: env('FOX_E2E_PG_DB', 'foxdb'),
				username: env('FOX_E2E_PG_USER', 'foxuser'),
				password: env('FOX_E2E_PG_PASS', 'foxpass'),
				schema: env('FOX_E2E_PG_SCHEMA', 'demo_a'),
				useSsl: false,
			};
		case 'cockroachdb':
			return {
				dialect: 'cockroachdb',
				host: env('FOX_E2E_CRDB_HOST', 'localhost'),
				port: Number(env('FOX_E2E_CRDB_PORT', '26257')),
				database: env('FOX_E2E_CRDB_DB', 'foxdb'),
				username: env('FOX_E2E_CRDB_USER', 'root'),
				password: env('FOX_E2E_CRDB_PASS', ''),
				schema: env('FOX_E2E_CRDB_SCHEMA', 'demo_a'),
				useSsl: false,
			};
		case 'yugabytedb':
			return {
				dialect: 'yugabytedb',
				host: env('FOX_E2E_YB_HOST', 'localhost'),
				port: Number(env('FOX_E2E_YB_PORT', '5433')),
				database: env('FOX_E2E_YB_DB', 'foxdb'),
				username: env('FOX_E2E_YB_USER', 'yugabyte'),
				password: env('FOX_E2E_YB_PASS', ''),
				schema: env('FOX_E2E_YB_SCHEMA', 'demo_a'),
				useSsl: false,
			};
		case 'redshift':
			return {
				dialect: 'redshift',
				host: env('FOX_E2E_RS_HOST', 'localhost'),
				port: Number(env('FOX_E2E_RS_PORT', '5439')),
				database: env('FOX_E2E_RS_DB', 'foxdb'),
				username: env('FOX_E2E_RS_USER', 'foxuser'),
				password: env('FOX_E2E_RS_PASS', 'foxpass'),
				schema: env('FOX_E2E_RS_SCHEMA', 'demo_a'),
				useSsl: env('FOX_E2E_RS_SSL', 'true') === 'true',
				rejectUnauthorized: false,
			};
		case 'mysql':
			return {
				dialect: 'mysql',
				host: env('FOX_E2E_MYSQL_HOST', 'localhost'),
				port: Number(env('FOX_E2E_MYSQL_PORT', '3306')),
				database: env('FOX_E2E_MYSQL_DB', 'demo_a'),
				username: env('FOX_E2E_MYSQL_USER', 'foxuser'),
				password: env('FOX_E2E_MYSQL_PASS', 'foxpass'),
				schema: env('FOX_E2E_MYSQL_SCHEMA', 'demo_a'),
				useSsl: false,
			};
		case 'mariadb':
			return {
				dialect: 'mariadb',
				host: env('FOX_E2E_MARIADB_HOST', 'localhost'),
				port: Number(env('FOX_E2E_MARIADB_PORT', '3307')),
				database: env('FOX_E2E_MARIADB_DB', 'demo_a'),
				username: env('FOX_E2E_MARIADB_USER', 'foxuser'),
				password: env('FOX_E2E_MARIADB_PASS', 'foxpass'),
				schema: env('FOX_E2E_MARIADB_SCHEMA', 'demo_a'),
				useSsl: false,
			};
		case 'tidb':
			return {
				dialect: 'tidb',
				host: env('FOX_E2E_TIDB_HOST', 'localhost'),
				port: Number(env('FOX_E2E_TIDB_PORT', '4000')),
				database: env('FOX_E2E_TIDB_DB', 'demo_a'),
				username: env('FOX_E2E_TIDB_USER', 'foxuser'),
				password: env('FOX_E2E_TIDB_PASS', 'foxpass'),
				schema: env('FOX_E2E_TIDB_SCHEMA', 'demo_a'),
				useSsl: false,
			};
		case 'sqlserver':
			return {
				dialect: 'sqlserver',
				host: env('FOX_E2E_MSSQL_HOST', 'localhost'),
				port: Number(env('FOX_E2E_MSSQL_PORT', '1433')),
				database: env('FOX_E2E_MSSQL_DB', 'foxdb'),
				username: env('FOX_E2E_MSSQL_USER', 'SA'),
				password: env('FOX_E2E_MSSQL_PASS', 'FoxPass123!'),
				schema: env('FOX_E2E_MSSQL_SCHEMA', 'demo_a'),
				useSsl: false,
				rejectUnauthorized: false,
			};
		case 'azuresql':
			return {
				dialect: 'azuresql',
				host: env('FOX_E2E_AZURE_HOST', env('FOX_E2E_MSSQL_HOST', 'localhost')),
				port: Number(env('FOX_E2E_AZURE_PORT', env('FOX_E2E_MSSQL_PORT', '1433'))),
				database: env('FOX_E2E_AZURE_DB', env('FOX_E2E_MSSQL_DB', 'foxdb')),
				username: env('FOX_E2E_AZURE_USER', env('FOX_E2E_MSSQL_USER', 'SA')),
				password: env('FOX_E2E_AZURE_PASS', env('FOX_E2E_MSSQL_PASS', 'FoxPass123!')),
				schema: env('FOX_E2E_AZURE_SCHEMA', env('FOX_E2E_MSSQL_SCHEMA', 'demo_a')),
				useSsl: true,
				rejectUnauthorized: false,
			};
		case 'oracle':
			return {
				dialect: 'oracle',
				host: env('FOX_E2E_ORACLE_HOST', 'localhost'),
				port: Number(env('FOX_E2E_ORACLE_PORT', '1521')),
				database: env('FOX_E2E_ORACLE_DB', 'FREEPDB1'),
				username: env('FOX_E2E_ORACLE_USER', 'demo_a'),
				password: env('FOX_E2E_ORACLE_PASS', 'foxpass'),
				schema: env('FOX_E2E_ORACLE_SCHEMA', 'DEMO_A'),
				useSsl: false,
			};
		case 'sqlite':
			return {
				dialect: 'sqlite',
				database: env('FOX_E2E_SQLITE_PATH', '/tmp/foxschema-sqlite/demo_a.db'),
				schema: env('FOX_E2E_SQLITE_SCHEMA', ''),
			};
		case 'duckdb':
			return {
				dialect: 'duckdb',
				database: env('FOX_E2E_DUCKDB_PATH', '/tmp/foxschema-duckdb/demo_a.duckdb'),
				schema: env('FOX_E2E_DUCKDB_SCHEMA', 'main'),
			};
		case 'clickhouse':
			return {
				dialect: 'clickhouse',
				host: env('FOX_E2E_CH_HOST', 'localhost'),
				port: Number(env('FOX_E2E_CH_PORT', '8123')),
				database: env('FOX_E2E_CH_DB', 'demo_a'),
				username: env('FOX_E2E_CH_USER', 'default'),
				password: env('FOX_E2E_CH_PASS', 'foxpass'),
				schema: env('FOX_E2E_CH_SCHEMA', 'demo_a'),
				useSsl: false,
			};
		default: {
			const _exhaustive: never = dialect;
			throw new Error(`Unsupported seed dialect: ${_exhaustive}`);
		}
	}
}

/** Objects from foxSchema docker/init seed SQL for demo_a. */
export const SEED_EXPECTATIONS: Record<SeedDialect, SeedExpectation> = {
	postgres: PG_LIKE_EXPECT,
	cockroachdb: PG_LIKE_EXPECT,
	yugabytedb: PG_LIKE_EXPECT,
	redshift: PG_LIKE_EXPECT,
	mysql: MYSQL_LIKE_EXPECT,
	mariadb: MYSQL_LIKE_EXPECT,
	tidb: { ...TABLE_VIEW_ONLY },
	sqlserver: {
		...PG_LIKE_EXPECT,
		sampleParamNames: ['price', 'qty'],
	},
	azuresql: {
		...PG_LIKE_EXPECT,
		sampleParamNames: ['price', 'qty'],
	},
	oracle: {
		tables: ['CATEGORIES', 'CUSTOMERS', 'PRODUCTS', 'ORDERS', 'ORDER_ITEMS'],
		views: ['V_CUSTOMER_ORDERS', 'V_LOW_STOCK', 'V_ACTIVE_PRODUCTS'],
		functions: ['FN_GET_DISCOUNT', 'FN_ORDER_TOTAL'],
		procedures: ['SP_CONFIRM_ORDER'],
		sampleTable: 'CUSTOMERS',
		sampleColumns: ['ID', 'NAME'],
		sampleRoutine: 'FN_GET_DISCOUNT',
		sampleRoutineType: 'FUNCTION',
		sampleParamNames: ['P_PRICE', 'P_QTY'],
		rowDml: true,
	},
	sqlite: {
		...TABLE_VIEW_ONLY,
		views: ['v_customer_orders', 'v_low_stock'],
	},
	duckdb: { ...TABLE_VIEW_ONLY },
	clickhouse: { ...TABLE_VIEW_ONLY, rowDml: false },
};

export const E2E_DIALECTS: SeedDialect[] = [
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
];
