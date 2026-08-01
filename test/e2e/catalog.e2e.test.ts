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

			it('exposes IN/OUT parameters on sample routine', { skip: !ready }, async () => {
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

			it('runs bound INSERT/SELECT/DELETE smoke on seed table', { skip: !ready }, async () => {
				const objects = await loadObjectSchemas(creds);
				const table = objects.find(
					o =>
						o.objectType === 'TABLE' &&
						o.name.toUpperCase() === expect.sampleTable.toUpperCase(),
				);
				assert.ok(table);

				const email = `e2e_${dialect}_${Date.now()}@example.com`;
				const name = `e2e-${dialect}`;

				if (dialect === 'postgres') {
					const inserted = await queryAsync(
						creds,
						`INSERT INTO "demo_a"."customers" ("name", "email") VALUES (?, ?) RETURNING "id", "email"`,
						[name, email],
					);
					assert.equal(inserted.length, 1);
					assert.equal(String(inserted[0].email), email);
					const id = inserted[0].id;
					const selected = await queryAsync(
						creds,
						`SELECT "id", "email" FROM "demo_a"."customers" WHERE "id" = ?`,
						[id],
					);
					assert.equal(selected.length, 1);
					await queryAsync(creds, `DELETE FROM "demo_a"."customers" WHERE "id" = ?`, [id]);
					return;
				}

				if (dialect === 'mysql' || dialect === 'mariadb') {
					await queryAsync(
						creds,
						`INSERT INTO \`customers\` (\`name\`, \`email\`) VALUES (?, ?)`,
						[name, email],
					);
					const selected = await queryAsync(
						creds,
						`SELECT \`id\`, \`email\` FROM \`customers\` WHERE \`email\` = ? LIMIT 5`,
						[email],
					);
					assert.ok(selected.length >= 1);
					await queryAsync(creds, `DELETE FROM \`customers\` WHERE \`email\` = ?`, [email]);
					return;
				}

				if (dialect === 'sqlserver') {
					await queryAsync(
						creds,
						`INSERT INTO [demo_a].[customers] ([name], [email]) VALUES (?, ?)`,
						[name, email],
					);
					const selected = await queryAsync(
						creds,
						`SELECT TOP 5 [id], [email] FROM [demo_a].[customers] WHERE [email] = ?`,
						[email],
					);
					assert.ok(selected.length >= 1);
					const id = selected[0].id ?? selected[0].ID;
					await queryAsync(creds, `DELETE FROM [demo_a].[customers] WHERE [id] = ?`, [id]);
					return;
				}

				if (dialect === 'oracle') {
					await queryAsync(
						creds,
						`INSERT INTO "CUSTOMERS" ("NAME", "EMAIL") VALUES (?, ?)`,
						[name, email],
					);
					const selected = await queryAsync(
						creds,
						`SELECT "ID", "EMAIL" FROM "CUSTOMERS" WHERE "EMAIL" = ? FETCH FIRST 5 ROWS ONLY`,
						[email],
					);
					assert.ok(selected.length >= 1);
					await queryAsync(creds, `DELETE FROM "CUSTOMERS" WHERE "EMAIL" = ?`, [email]);
				}
			});
			it('calls seed function and procedure', { skip: !ready }, async () => {
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
				let customerId: unknown;
				let orderId: unknown;

				if (dialect === 'postgres') {
					const customers = await queryAsync(
						creds,
						`INSERT INTO "demo_a"."customers" ("name", "email") VALUES (?, ?) RETURNING "id"`,
						[`e2e-proc-${dialect}`, email],
					);
					customerId = customers[0].id;
					const inserted = await queryAsync(
						creds,
						`INSERT INTO "demo_a"."orders" ("customer_id", "total", "status") VALUES (?, ?, ?) RETURNING "id"`,
						[customerId, 1.0, 'pending'],
					);
					orderId = inserted[0].id;
				} else if (dialect === 'mysql' || dialect === 'mariadb') {
					await queryAsync(
						creds,
						`INSERT INTO \`customers\` (\`name\`, \`email\`) VALUES (?, ?)`,
						[`e2e-proc-${dialect}`, email],
					);
					const customers = await queryAsync(
						creds,
						`SELECT \`id\` FROM \`customers\` WHERE \`email\` = ? LIMIT 1`,
						[email],
					);
					customerId = customers[0].id;
					await queryAsync(
						creds,
						`INSERT INTO \`orders\` (\`customer_id\`, \`total\`, \`status\`) VALUES (?, ?, ?)`,
						[customerId, 1.0, 'pending'],
					);
					const ids = await queryAsync(
						creds,
						`SELECT \`id\` FROM \`orders\` WHERE \`customer_id\` = ? AND \`status\` = ? ORDER BY \`id\` DESC LIMIT 1`,
						[customerId, 'pending'],
					);
					orderId = ids[0].id;
				} else if (dialect === 'sqlserver') {
					await queryAsync(
						creds,
						`INSERT INTO [demo_a].[customers] ([name], [email]) VALUES (?, ?)`,
						[`e2e-proc-${dialect}`, email],
					);
					const customers = await queryAsync(
						creds,
						`SELECT TOP 1 [id] FROM [demo_a].[customers] WHERE [email] = ?`,
						[email],
					);
					customerId = customers[0].id ?? customers[0].ID;
					await queryAsync(
						creds,
						`INSERT INTO [demo_a].[orders] ([customer_id], [total], [status]) VALUES (?, ?, ?)`,
						[customerId, 1.0, 'pending'],
					);
					const inserted = await queryAsync(
						creds,
						`SELECT TOP 1 [id] FROM [demo_a].[orders] WHERE [customer_id] = ? AND [status] = ? ORDER BY [id] DESC`,
						[customerId, 'pending'],
					);
					orderId = inserted[0].id ?? inserted[0].ID;
				} else {
					await queryAsync(
						creds,
						`INSERT INTO "CUSTOMERS" ("NAME", "EMAIL") VALUES (?, ?)`,
						[`e2e-proc-${dialect}`, email],
					);
					const customers = await queryAsync(
						creds,
						`SELECT "ID" FROM "CUSTOMERS" WHERE "EMAIL" = ? FETCH FIRST 1 ROWS ONLY`,
						[email],
					);
					customerId = customers[0].ID ?? customers[0].id;
					await queryAsync(
						creds,
						`INSERT INTO "ORDERS" ("CUSTOMER_ID", "TOTAL", "STATUS") VALUES (?, ?, ?)`,
						[customerId, 1.0, 'pending'],
					);
					const ids = await queryAsync(
						creds,
						`SELECT "ID" FROM "ORDERS" WHERE "CUSTOMER_ID" = ? AND "STATUS" = ? ORDER BY "ID" DESC FETCH FIRST 1 ROWS ONLY`,
						[customerId, 'pending'],
					);
					orderId = ids[0].ID ?? ids[0].id;
				}

				const orderParam =
					(proc.parameters ?? []).find(p => /order/i.test(p.name))?.name ??
					'p_order_id';
				const procCall = buildRoutineCallSql(
					dialect,
					String(creds.schema ?? ''),
					proc,
					{ [orderParam]: orderId },
				);
				await queryAsync(creds, procCall.sql, procCall.params);

				let statusRows: Array<Record<string, unknown>>;
				if (dialect === 'postgres') {
					statusRows = await queryAsync(
						creds,
						`SELECT "status" FROM "demo_a"."orders" WHERE "id" = ?`,
						[orderId],
					);
					assert.equal(String(statusRows[0].status), 'confirmed');
					await queryAsync(creds, `DELETE FROM "demo_a"."orders" WHERE "id" = ?`, [
						orderId,
					]);
					await queryAsync(creds, `DELETE FROM "demo_a"."customers" WHERE "id" = ?`, [
						customerId,
					]);
				} else if (dialect === 'mysql' || dialect === 'mariadb') {
					statusRows = await queryAsync(
						creds,
						`SELECT \`status\` FROM \`orders\` WHERE \`id\` = ?`,
						[orderId],
					);
					assert.equal(String(statusRows[0].status), 'confirmed');
					await queryAsync(creds, `DELETE FROM \`orders\` WHERE \`id\` = ?`, [orderId]);
					await queryAsync(creds, `DELETE FROM \`customers\` WHERE \`id\` = ?`, [
						customerId,
					]);
				} else if (dialect === 'sqlserver') {
					statusRows = await queryAsync(
						creds,
						`SELECT [status] FROM [demo_a].[orders] WHERE [id] = ?`,
						[orderId],
					);
					assert.equal(
						String(statusRows[0].status ?? statusRows[0].STATUS),
						'confirmed',
					);
					await queryAsync(creds, `DELETE FROM [demo_a].[orders] WHERE [id] = ?`, [
						orderId,
					]);
					await queryAsync(creds, `DELETE FROM [demo_a].[customers] WHERE [id] = ?`, [
						customerId,
					]);
				} else {
					statusRows = await queryAsync(
						creds,
						`SELECT "STATUS" FROM "ORDERS" WHERE "ID" = ?`,
						[orderId],
					);
					assert.equal(
						String(statusRows[0].STATUS ?? statusRows[0].status),
						'confirmed',
					);
					await queryAsync(creds, `DELETE FROM "ORDERS" WHERE "ID" = ?`, [orderId]);
					await queryAsync(creds, `DELETE FROM "CUSTOMERS" WHERE "ID" = ?`, [
						customerId,
					]);
				}
			});
		});
	};
});
