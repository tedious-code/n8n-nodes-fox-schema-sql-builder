import type { ICredentialDataDecryptedObject } from 'n8n-workflow';
import type { SupportedDialect } from '../../nodes/supportedDialects';

/**
 * Credentials matching foxSchema docker-compose + scripts/seed/seed-all.sh
 * (demo_a source schema). Override via FOX_E2E_* env vars when needed.
 */
export type SeedDialect = Exclude<SupportedDialect, never>;

export interface SeedExpectation {
	tables: string[];
	views: string[];
	functions: string[];
	procedures: string[];
	/** Table used for column + SELECT smoke tests */
	sampleTable: string;
	/** Expected column names (case-insensitive) on sampleTable */
	sampleColumns: string[];
	/** Procedure/function used for parameter assertions */
	sampleRoutine: string;
	sampleRoutineType: 'PROCEDURE' | 'FUNCTION';
	/** Expected parameter name fragments (case-insensitive) */
	sampleParamNames: string[];
}

const env = (key: string, fallback: string) => process.env[key] ?? fallback;

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
		default: {
			const _exhaustive: never = dialect;
			throw new Error(`Unsupported seed dialect: ${_exhaustive}`);
		}
	}
}

/** Objects from foxSchema docker/init seed SQL for demo_a. */
export const SEED_EXPECTATIONS: Record<SeedDialect, SeedExpectation> = {
	postgres: {
		tables: ['categories', 'customers', 'products', 'orders', 'order_items'],
		views: ['v_customer_orders', 'v_low_stock', 'v_active_products'],
		functions: ['fn_get_discount', 'fn_order_total'],
		procedures: ['sp_confirm_order'],
		sampleTable: 'customers',
		sampleColumns: ['id', 'name'],
		sampleRoutine: 'fn_get_discount',
		sampleRoutineType: 'FUNCTION',
		sampleParamNames: ['p_price', 'p_qty'],
	},
	mysql: {
		tables: ['categories', 'customers', 'products', 'orders', 'order_items'],
		views: ['v_customer_orders', 'v_low_stock', 'v_active_products'],
		functions: ['fn_get_discount', 'fn_order_total'],
		procedures: ['sp_confirm_order'],
		sampleTable: 'customers',
		sampleColumns: ['id', 'name'],
		sampleRoutine: 'fn_get_discount',
		sampleRoutineType: 'FUNCTION',
		sampleParamNames: ['p_price', 'p_qty'],
	},
	mariadb: {
		tables: ['categories', 'customers', 'products', 'orders', 'order_items'],
		views: ['v_customer_orders', 'v_low_stock', 'v_active_products'],
		functions: ['fn_get_discount', 'fn_order_total'],
		procedures: ['sp_confirm_order'],
		sampleTable: 'customers',
		sampleColumns: ['id', 'name'],
		sampleRoutine: 'fn_get_discount',
		sampleRoutineType: 'FUNCTION',
		sampleParamNames: ['p_price', 'p_qty'],
	},
	sqlserver: {
		tables: ['categories', 'customers', 'products', 'orders', 'order_items'],
		views: ['v_customer_orders', 'v_low_stock', 'v_active_products'],
		functions: ['fn_get_discount', 'fn_order_total'],
		procedures: ['sp_confirm_order'],
		sampleTable: 'customers',
		sampleColumns: ['id', 'name'],
		sampleRoutine: 'fn_get_discount',
		sampleRoutineType: 'FUNCTION',
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
	},
};

export const E2E_DIALECTS: SeedDialect[] = [
	'postgres',
	'mysql',
	'mariadb',
	'sqlserver',
	'oracle',
];
