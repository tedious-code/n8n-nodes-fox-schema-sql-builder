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
} from '../nodes/sqlSafety';
import { setActiveDialect } from '../nodes/dialectContext';
import { assertSupportedDialect } from '../nodes/supportedDialects';
import { buildWhereClause, normalizeUiWhere } from '../nodes/builder/where.builder';
import { buildSelectClause, buildSchemaMap } from '../nodes/builder/select.builder';
import { buildLimit } from '../nodes/builder/limit.builder';
import type { ColumnSchema } from '../nodes/type';

const schema: Record<string, ColumnSchema> = {
	ID: { name: 'ID', type: 'INTEGER', isNumeric: true, isDate: false, isString: false },
	NAME: { name: 'NAME', type: 'VARCHAR', isNumeric: false, isDate: false, isString: true },
};

describe('supportedDialects', () => {
	it('rejects db2 and unknown dialects', () => {
		assert.throws(() => assertSupportedDialect('db2'), /not supported/);
		assert.throws(() => assertSupportedDialect('sqlite'), /not supported/);
		assert.equal(assertSupportedDialect('postgres'), 'postgres');
		assert.equal(assertSupportedDialect('SQLServer'), 'sqlserver');
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

		setActiveDialect('sqlserver');
		assert.equal(quoteIdent('users'), '[users]');

		setActiveDialect('oracle');
		assert.equal(quoteIdent('users'), '"USERS"');
	});

	it('rewrites placeholders per dialect', () => {
		assert.equal(rewritePlaceholders('mysql', 'SELECT ? , ?'), 'SELECT ? , ?');
		assert.equal(rewritePlaceholders('postgres', 'SELECT ? , ?'), 'SELECT $1 , $2');
		assert.equal(rewritePlaceholders('sqlserver', 'SELECT ? , ?'), 'SELECT @p0 , @p1');
		assert.equal(rewritePlaceholders('oracle', 'SELECT ? , ?'), 'SELECT :1 , :2');
		assert.equal(
			rewritePlaceholders('postgres', "SELECT '?' , ?"),
			"SELECT '?' , $1",
		);
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
	});

	it('validates limit per dialect', () => {
		assert.equal(buildLimit(10, 'postgres'), 'LIMIT 10');
		assert.equal(buildLimit(10, 'mysql'), 'LIMIT 10');
		assert.equal(buildLimit(10, 'oracle'), 'FETCH FIRST 10 ROWS ONLY');
		assert.equal(buildLimit(10, 'sqlserver'), 'OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY');
		assert.throws(() => buildLimit(0), /positive/);
		assert.throws(() => buildLimit(100001), /100000/);
	});
});
