import {
	type IDataObject,
	type ICredentialDataDecryptedObject,
	type INodeExecutionData,
	type IExecuteFunctions,
	NodeOperationError,
} from 'n8n-workflow';
import { ColumnSchema, SelectItem, WhereGroup } from './type';
import {
	buildGroupBy,
	buildHaving,
	buildLimit,
	buildOrderBy,
	buildSchemaMap,
	buildSelectClause,
	buildWhereClause,
	normalizeUiWhere,
} from './builder';
import {
	assertIdent,
	assertSafeSqlFragment,
	assertSafeWhereGroups,
	normalizeSafeInsertLiteral,
	qualifyTable,
	quoteIdent,
	resolveDialect,
	resolveSchema,
	rewritePlaceholders,
	toConnectionOptions,
} from './sqlSafety';
import { setActiveDialect } from './dialectContext';
import { assertSupportedDialect, type SupportedDialect } from './supportedDialects';
import {
	ConnectionFactory,
	getAdapter,
	getRegisteredProvider,
	type FoxTableSchema,
} from './foxSchema';
import {
	buildRoutineCallSql,
	findRoutine,
	resolveRoutineName,
	resolveRoutineParameterValues,
	type RoutineParameterMode,
} from './routineCall';

function activateFromCredentials(credentials: ICredentialDataDecryptedObject): SupportedDialect {
	const dialect = resolveDialect(credentials);
	assertSupportedDialect(dialect);
	setActiveDialect(dialect);
	return dialect;
}

export async function createPool(credentials: ICredentialDataDecryptedObject) {
	const dialect = activateFromCredentials(credentials);
	const options = toConnectionOptions(credentials);
	const connection = await ConnectionFactory.create(dialect, options);
	const adapter = getAdapter(dialect);
	let inTransaction = false;

	return {
		nativeConn: connection,
		closeAsync: async () => {
			await ConnectionFactory.close(dialect, connection);
		},
		queryAsync: async (sql: string, params: any[] = []) => {
			const rows = (await adapter.query(
				connection,
				rewritePlaceholders(dialect, sql),
				params,
			)) as IDataObject[];
			// oracledb defaults to autoCommit=false; commit each statement unless
			// the caller opened an explicit transaction.
			if (dialect === 'oracle' && !inTransaction) {
				await adapter.commitTransaction(connection);
			}
			return rows;
		},
		beginTransaction: async () => {
			inTransaction = true;
			await adapter.beginTransaction(connection);
		},
		commitTransaction: async () => {
			await adapter.commitTransaction(connection);
			inTransaction = false;
		},
		rollbackTransaction: async () => {
			try {
				await adapter.rollbackTransaction(connection);
			} finally {
				inTransaction = false;
			}
		},
	};
}

export async function closeAllPools(): Promise<void> {
	await ConnectionFactory.closeAll();
}

export async function testConnection(
	credentials: ICredentialDataDecryptedObject,
): Promise<void> {
	const dialect = activateFromCredentials(credentials);
	const provider = getRegisteredProvider(dialect);
	await provider.testConnection(toConnectionOptions(credentials));
}

export async function loadObjectSchemas(
	credentials: ICredentialDataDecryptedObject,
): Promise<FoxTableSchema[]> {
	const dialect = activateFromCredentials(credentials);
	const provider = getRegisteredProvider(dialect);
	const schema = resolveSchema(credentials);
	if (!provider.getTables) {
		throw new Error(`Provider "${dialect}" does not support getTables()`);
	}
	return provider.getTables(toConnectionOptions(credentials), schema);
}

function columnSchemaFromObject(obj: FoxTableSchema): Record<string, ColumnSchema> {
	const map: Record<string, ColumnSchema> = {};
	for (const col of obj.columns ?? []) {
		const type = String(col.type ?? '').toUpperCase();
		const entry: ColumnSchema = {
			name: col.name,
			type,
			isNumeric: /INT|DECIMAL|NUMERIC|FLOAT|DOUBLE|REAL|NUMBER|MONEY|SERIAL/.test(type),
			isDate: /DATE|TIME|TIMESTAMP/.test(type),
			isString: /CHAR|TEXT|CLOB|XML|JSON|UUID|STRING/.test(type),
		};
		map[col.name] = entry;
		map[col.name.toUpperCase()] = entry;
	}
	return map;
}

async function loadTableSchema(
	credential: ICredentialDataDecryptedObject,
	table: string,
): Promise<Record<string, ColumnSchema>> {
	const objects = await loadObjectSchemas(credential);
	const tableName = assertIdent(table, 'table');
	const obj = objects.find(
		o =>
			(o.objectType === 'TABLE' || o.objectType === 'VIEW' || o.objectType === 'MQT') &&
			o.name.toUpperCase() === tableName.toUpperCase(),
	);
	if (!obj) {
		const schemaName = resolveSchema(credential);
		throw new Error(`Table/view "${schemaName}"."${tableName}" not found`);
	}
	const map = columnSchemaFromObject(obj);
	if (!Object.keys(map).length) {
		throw new Error(`No columns found for "${tableName}"`);
	}
	return map;
}

function getAllowUnsafeSql(ctx: IExecuteFunctions): boolean {
	return ctx.getNodeParameter('allowUnsafeSql', 0, false) as boolean;
}

function buildInsertSql(
	dialect: SupportedDialect,
	qualifiedTable: string,
	columnSql: string,
	valuesSql: string,
): string {
	switch (dialect) {
		case 'postgres':
			return `INSERT INTO ${qualifiedTable} (${columnSql}) VALUES ${valuesSql} RETURNING *`;
		// SQL Server OUTPUT INSERTED.* fails on tables with triggers (error 334).
		case 'sqlserver':
		case 'mysql':
		case 'mariadb':
		case 'oracle':
		default:
			return `INSERT INTO ${qualifiedTable} (${columnSql}) VALUES ${valuesSql}`;
	}
}

export async function createItems(
	ctx: IExecuteFunctions,
	credential: ICredentialDataDecryptedObject,
	table: string,
): Promise<INodeExecutionData[]> {
	const dialect = activateFromCredentials(credential);
	const rows = ctx.getNodeParameter('columnUI', 0, {}) as any;
	const allowUnsafeSql = getAllowUnsafeSql(ctx);

	if (!rows.items?.length) {
		throw new NodeOperationError(ctx.getNode(), 'No insert rows provided');
	}

	let schema: Record<string, ColumnSchema>;
	try {
		schema = await loadTableSchema(credential, table);
	} catch (e) {
		throw new NodeOperationError(ctx.getNode(), (e as Error).message);
	}

	const qualifiedTable = qualifyTable(resolveSchema(credential), table);
	const columnOrder: string[] = [];
	const valueRows: any[][] = [];

	try {
		for (const row of rows.items) {
			const fields = row.columns?.fields ?? [];
			if (!fields.length) continue;

			const currentRow: Record<string, any> = {};

			for (const col of fields) {
				if (col.mode !== 'column') {
					throw new NodeOperationError(
						ctx.getNode(),
						'Custom SQL fields are not supported for inserts',
					);
				}
				const colName = col.columnId;
				if (!colName) {
					throw new NodeOperationError(ctx.getNode(), 'Column name missing');
				}

				const columnIds = String(colName)
					.split(',')
					.map((c: string) => c.trim())
					.filter(Boolean);

				const values =
					col.columnValue !== undefined && col.columnValue !== null
						? String(col.columnValue)
								.split(',')
								.map((v: string) => v.trim())
						: [];

				if (values.length && values.length !== columnIds.length) {
					throw new NodeOperationError(
						ctx.getNode(),
						`Column/value count mismatch: [${columnIds.join(',')}] vs [${values.join(',')}]`,
					);
				}

				for (let i = 0; i < columnIds.length; i++) {
					const colId = assertIdent(columnIds[i], 'column');
					const schemaInfo = schema[colId] ?? schema[colId.toUpperCase()];
					if (!schemaInfo) {
						throw new NodeOperationError(ctx.getNode(), `Unknown column "${colId}"`);
					}
					const raw = values[i] ?? null;
					currentRow[schemaInfo.name] =
						raw === null ? null : autoCast(raw, schemaInfo);
				}
			}
			if (valueRows.length === 0) {
				columnOrder.push(...Object.keys(currentRow));
			} else if (
				Object.keys(currentRow).length !== columnOrder.length ||
				columnOrder.some(column => !(column in currentRow))
			) {
				throw new NodeOperationError(
					ctx.getNode(),
					'Every insert row must contain the same columns',
				);
			}

			valueRows.push(columnOrder.map(col => currentRow[col] ?? null));
		}

		if (!valueRows.length) {
			return [];
		}

		const { sqlParts, params } = buildValues(valueRows, allowUnsafeSql);
		const columnSql = columnOrder.map(c => quoteIdent(c, 'column')).join(', ');
		const sql = buildInsertSql(dialect, qualifiedTable, columnSql, sqlParts);
		const results = await queryAsync(credential, sql, params);

		if (!results.length) {
			return [{ json: { success: true, inserted: valueRows.length } }];
		}
		return results.map(r => ({ json: r }));
	} catch (e) {
		if (e instanceof NodeOperationError) throw e;
		throw new NodeOperationError(
			ctx.getNode(),
			`Insert failed:\n${(e as Error).message}`,
		);
	}
}

export async function updateItems(
	ctx: IExecuteFunctions,
	credential: ICredentialDataDecryptedObject,
	table: string,
): Promise<INodeExecutionData[]> {
	activateFromCredentials(credential);
	const rows = ctx.getNodeParameter('columnUI', 0, {}) as any;
	const allowUnsafeSql = getAllowUnsafeSql(ctx);

	if (!rows.items?.length) {
		throw new NodeOperationError(ctx.getNode(), 'No update rows provided');
	}

	let schema: Record<string, ColumnSchema>;
	try {
		schema = await loadTableSchema(credential, table);
	} catch (e) {
		throw new NodeOperationError(ctx.getNode(), (e as Error).message);
	}

	const qualifiedTable = qualifyTable(resolveSchema(credential), table);
	const out: INodeExecutionData[] = [];
	let sql = '';

	for (let i = 0; i < rows.items.length; i++) {
		const row = rows.items[i];

		try {
			const colParts: string[] = [];
			const colValues: any[] = [];

			const fields = row.columns?.fields ?? [];
			for (const col of fields) {
				if (col.mode === 'column') {
					if (!col.columnId) {
						throw new NodeOperationError(ctx.getNode(), 'Column name missing');
					}
					if (col.columnId === '*') continue;

					const columnId = assertIdent(col.columnId, 'column');
					const schemaInfo = schema[columnId] ?? schema[columnId.toUpperCase()];
					if (!schemaInfo) {
						throw new NodeOperationError(ctx.getNode(), `Unknown column "${columnId}"`);
					}

					const value =
						col.columnValue === undefined || col.columnValue === null
							? null
							: autoCast(col.columnValue, schemaInfo);

					colParts.push(`${quoteIdent(schemaInfo.name, 'column')} = ?`);
					colValues.push(value);
				} else {
					if (!col.sqlExpression) {
						throw new NodeOperationError(ctx.getNode(), 'SQL expression is empty');
					}
					assertSafeSqlFragment(allowUnsafeSql, col.sqlExpression, 'Custom SQL field');
					colParts.push(col.sqlExpression);
				}
			}

			if (!colParts.length) {
				throw new NodeOperationError(ctx.getNode(), 'No columns to update');
			}

			const additionalConditions = ctx.getNodeParameter('additionalConditions', 0, {}) as any;
			const whereGroups = normalizeUiWhere(additionalConditions);
			assertSafeWhereGroups(whereGroups, allowUnsafeSql);

			if (!whereGroups?.length) {
				throw new NodeOperationError(
					ctx.getNode(),
					'Update operation requires at least one WHERE condition.',
				);
			}

			const { sql: whereSql, values: whereValues } = buildWhereClause(
				whereGroups,
				schema,
			);
			if (!whereSql) {
				throw new NodeOperationError(
					ctx.getNode(),
					'Update operation requires at least one valid WHERE condition.',
				);
			}

			sql = `
				UPDATE ${qualifiedTable}
				SET ${colParts.join(', ')}
				${whereSql}
			`;

			await queryAsync(credential, sql, [...colValues, ...whereValues]);

			out.push({
				json: {
					row: i + 1,
					success: true,
				},
			});
		} catch (e) {
			out.push({
				json: {
					row: i + 1,
					sql,
					success: false,
					error: (e as Error).message,
				},
			});
		}
	}

	return out;
}

export async function deleteItems(
	ctx: IExecuteFunctions,
	credential: ICredentialDataDecryptedObject,
	table: string,
): Promise<INodeExecutionData[]> {
	activateFromCredentials(credential);
	const allowUnsafeSql = getAllowUnsafeSql(ctx);

	let schema: Record<string, ColumnSchema>;
	try {
		schema = await loadTableSchema(credential, table);
	} catch (e) {
		throw new NodeOperationError(ctx.getNode(), (e as Error).message);
	}

	const qualifiedTable = qualifyTable(resolveSchema(credential), table);
	const additionalConditions = ctx.getNodeParameter('additionalConditions', 0, {}) as any;
	const whereGroups: WhereGroup[] = normalizeUiWhere(additionalConditions);
	assertSafeWhereGroups(whereGroups, allowUnsafeSql);

	if (!whereGroups?.length) {
		throw new NodeOperationError(
			ctx.getNode(),
			'Delete operation requires at least one WHERE condition.',
		);
	}
	const { sql: whereSql, values: rawValues } = buildWhereClause(whereGroups, schema);
	if (!whereSql) {
		throw new NodeOperationError(
			ctx.getNode(),
			'Delete operation requires at least one valid WHERE condition.',
		);
	}
	const sql = `
		DELETE FROM ${qualifiedTable}
		${whereSql}
	`;

	try {
		await queryAsync(credential, sql, rawValues);
		return [{ json: { success: true, deleted: true } }];
	} catch (e) {
		throw new NodeOperationError(
			ctx.getNode(),
			`Delete failed:\n${(e as Error).message}`,
			{
				description: JSON.stringify({ sql, params: rawValues }, null, 2),
			},
		);
	}
}

function normalizeSelectUi(rawFields: any[]): SelectItem[] {
	if (!Array.isArray(rawFields) || !rawFields.length) return [];

	return rawFields.map((f): SelectItem => {
		const mode = f.mode ?? 'column';
		const alias = f.alias?.trim() || undefined;

		if (mode === 'aggregate') {
			return {
				mode: 'aggregate',
				aggregateSelect: {
					fn: f.fn ?? 'COUNT',
					field: f.column || undefined,
					distinct: !!f.distinct,
					alias,
				},
			};
		}
		if (mode === 'custom') {
			return {
				mode: 'custom',
				customSql: {
					expression: f.expression ?? '',
					alias,
				},
			};
		}
		return {
			mode: 'column',
			columnSelect: {
				column: f.column || '*',
				alias,
			},
		};
	});
}

export async function getItems(
	ctx: IExecuteFunctions,
	credentials: ICredentialDataDecryptedObject,
	table: string,
): Promise<INodeExecutionData[]> {
	const dialect = activateFromCredentials(credentials);
	const allowUnsafeSql = getAllowUnsafeSql(ctx);
	const selectItems = normalizeSelectUi(
		(ctx.getNodeParameter('select.fields', 0, []) as any[]) ?? [],
	);

	let schema: Record<string, ColumnSchema>;
	try {
		schema = await loadTableSchema(credentials, table);
	} catch (e) {
		throw new NodeOperationError(ctx.getNode(), (e as Error).message);
	}

	const qualifiedTable = qualifyTable(resolveSchema(credentials), table);

	for (const item of selectItems) {
		if (item.mode === 'custom') {
			assertSafeSqlFragment(
				allowUnsafeSql,
				item.customSql?.expression,
				'Custom SELECT expression',
			);
		}
	}

	const selectClause = buildSelectClause(selectItems, schema);

	const additionalConditions = ctx.getNodeParameter('additionalConditions', 0, {}) as any;
	const whereGroups: WhereGroup[] = normalizeUiWhere(additionalConditions);
	assertSafeWhereGroups(whereGroups, allowUnsafeSql);
	const { sql: whereSql, values: whereValues } = buildWhereClause(whereGroups, schema);

	const groupBy =
		(ctx.getNodeParameter('groupBy', 0, {}) as {
			items?: Array<{ mode: string; column?: string; expression?: string }>;
		}) ?? {};
	if (groupBy.items?.some(g => g.mode === 'expression')) {
		for (const g of groupBy.items) {
			if (g.mode === 'expression') {
				assertSafeSqlFragment(allowUnsafeSql, g.expression, 'GROUP BY expression');
			}
		}
	}
	const groupBySql = buildGroupBy(groupBy, schema);

	const havingCondition = (ctx.getNodeParameter('having', 0, {}) as any) ?? null;
	if (havingCondition?.fields?.some((h: any) => h.mode === 'expression')) {
		for (const h of havingCondition.fields) {
			if (h.mode === 'expression') {
				assertSafeSqlFragment(allowUnsafeSql, h.expression, 'HAVING expression');
			}
		}
	}
	const { sql: havingSql, values: havingValues } = buildHaving(havingCondition, schema);

	const orderBy = (ctx.getNodeParameter('orderBy', 0, {}) as any) ?? null;
	if (orderBy?.fields?.some((g: any) => g.mode === 'expression')) {
		for (const g of orderBy.fields) {
			if (g.mode === 'expression') {
				assertSafeSqlFragment(allowUnsafeSql, g.expression, 'ORDER BY expression');
			}
		}
	}
	let orderBySQL = buildOrderBy(orderBy, schema);
	const rowLimit = ctx.getNodeParameter('rowLimit', 0, 1000) as number;
	const limitSql = buildLimit(rowLimit, dialect);

	// SQL Server OFFSET/FETCH requires ORDER BY
	if (dialect === 'sqlserver' && limitSql && !orderBySQL.trim()) {
		orderBySQL = 'ORDER BY (SELECT NULL)';
	}

	const havingClean = havingSql.trim() === 'HAVING' ? '' : havingSql;
	const orderClean = orderBySQL.trim() === 'ORDER BY' ? '' : orderBySQL;

	const sql = `
		SELECT ${selectClause}
		FROM ${qualifiedTable}
		${whereSql}
		${groupBySql}
		${havingClean}
		${orderClean}
		${limitSql}
	`;
	const values = [...whereValues, ...havingValues];
	const rows = await queryAsync(credentials, sql, values);

	return rows.map(
		(row): INodeExecutionData => ({
			json: row,
		}),
	);
}

export function resolveTable(tableId: any): string {
	const raw = tableId?.value ?? tableId;
	return assertIdent(String(raw ?? ''), 'table');
}

function buildValues(rows: any[][], allowUnsafeSql: boolean) {
	const sqlParts: string[] = [];
	const params: any[] = [];

	for (const row of rows) {
		const parts: string[] = [];

		for (const v of row) {
			if (typeof v === 'string') {
				const literal = normalizeSafeInsertLiteral(v);
				if (literal) {
					parts.push(literal);
					continue;
				}
				if (/[A-Za-z_]+\s*\(.*\)/.test(v.trim()) && !allowUnsafeSql) {
					throw new Error(
						`Refusing to inline SQL-like value "${v}". Use a bound value, a safe literal (CURRENT_TIMESTAMP / CURRENT_DATE / CURRENT_TIME), or enable Allow Unsafe SQL.`,
					);
				}
				if (/[A-Za-z_]+\s*\(.*\)/.test(v.trim()) && allowUnsafeSql) {
					parts.push(v.trim());
					continue;
				}
			}
			parts.push('?');
			params.push(v ?? null);
		}

		sqlParts.push(`(${parts.join(', ')})`);
	}

	return { sqlParts: sqlParts.join(', '), params };
}

export function autoCast(value: any, col?: ColumnSchema) {
	if (value === '' || value === undefined) return null;
	if (!col) return value;

	if (typeof value === 'string' && normalizeSafeInsertLiteral(value)) {
		return value.trim();
	}

	if (col.isNumeric) {
		if (isNaN(Number(value))) throw new Error(`Value "${value}" is not numeric`);
		return Number(value);
	}

	if (col.isDate) {
		const d = new Date(value);
		if (isNaN(d.getTime())) throw new Error(`Invalid date: ${value}`);
		return d.toISOString().slice(0, 19).replace('T', ' ');
	}

	if (typeof value === 'string' && value.startsWith('[')) {
		try {
			return JSON.stringify(JSON.parse(value));
		} catch {
			/* keep original */
		}
	}

	return value;
}

export function queryAsync(
	credentials: ICredentialDataDecryptedObject,
	sql: string,
	params: any[] = [],
): Promise<any[]> {
	return (async () => {
		const dialect = activateFromCredentials(credentials);

		// Use a short-lived pool handle so Oracle DML/CALL commits (see createPool).
		if (dialect === 'oracle') {
			const pool = await createPool(credentials);
			try {
				return await pool.queryAsync(sql, params);
			} catch (error) {
				await pool.rollbackTransaction().catch(() => undefined);
				throw error;
			} finally {
				await pool.closeAsync();
			}
		}

		return ConnectionFactory.executeQuery(
			dialect,
			toConnectionOptions(credentials),
			rewritePlaceholders(dialect, sql),
			params,
		);
	})();
}

/**
 * Call a catalog procedure or function with bound IN/INOUT values.
 * Supports Form / From Item / JSON parameter modes (one routine per node).
 * OUT placeholders are sent as null (driver-level OUT capture is not supported yet).
 */
export async function callRoutineItems(
	ctx: IExecuteFunctions,
	credentials: ICredentialDataDecryptedObject,
	expectedType: 'PROCEDURE' | 'FUNCTION',
): Promise<INodeExecutionData[]> {
	const dialect = activateFromCredentials(credentials);
	const items = ctx.getInputData();
	const itemCount = Math.max(items.length, 1);
	const parameterMode = (ctx.getNodeParameter('parameterMode', 0, 'form') as string) as RoutineParameterMode;

	let routineName: string;
	try {
		routineName = resolveRoutineName(ctx.getNodeParameter('routineId', 0));
		assertIdent(routineName, expectedType === 'PROCEDURE' ? 'procedure' : 'function');
	} catch (e) {
		throw new NodeOperationError(ctx.getNode(), (e as Error).message);
	}

	let objects: FoxTableSchema[];
	try {
		objects = await loadObjectSchemas(credentials);
	} catch (e) {
		throw new NodeOperationError(ctx.getNode(), (e as Error).message);
	}

	let routine: FoxTableSchema;
	try {
		routine = findRoutine(objects, routineName, expectedType);
	} catch (e) {
		throw new NodeOperationError(ctx.getNode(), (e as Error).message);
	}

	const schema = resolveSchema(credentials);
	const out: INodeExecutionData[] = [];

	for (let itemIndex = 0; itemIndex < itemCount; itemIndex++) {
		let built: ReturnType<typeof buildRoutineCallSql>;
		try {
			const valueByName = collectRoutineValues(ctx, itemIndex, parameterMode, routine);
			built = buildRoutineCallSql(dialect, schema, routine, valueByName);
		} catch (e) {
			throw new NodeOperationError(ctx.getNode(), (e as Error).message, {
				itemIndex,
			});
		}

		try {
			const rows = await queryAsync(credentials, built.sql, built.params);
			if (rows.length) {
				for (const row of rows) {
					out.push({ json: row, pairedItem: { item: itemIndex } });
				}
			} else {
				out.push({
					json: {
						success: true,
						objectType: built.objectType,
						routine: built.routineName,
						sql: built.sql,
					},
					pairedItem: { item: itemIndex },
				});
			}
		} catch (e) {
			throw new NodeOperationError(
				ctx.getNode(),
				`Call ${expectedType.toLowerCase()} failed:\n${(e as Error).message}`,
				{
					itemIndex,
					description: JSON.stringify(
						{ sql: built.sql, params: built.params },
						null,
						2,
					),
				},
			);
		}
	}

	return out;
}

function collectRoutineValues(
	ctx: IExecuteFunctions,
	itemIndex: number,
	mode: RoutineParameterMode,
	routine: FoxTableSchema,
): Record<string, unknown> {
	const formUi = ctx.getNodeParameter('callParameters', itemIndex, {}) as {
		values?: Array<{ name?: string; value?: unknown }>;
	};
	const mapUi = ctx.getNodeParameter('parameterMap', itemIndex, {}) as {
		values?: Array<{ name?: string; value?: unknown }>;
	};
	const parametersJson = ctx.getNodeParameter('parametersJson', itemIndex, '{}');
	const strictParamMapping = ctx.getNodeParameter(
		'strictParamMapping',
		itemIndex,
		true,
	) as boolean;

	const itemJson =
		(ctx.getInputData()[itemIndex]?.json as Record<string, unknown> | undefined) ??
		{};

	return resolveRoutineParameterValues({
		mode,
		routine,
		formValues: formUi.values,
		overrides: mapUi.values,
		itemJson,
		parametersJson,
		strictParamMapping,
	});
}

/** @deprecated kept for tests that previously asserted ODBC strings */
export function getConnectionString(_c: ICredentialDataDecryptedObject): string {
	return '';
}

// re-export for tests that import buildSchemaMap path via GenericFunctions historically
export { buildSchemaMap };
