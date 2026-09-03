import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setActiveDialect } from '../nodes/dialectContext';
import {
	buildRoutineCallSql,
	castRoutineValue,
	filterCallParameters,
	findRoutine,
	lookupParamValue,
	normalizeParamKey,
	parseParametersJson,
	resolveRoutineParameterValues,
} from '../nodes/routineCall';
import type { FoxTableSchema } from '../nodes/foxSchema';

const sampleFn: FoxTableSchema = {
	name: 'fn_get_discount',
	objectType: 'FUNCTION',
	columns: [],
	parameters: [
		{ name: 'p_price', type: 'DECIMAL', mode: 'IN', ordinal: 1 },
		{ name: 'p_qty', type: 'INTEGER', mode: 'IN', ordinal: 2 },
		{ name: 'RETURN', type: 'DECIMAL', mode: 'RETURN', ordinal: 0 },
	],
};

const sampleProc: FoxTableSchema = {
	name: 'sp_confirm_order',
	objectType: 'PROCEDURE',
	columns: [],
	parameters: [{ name: 'p_order_id', type: 'INTEGER', mode: 'IN', ordinal: 1 }],
};

const mssqlFn: FoxTableSchema = {
	name: 'fn_get_discount',
	objectType: 'FUNCTION',
	columns: [],
	parameters: [
		{ name: '@price', type: 'DECIMAL', mode: 'IN', ordinal: 1 },
		{ name: '@qty', type: 'INT', mode: 'IN', ordinal: 2 },
	],
};

describe('routineCall', () => {
	it('filters RETURN/RESULT from call args', () => {
		const params = filterCallParameters(sampleFn.parameters, 'FUNCTION');
		assert.equal(params.length, 2);
		assert.deepEqual(
			params.map(p => p.name),
			['p_price', 'p_qty'],
		);
	});

	it('omits Oracle-style unnamed OUT return slot for functions', () => {
		const oracleFn: FoxTableSchema = {
			name: 'FN_GET_DISCOUNT',
			objectType: 'FUNCTION',
			columns: [],
			parameters: [
				{ name: '', type: 'NUMBER', mode: 'OUT', ordinal: 1 },
				{ name: 'P_PRICE', type: 'NUMBER', mode: 'IN', ordinal: 2 },
				{ name: 'P_QTY', type: 'NUMBER', mode: 'IN', ordinal: 3 },
			],
		};
		setActiveDialect('oracle');
		const built = buildRoutineCallSql('oracle', 'DEMO_A', oracleFn, {
			P_PRICE: 100,
			P_QTY: 10,
		});
		assert.equal(
			built.sql,
			'SELECT "DEMO_A"."FN_GET_DISCOUNT"(?, ?) AS "RESULT" FROM DUAL',
		);
		assert.deepEqual(built.params, [100, 10]);
	});

	it('casts numeric and boolean parameter values', () => {
		assert.equal(castRoutineValue('10', sampleFn.parameters![0]), 10);
		assert.equal(
			castRoutineValue('true', { name: 'flag', type: 'BOOLEAN', mode: 'IN' }),
			true,
		);
		assert.equal(
			castRoutineValue('', { name: 'out', type: 'INT', mode: 'OUT' }),
			null,
		);
	});

	it('builds SELECT for functions per dialect', () => {
		setActiveDialect('postgres');
		const pg = buildRoutineCallSql('postgres', 'demo_a', sampleFn, {
			p_price: 100,
			p_qty: 10,
		});
		assert.equal(
			pg.sql,
			'SELECT "demo_a"."fn_get_discount"(?, ?) AS "result"',
		);
		assert.deepEqual(pg.params, [100, 10]);

		setActiveDialect('mysql');
		const my = buildRoutineCallSql('mysql', 'demo_a', sampleFn, {
			p_price: 100,
			p_qty: 10,
		});
		assert.equal(my.sql, 'SELECT `demo_a`.`fn_get_discount`(?, ?) AS `result`');

		setActiveDialect('sqlserver');
		const ms = buildRoutineCallSql('sqlserver', 'demo_a', sampleFn, {
			p_price: 100,
			p_qty: 10,
		});
		assert.equal(
			ms.sql,
			'SELECT [demo_a].[fn_get_discount](?, ?) AS [result]',
		);

		setActiveDialect('oracle');
		const ora = buildRoutineCallSql('oracle', 'DEMO_A', sampleFn, {
			p_price: 100,
			p_qty: 10,
		});
		assert.equal(
			ora.sql,
			'SELECT "DEMO_A"."FN_GET_DISCOUNT"(?, ?) AS "RESULT" FROM DUAL',
		);
	});

	it('builds CALL / EXEC / BEGIN for procedures per dialect', () => {
		setActiveDialect('postgres');
		assert.equal(
			buildRoutineCallSql('postgres', 'demo_a', sampleProc, { p_order_id: 1 }).sql,
			'CALL "demo_a"."sp_confirm_order"(?)',
		);

		setActiveDialect('mysql');
		assert.equal(
			buildRoutineCallSql('mysql', 'demo_a', sampleProc, { p_order_id: 1 }).sql,
			'CALL `demo_a`.`sp_confirm_order`(?)',
		);

		setActiveDialect('sqlserver');
		assert.equal(
			buildRoutineCallSql('sqlserver', 'demo_a', sampleProc, { p_order_id: 1 }).sql,
			'EXEC [demo_a].[sp_confirm_order] ?',
		);

		setActiveDialect('azuresql');
		assert.equal(
			buildRoutineCallSql('azuresql', 'demo_a', sampleProc, { p_order_id: 1 }).sql,
			'EXEC [demo_a].[sp_confirm_order] ?',
		);

		setActiveDialect('oracle');
		assert.equal(
			buildRoutineCallSql('oracle', 'DEMO_A', sampleProc, { p_order_id: 1 }).sql,
			'BEGIN "DEMO_A"."SP_CONFIRM_ORDER"(?); END;',
		);
	});

	it('finds routines case-insensitively and by type', () => {
		const objects = [sampleFn, sampleProc];
		assert.equal(findRoutine(objects, 'FN_GET_DISCOUNT', 'FUNCTION').name, 'fn_get_discount');
		assert.throws(
			() => findRoutine(objects, 'fn_get_discount', 'PROCEDURE'),
			/not found/,
		);
	});

	it('normalizes and looks up @-prefixed / case-insensitive keys', () => {
		assert.equal(normalizeParamKey('@Price'), 'PRICE');
		const found = lookupParamValue({ price: 9, other: 1 }, '@PRICE');
		assert.equal(found.found, true);
		assert.equal(found.value, 9);
	});

	it('resolves Form mode and requires all IN params', () => {
		const values = resolveRoutineParameterValues({
			mode: 'form',
			routine: sampleFn,
			formValues: [
				{ name: 'p_price', value: '100' },
				{ name: 'p_qty', value: 10 },
			],
		});
		assert.deepEqual(values, { p_price: '100', p_qty: 10 });
		assert.throws(
			() =>
				resolveRoutineParameterValues({
					mode: 'form',
					routine: sampleFn,
					formValues: [{ name: 'p_price', value: 1 }],
				}),
			/Missing IN\/INOUT/,
		);
	});

	it('resolves From Item with overrides and strict mapping', () => {
		const fromItem = resolveRoutineParameterValues({
			mode: 'fromItem',
			routine: mssqlFn,
			itemJson: { price: 50, qty: 5 },
			strictParamMapping: true,
		});
		assert.equal(fromItem['@price'], 50);
		assert.equal(fromItem['@qty'], 5);

		const withOverride = resolveRoutineParameterValues({
			mode: 'fromItem',
			routine: mssqlFn,
			itemJson: { price: 50 },
			overrides: [{ name: '@qty', value: 99 }],
			strictParamMapping: true,
		});
		assert.equal(withOverride['@qty'], 99);

		assert.throws(
			() =>
				resolveRoutineParameterValues({
					mode: 'fromItem',
					routine: mssqlFn,
					itemJson: { price: 1 },
					strictParamMapping: true,
				}),
			/Missing parameter/,
		);

		const loose = resolveRoutineParameterValues({
			mode: 'fromItem',
			routine: mssqlFn,
			itemJson: { price: 1 },
			strictParamMapping: false,
		});
		assert.equal(loose['@qty'], null);
	});

	it('resolves JSON mode objects and strings', () => {
		assert.deepEqual(parseParametersJson('{"p_price":100,"p_qty":10}'), {
			p_price: 100,
			p_qty: 10,
		});
		const values = resolveRoutineParameterValues({
			mode: 'json',
			routine: sampleFn,
			parametersJson: { P_PRICE: 100, p_qty: 10 },
		});
		assert.equal(values.P_PRICE, 100);
		assert.throws(
			() =>
				resolveRoutineParameterValues({
					mode: 'json',
					routine: sampleFn,
					parametersJson: 'not-json',
				}),
			/Invalid Parameters JSON/,
		);
	});
});
