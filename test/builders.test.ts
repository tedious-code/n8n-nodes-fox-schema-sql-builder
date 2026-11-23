import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
	assertIdent,
	assertSafeWhereGroups,
	normalizeSafeInsertLiteral,
	poolCacheKey,
	qualifyTable,
	quoteAlias,
	quoteIdent,
	resolveSchema,
	rewritePlaceholders,
	toConnectionOptions,
} from '../nodes/sqlSafety';
import { setActiveDialect } from '../nodes/dialectContext';
import { assertSupportedDialect } from '../nodes/supportedDialects';
import { buildWhereClause, normalizeUiWhere } from '../nodes/builder/where.builder';
import { buildSelectClause, buildSchemaMap } from '../nodes/builder/select.builder';
import { buildHaving } from '../nodes/builder/having.builder';
import { buildLimit } from '../nodes/builder/limit.builder';
import { buildSqlAndBindings } from '../nodes/executeSQL/ExecuteQuery';
import type { ColumnSchema } from '../nodes/type';

const schema: Record<string, ColumnSchema> = {
	ID: { name: 'ID', type: 'INTEGER', isNumeric: true, isDate: false, isString: false },
	NAME: { name: 'NAME', type: 'VARCHAR', isNumeric: false, isDate: false, isString: true },
};

describe('supportedDialects', () => {
	it('rejects db2 and unknown dialects', () => {
		assert.throws(() => assertSupportedDialect('db2'), /not supported/);
		assert.throws(() => assertSupportedDialect('mongodb'), /not a SQL engine/);
		assert.equal(assertSupportedDialect('postgres'), 'postgres');
		assert.equal(assertSupportedDialect('SQLServer'), 'sqlserver');
		assert.equal(assertSupportedDialect('sqlite'), 'sqlite');
		assert.equal(assertSupportedDialect('clickhouse'), 'clickhouse');
		assert.equal(assertSupportedDialect('cockroachdb'), 'cockroachdb');
	});
});

describe('sqlSafety', () => {
	it('rejects unsafe identifiers', () => {
		assert.throws(() => assertIdent('users;drop'), /Invalid/);
		assert.throws(() => assertIdent('a.b'), /Invalid/);
		assert.throws(() => assertIdent('"x"'), /Invalid/);
	});

	it('quotes identifiers per dialect', () => {
		setActiveDialect('postgres');
		assert.equal(quoteIdent('users'), '"users"');
		assert.equal(qualifyTable('myschema', 'users'), '"myschema"."users"');
		assert.equal(quoteAlias('Total Count'), '"Total Count"');

		setActiveDialect('mysql');
		assert.equal(quoteIdent('users'), '`users`');

		setActiveDialect('tidb');
		assert.equal(quoteIdent('users'), '`users`');

		setActiveDialect('clickhouse');
		assert.equal(quoteIdent('users'), '`users`');

		setActiveDialect('sqlserver');
		assert.equal(quoteIdent('users'), '[users]');

		setActiveDialect('azuresql');
		assert.equal(quoteIdent('users'), '[users]');

		setActiveDialect('oracle');
		assert.equal(quoteIdent('users'), '"USERS"');

		setActiveDialect('sqlite');
		assert.equal(quoteIdent('users'), '"users"');

		setActiveDialect('cockroachdb');
		assert.equal(quoteIdent('users'), '"users"');
	});

	it('rewrites placeholders per dialect', () => {
		assert.equal(rewritePlaceholders('mysql', 'SELECT ? , ?'), 'SELECT ? , ?');
		assert.equal(rewritePlaceholders('tidb', 'SELECT ? , ?'), 'SELECT ? , ?');
		assert.equal(rewritePlaceholders('sqlite', 'SELECT ? , ?'), 'SELECT ? , ?');
		assert.equal(rewritePlaceholders('postgres', 'SELECT ? , ?'), 'SELECT $1 , $2');
		assert.equal(rewritePlaceholders('cockroachdb', 'SELECT ? , ?'), 'SELECT $1 , $2');
		assert.equal(rewritePlaceholders('clickhouse', 'SELECT ? , ?'), 'SELECT $1 , $2');
		assert.equal(rewritePlaceholders('sqlserver', 'SELECT ? , ?'), 'SELECT @p0 , @p1');
		assert.equal(rewritePlaceholders('azuresql', 'SELECT ? , ?'), 'SELECT @p0 , @p1');
		assert.equal(rewritePlaceholders('oracle', 'SELECT ? , ?'), 'SELECT :1 , :2');
		assert.equal(
			rewritePlaceholders('postgres', "SELECT '?' , ?"),
			"SELECT '?' , $1",
		);
		assert.equal(
			rewritePlaceholders('postgres', 'SELECT /* ? */ ? , $$?$$ -- ?\n'),
			'SELECT /* ? */ $1 , $$?$$ -- ?\n',
		);
	});

	it('quotes explicitly by dialect without relying on activeDialect and rejects unsafe aliases', () => {
		setActiveDialect('postgres');
		assert.equal(quoteIdent('users', 'table', 'mysql'), '`users`');
		assert.equal(quoteIdent('users', 'table', 'sqlserver'), '[users]');
		assert.equal(quoteIdent('users', 'table', 'oracle'), '"USERS"');
		assert.equal(quoteAlias('total', 'mysql'), '`total`');
		assert.throws(() => quoteAlias('a /* bad */'), /Invalid alias/);
		assert.throws(() => quoteAlias('a\nb'), /Invalid alias/);
	});

	it('omits password from pool key and resolves schema defaults', () => {
		const creds = {
			dialect: 'postgres',
			host: 'h',
			port: 5432,
			database: 'db',
			username: 'u',
			password: 'secret',
			schema: 'S1',
		};
		assert.equal(poolCacheKey(creds).includes('secret'), false);
		assert.equal(resolveSchema({ dialect: 'postgres', schema: '' }), 'public');
		assert.equal(resolveSchema({ dialect: 'sqlserver', schema: '' }), 'dbo');
		assert.equal(resolveSchema({ dialect: 'azuresql', schema: '' }), 'dbo');
		assert.equal(resolveSchema({ dialect: 'duckdb', schema: '' }), 'main');
		assert.equal(resolveSchema({ dialect: 'mysql', database: 'demo_a', schema: '' }), 'demo_a');
		assert.equal(resolveSchema({ dialect: 'clickhouse', database: 'demo_a', schema: '' }), 'demo_a');
		assert.throws(
			() => toConnectionOptions({ dialect: 'sqlite', database: '' }),
			/file path/,
		);
		assert.equal(
			String(toConnectionOptions({ dialect: 'sqlite', database: '/tmp/app.db' }).database),
			'/tmp/app.db',
		);
	});

	it('only allows safe insert literals', () => {
		assert.equal(normalizeSafeInsertLiteral('CURRENT_TIMESTAMP'), 'CURRENT_TIMESTAMP');
		assert.equal(normalizeSafeInsertLiteral('NOW()'), 'CURRENT_TIMESTAMP');
		assert.equal(normalizeSafeInsertLiteral('UPPER(x)'), null);
	});

	it('gates unsafe where groups', () => {
		assert.throws(
			() =>
				assertSafeWhereGroups(
					[{ filterType: 'AND', conditions: [{ mode: 'expression', sql: '1=1' }] }],
					false,
				),
			/Allow Unsafe SQL/,
		);
		assert.doesNotThrow(() =>
			assertSafeWhereGroups(
				[{ filterType: 'AND', conditions: [{ mode: 'expression', sql: '1=1' }] }],
				true,
			),
		);
	});
});

describe('where.builder', () => {
	it('defaults group filter to AND and binds values', () => {
		setActiveDialect('postgres');
		const groups = normalizeUiWhere({
			groups: [
				{
					filters: {
						fields: [
							{ mode: 'column', field: 'id', operator: 'equal', value: '1' },
							{ mode: 'column', field: 'name', operator: 'contains', value: 'ab' },
						],
					},
				},
			],
		});
		assert.equal(groups[0].filterType, 'AND');
		const built = buildWhereClause(groups, schema);
		assert.equal(built.sql, 'WHERE ("ID" = ? AND "NAME" LIKE ?)');
		assert.deepEqual(built.values, [1, '%ab%']);
	});

	it('builds IN and BETWEEN with cast values', () => {
		setActiveDialect('postgres');
		const built = buildWhereClause(
			[
				{
					filterType: 'AND',
					conditions: [
						{ mode: 'column_in', column: 'ID', values: ['1', '2'] },
						{ mode: 'between', column: 'ID', values: ['1', '10'] },
					],
				},
			],
			schema,
		);
		assert.match(built.sql, /IN \(\?, \?\)/);
		assert.match(built.sql, /BETWEEN \? AND \?/);
		assert.deepEqual(built.values, [1, 2, 1, 10]);
	});

	it('recursively builds nested WHERE groups', () => {
		const built = buildWhereClause(
			[
				{
					filterType: 'AND',
					conditions: [{ mode: 'column', column: 'ID', operator: 'EQUAL', value: '5' }],
					groups: [
						{
							filterType: 'OR',
							conditions: [
								{ mode: 'column', column: 'NAME', operator: 'EQUAL', value: 'a' },
								{ mode: 'column', column: 'NAME', operator: 'EQUAL', value: 'b' },
							],
						},
					],
				},
			],
			schema,
			'postgres',
		);
		assert.equal(built.sql, 'WHERE ("ID" = ? AND ("NAME" = ? OR "NAME" = ?))');
		assert.deepEqual(built.values, [5, 'a', 'b']);
	});
});

describe('having.builder', () => {
	it('uses standard CAST syntax instead of Db2 DECIMAL(col,18,2)', () => {
		const pg = buildHaving(
			{ fields: [{ mode: 'aggregate', fn: 'SUM', field: 'ID', operator: 'GREATER', value: '10' }] },
			schema,
			'postgres',
		);
		assert.equal(pg.sql, 'HAVING SUM(CAST("ID" AS DECIMAL(18, 2))) > ?');
		assert.deepEqual(pg.values, [10]);

		const ch = buildHaving(
			{ fields: [{ mode: 'aggregate', fn: 'AVG', field: 'ID', operator: 'EQUAL', value: '2' }] },
			schema,
			'clickhouse',
		);
		assert.equal(ch.sql, 'HAVING AVG(CAST(`ID` AS Decimal(18, 2))) = ?');
		assert.deepEqual(ch.values, [2]);
	});
});

describe('ExecuteQuery buildSqlAndBindings', () => {
	it('expands IN (?) even with additional ? parameters and ignores ? in comments/strings', () => {
		const res = buildSqlAndBindings(
			"SELECT /* ? */ '?' AS q FROM t WHERE id IN (?) AND status = ?",
			[
				{ type: 'string', value: '__ARRAY__:[1,2,3]' },
				{ type: 'string', value: 'open' },
			],
			false,
			'postgres',
		);
		assert.equal(res.sql, "SELECT /* ? */ '?' AS q FROM t WHERE id IN (?,?,?) AND status = ?");
		assert.deepEqual(res.values, [1, 2, 3, 'open']);
	});

	it('replaces sql-typed parameters only at real placeholders', () => {
		const res = buildSqlAndBindings(
			"SELECT '?' , ?",
			[{ type: 'sql', value: 'CURRENT_TIMESTAMP' }],
			true,
			'postgres',
		);
		assert.equal(res.sql, "SELECT '?' , CURRENT_TIMESTAMP");
		assert.deepEqual(res.values, []);
	});
});

describe('select.builder + limit', () => {
	it('maps schema and builds select clause', () => {
		setActiveDialect('postgres');
		const map = buildSchemaMap([
			{ COLNAME: 'id', TYPENAME: 'INTEGER' },
			{ COLNAME: 'name', TYPENAME: 'VARCHAR' },
		]);
		assert.ok(map.ID?.isNumeric);
		const sql = buildSelectClause(
			[{ mode: 'column', columnSelect: { column: 'name', alias: 'label' } }],
			map,
		);
		assert.equal(sql, '"NAME" AS "label"');
		assert.throws(
			() =>
				buildSelectClause(
					[{ mode: 'aggregate', aggregateSelect: { fn: 'SUM' } }],
					map,
				),
			/requires a column/,
		);
	});

	it('validates limit per dialect', () => {
		assert.equal(buildLimit(10, 'postgres'), 'LIMIT 10');
		assert.equal(buildLimit(10, 'mysql'), 'LIMIT 10');
		assert.equal(buildLimit(10, 'clickhouse'), 'LIMIT 10');
		assert.equal(buildLimit(10, 'sqlite'), 'LIMIT 10');
		assert.equal(buildLimit(10, 'oracle'), 'FETCH FIRST 10 ROWS ONLY');
		assert.equal(buildLimit(10, 'sqlserver'), 'OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY');
		assert.equal(buildLimit(10, 'azuresql'), 'OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY');
		assert.throws(() => buildLimit(0), /positive/);
		assert.throws(() => buildLimit(100001), /100000/);
	});
});
