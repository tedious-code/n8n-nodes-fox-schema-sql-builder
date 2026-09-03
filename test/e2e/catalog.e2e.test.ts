/**
 * Live e2e against foxSchema docker seeds (demo_a).
 *
 * Prerequisites:
 *   cd ../foxSchema && docker compose up -d postgres mysql
 *   bash scripts/seed/seed-all.sh postgres   # or: pnpm seed:foxschema
 *   cd ../n8n-nodes-fox-schema-sql-builder && pnpm build && pnpm test:e2e
 *
 * Dialects whose containers are down are skipped automatically.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import {
	closeAllPools,
	loadObjectSchemas,
	queryAsync,
	testConnection,
} from '../../nodes/GenericFunctions';
import { buildRoutineCallSql } from '../../nodes/routineCall';
import { setActiveDialect } from '../../nodes/dialectContext';
import { isSqlServerFamily, supportsInsertReturning } from '../../nodes/supportedDialects';
import { qualifyTable, quoteIdent, resolveSchema } from '../../nodes/sqlSafety';
import {
	E2E_DIALECTS,
	SEED_EXPECTATIONS,
	seedCredentials,
	type SeedDialect,
} from './seedCredentials';

function namesOf(
	objects: Array<{ name: string; objectType: string }>,
	type: string,
): string[] {
	return objects
		.filter(o => o.objectType === type)
		.map(o => o.name);
}

function hasName(names: string[], expected: string): boolean {
	const target = expected.toUpperCase();
	return names.some(n => n.toUpperCase() === target);
}

async function dialectReady(dialect: SeedDialect): Promise<boolean> {
	const force = process.env.FOX_E2E;
	if (force === '0') return false;

	// Quiet probe: avoid foxSchema provider console.error spam for down DBs.
	const creds = seedCredentials(dialect);
	const previousError = console.error;
	console.error = () => undefined;
	try {
		await testConnection(creds);
		return true;
	} catch (error) {
		if (force === '1') {
			throw error;
		}
		console.log(
			`[e2e] skip ${dialect}: ${(error as Error).message.split('\n')[0]}`,
		);
		return false;
	} finally {
		console.error = previousError;
	}
}

describe('e2e: foxSchema seed demo_a', () => {
	after(async () => {
		await closeAllPools().catch(() => undefined);
	});

	for (const dialect of E2E_DIALECTS) {
		describe(dialect, async () => {
			const ready = await dialectReady(dialect);
			const creds = seedCredentials(dialect);
			const expect = SEED_EXPECTATIONS[dialect];

			it('connects with foxSchema seed credentials', { skip: !ready }, async () => {
				await testConnection(creds);
			});

			it('lists tables, views, procedures, and functions', { skip: !ready }, async () => {
				const objects = await loadObjectSchemas(creds);
				const tables = namesOf(objects, 'TABLE');
				const views = namesOf(objects, 'VIEW');
				const functions = namesOf(objects, 'FUNCTION');
				const procedures = namesOf(objects, 'PROCEDURE');

				for (const name of expect.tables) {
					assert.ok(hasName(tables, name), `missing table ${name} in [${tables.join(', ')}]`);
				}
				for (const name of expect.views) {
					assert.ok(hasName(views, name), `missing view ${name} in [${views.join(', ')}]`);
				}
				for (const name of expect.functions) {
					assert.ok(
						hasName(functions, name),
						`missing function ${name} in [${functions.join(', ')}]`,
					);
				}
				for (const name of expect.procedures) {
					assert.ok(
						hasName(procedures, name),
						`missing procedure ${name} in [${procedures.join(', ')}]`,
					);
				}
			});

			it('exposes columns on sample table/view', { skip: !ready }, async () => {
				const objects = await loadObjectSchemas(creds);
				const table = objects.find(
					o =>
						(o.objectType === 'TABLE' || o.objectType === 'VIEW') &&
						o.name.toUpperCase() === expect.sampleTable.toUpperCase(),
				);
				assert.ok(table, `sample table ${expect.sampleTable} not found`);
				const colNames = (table.columns ?? []).map(c => c.name.toUpperCase());
				for (const col of expect.sampleColumns) {
					assert.ok(
						colNames.includes(col.toUpperCase()),
						`missing column ${col} on ${expect.sampleTable}`,
					);
				}
			});

			it('exposes IN/OUT parameters on sample routine', { skip: !ready || !expect.sampleRoutine }, async () => {
				const objects = await loadObjectSchemas(creds);
				const routine = objects.find(
					o =>
						o.objectType === expect.sampleRoutineType &&
						o.name.toUpperCase() === expect.sampleRoutine.toUpperCase(),
				);
				assert.ok(routine, `sample routine ${expect.sampleRoutine} not found`);
				const params = routine.parameters ?? [];
				assert.ok(params.length > 0, 'expected routine parameters');
				const paramNames = params.map(p => p.name.toUpperCase());
				for (const name of expect.sampleParamNames) {
					const target = name.toUpperCase().replace(/^@/, '');
					assert.ok(
						paramNames.some(p => p.replace(/^@/, '') === target || p.includes(target)),
						`missing param ${name} in [${paramNames.join(', ')}]`,
					);
				}
				assert.ok(
					params.every(p => p.mode),
					'every parameter should have a mode (IN/OUT/INOUT/…)',
				);
			});

			it('runs bound INSERT/SELECT/DELETE smoke on seed table', { skip: !ready || !expect.rowDml }, async () => {
				setActiveDialect(dialect);
				const schemaName = resolveSchema(creds);
				const table = qualifyTable(schemaName, expect.sampleTable);
				const colName = quoteIdent('name');
				const colEmail = quoteIdent(dialect === 'oracle' ? 'EMAIL' : 'email');
				const colId = quoteIdent(dialect === 'oracle' ? 'ID' : 'id');

				const email = `e2e_${dialect}_${Date.now()}@example.com`;
				const name = `e2e-${dialect}`;
				const returning = supportsInsertReturning(dialect)
					? ` RETURNING ${colId}, ${colEmail}`
					: '';

				// DuckDB INTEGER PRIMARY KEY is not auto-increment — supply an id.
				const needsExplicitId = dialect === 'duckdb';
				const insertId = needsExplicitId ? Date.now() % 2_000_000_000 : undefined;
				const insertCols = needsExplicitId
					? `${colId}, ${colName}, ${colEmail}`
					: `${colName}, ${colEmail}`;
				const insertPlaceholders = needsExplicitId ? '?, ?, ?' : '?, ?';
				const insertParams = needsExplicitId ? [insertId, name, email] : [name, email];

				await queryAsync(
					creds,
					`INSERT INTO ${table} (${insertCols}) VALUES (${insertPlaceholders})${returning}`,
					insertParams,
				);

				let selected: Array<Record<string, unknown>>;
				if (isSqlServerFamily(dialect)) {
					selected = await queryAsync(
						creds,
						`SELECT TOP 5 ${colId}, ${colEmail} FROM ${table} WHERE ${colEmail} = ?`,
						[email],
					);
				} else if (dialect === 'oracle') {
					selected = await queryAsync(
						creds,
						`SELECT ${colId}, ${colEmail} FROM ${table} WHERE ${colEmail} = ? FETCH FIRST 5 ROWS ONLY`,
						[email],
					);
				} else {
					selected = await queryAsync(
						creds,
						`SELECT ${colId}, ${colEmail} FROM ${table} WHERE ${colEmail} = ? LIMIT 5`,
						[email],
					);
				}
				assert.ok(selected.length >= 1);
				const id = selected[0].id ?? selected[0].ID;
				await queryAsync(creds, `DELETE FROM ${table} WHERE ${colId} = ?`, [id]);
			});
			it('calls seed function and procedure', { skip: !ready || !expect.sampleRoutine }, async () => {
				const objects = await loadObjectSchemas(creds);
				const fn = objects.find(
					o =>
						o.objectType === 'FUNCTION' &&
						o.name.toUpperCase() === expect.sampleRoutine.toUpperCase(),
				);
				assert.ok(fn, `function ${expect.sampleRoutine} not found`);

				const priceParam =
					(fn.parameters ?? []).find(p => /price/i.test(p.name))?.name ??
					expect.sampleParamNames[0];
				const qtyParam =
					(fn.parameters ?? []).find(p => /qty/i.test(p.name))?.name ??
					expect.sampleParamNames[1];

				const fnCall = buildRoutineCallSql(
					dialect,
					String(creds.schema ?? ''),
					fn,
					{ [priceParam]: 100, [qtyParam]: 10 },
				);
				const fnRows = await queryAsync(creds, fnCall.sql, fnCall.params);
				assert.ok(fnRows.length >= 1, 'function should return a row');
				const resultKey = Object.keys(fnRows[0]).find(
					k => k.toLowerCase() === 'result',
				);
				assert.ok(resultKey, `expected result column in ${JSON.stringify(fnRows[0])}`);
				assert.equal(Number(fnRows[0][resultKey]), 10);

				const proc = objects.find(
					o =>
						o.objectType === 'PROCEDURE' &&
						o.name.toUpperCase() === 'SP_CONFIRM_ORDER',
				);
				assert.ok(proc, 'sp_confirm_order not found');

				const email = `e2e_proc_${dialect}_${Date.now()}@example.com`;
				setActiveDialect(dialect);
				const schemaName = resolveSchema(creds);
				const customersTable = qualifyTable(schemaName, expect.sampleTable);
				const ordersTable = qualifyTable(schemaName, dialect === 'oracle' ? 'ORDERS' : 'orders');
				const colName = quoteIdent(dialect === 'oracle' ? 'NAME' : 'name');
				const colEmail = quoteIdent(dialect === 'oracle' ? 'EMAIL' : 'email');
				const colId = quoteIdent(dialect === 'oracle' ? 'ID' : 'id');
				const colCustomerId = quoteIdent(dialect === 'oracle' ? 'CUSTOMER_ID' : 'customer_id');
				const colTotal = quoteIdent(dialect === 'oracle' ? 'TOTAL' : 'total');
				const colStatus = quoteIdent(dialect === 'oracle' ? 'STATUS' : 'status');
				const returningId = supportsInsertReturning(dialect) ? ` RETURNING ${colId}` : '';

				await queryAsync(
					creds,
					`INSERT INTO ${customersTable} (${colName}, ${colEmail}) VALUES (?, ?)${returningId}`,
					[`e2e-proc-${dialect}`, email],
				);
				let customers: Array<Record<string, unknown>>;
				if (isSqlServerFamily(dialect)) {
					customers = await queryAsync(
						creds,
						`SELECT TOP 1 ${colId} FROM ${customersTable} WHERE ${colEmail} = ?`,
						[email],
					);
				} else if (dialect === 'oracle') {
					customers = await queryAsync(
						creds,
						`SELECT ${colId} FROM ${customersTable} WHERE ${colEmail} = ? FETCH FIRST 1 ROWS ONLY`,
						[email],
					);
				} else {
					customers = await queryAsync(
						creds,
						`SELECT ${colId} FROM ${customersTable} WHERE ${colEmail} = ? LIMIT 1`,
						[email],
					);
				}
				const customerId = customers[0].id ?? customers[0].ID;

				await queryAsync(
					creds,
					`INSERT INTO ${ordersTable} (${colCustomerId}, ${colTotal}, ${colStatus}) VALUES (?, ?, ?)${returningId}`,
					[customerId, 1.0, 'pending'],
				);
				let ids: Array<Record<string, unknown>>;
				if (isSqlServerFamily(dialect)) {
					ids = await queryAsync(
						creds,
						`SELECT TOP 1 ${colId} FROM ${ordersTable} WHERE ${colCustomerId} = ? AND ${colStatus} = ? ORDER BY ${colId} DESC`,
						[customerId, 'pending'],
					);
				} else if (dialect === 'oracle') {
					ids = await queryAsync(
						creds,
						`SELECT ${colId} FROM ${ordersTable} WHERE ${colCustomerId} = ? AND ${colStatus} = ? ORDER BY ${colId} DESC FETCH FIRST 1 ROWS ONLY`,
						[customerId, 'pending'],
					);
				} else {
					ids = await queryAsync(
						creds,
						`SELECT ${colId} FROM ${ordersTable} WHERE ${colCustomerId} = ? AND ${colStatus} = ? ORDER BY ${colId} DESC LIMIT 1`,
						[customerId, 'pending'],
					);
				}
				const orderId = ids[0].id ?? ids[0].ID;

				const orderParam =
					(proc.parameters ?? []).find(p => /order/i.test(p.name))?.name ??
					'p_order_id';
				const procCall = buildRoutineCallSql(
					dialect,
					schemaName,
					proc,
					{ [orderParam]: orderId },
				);
				await queryAsync(creds, procCall.sql, procCall.params);

				const statusRows = await queryAsync(
					creds,
					`SELECT ${colStatus} FROM ${ordersTable} WHERE ${colId} = ?`,
					[orderId],
				);
				assert.equal(
					String(statusRows[0].status ?? statusRows[0].STATUS),
					'confirmed',
				);
				await queryAsync(creds, `DELETE FROM ${ordersTable} WHERE ${colId} = ?`, [orderId]);
				await queryAsync(creds, `DELETE FROM ${customersTable} WHERE ${colId} = ?`, [
					customerId,
				]);
			});
		});
	};
});
