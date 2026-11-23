import {
	IExecuteFunctions,
	ICredentialDataDecryptedObject,
	INodeExecutionData,
	NodeOperationError,
} from 'n8n-workflow';
import { createPool } from '../GenericFunctions';
import { sqlReadingsFor, sqlTokens } from '../foxSchema';
import { resolveDialect } from '../sqlSafety';
import type { SupportedDialect } from '../supportedDialects';

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

export type BindingParam = {
	type: 'string' | 'number' | 'boolean' | 'date' | 'null' | 'sql';
	value?: string;
};

type QueryItem = {
	sql: string;
	binding?: {
		parameterValues?: BindingParam[];
	};
};

function isSqlExpression(value: unknown): value is { __sql: string } {
	return typeof value === 'object' && value !== null && '__sql' in value;
}

/* -------------------------------------------------------------------------- */
/*                               Binding helpers                               */
/* -------------------------------------------------------------------------- */
export function buildSqlAndBindings(
	sql: string,
	params: BindingParam[],
	allowUnsafeSql: boolean,
	dialect?: SupportedDialect,
) {
	const converted = params.map(p => convertBinding(p, allowUnsafeSql));
	const reading = sqlReadingsFor(sql, dialect)[0] ?? {};
	const values: any[] = [];
	let finalSql = '';
	let placeholderCount = 0;
	let paramIdx = 0;

	for (const token of sqlTokens(sql, reading)) {
		const raw = sql.slice(token.start, token.end);
		if (token.kind !== 'punct' || raw !== '?') {
			finalSql += raw;
			continue;
		}

		placeholderCount += 1;
		if (paramIdx >= converted.length) {
			paramIdx += 1;
			finalSql += raw;
			continue;
		}

		const val = converted[paramIdx++];
		if (Array.isArray(val)) {
			if (val.some(v => isSqlExpression(v))) {
				throw new Error('SQL Expression is not allowed in IN (?)');
			}
			if (val.length === 0) {
				return { sql, values: [], empty: true as const };
			}
			finalSql += val.map(() => '?').join(',');
			values.push(...val);
			continue;
		}

		if (isSqlExpression(val)) {
			finalSql += val.__sql;
			continue;
		}

		finalSql += '?';
		values.push(val);
	}

	if (placeholderCount !== converted.length) {
		throw new Error(
			[
				'SQL parameter mismatch',
				`Expected placeholders: ${placeholderCount}`,
				`Provided parameters: ${converted.length}`,
				`SQL: ${sql}`,
			].join('\n'),
		);
	}

	return { sql: finalSql, values };
}

function convertBinding(param: BindingParam, allowUnsafeSql: boolean) {
	if (typeof param.value === 'string' && param.value.startsWith('__ARRAY__:')) {
		try {
			return JSON.parse(param.value.replace('__ARRAY__:', ''));
		} catch {
			/* invalid payload handled below */
		}
		throw new Error('Invalid __ARRAY__ parameter payload');
	}

	switch (param.type) {
		case 'number':
			return Number(param.value);
		case 'boolean':
			return param.value === 'true' || param.value === '1';
		case 'date':
			return new Date(param.value as string);
		case 'null':
			return null;
		case 'sql':
			if (!allowUnsafeSql) {
				throw new Error(
					'SQL Expression parameters require "Allow Unsafe SQL" to be enabled.',
				);
			}
			return { __sql: param.value };
		case 'string':
		default:
			return String(param.value ?? '');
	}
}

function normalizeBindingFromUI(
	raw: { parameterValues?: BindingParam[] } | undefined,
	context: Record<string, any>,
): BindingParam[] {
	if (!raw?.parameterValues?.length) return [];

	return raw.parameterValues.map(p => ({
		type: p.type,
		value: typeof p.value === 'string' ? interpolate(p.value, context) : p.value,
	}));
}

/* -------------------------------------------------------------------------- */
/*                              Main Execute Logic                             */
/* -------------------------------------------------------------------------- */
export async function executeQueryAsync(
	ctx: IExecuteFunctions,
	credential: ICredentialDataDecryptedObject,
): Promise<INodeExecutionData[]> {
	const dialect = resolveDialect(credential);
	const queries = ctx.getNodeParameter('queries', 0) as {
		query: QueryItem[];
	};

	const dryRun = ctx.getNodeParameter('dryRun', 0) as boolean;
	const returnMode = ctx.getNodeParameter('returnMode', 0, 'all') as string;
	const returnOutput = ctx.getNodeParameter('returnOutput', 0, 0) as number;
	const stopOnError = ctx.getNodeParameter('stopOnError', 0) as boolean;
	const inTransaction = ctx.getNodeParameter('useTransaction', 0) as boolean;
	const allowUnsafeSql = ctx.getNodeParameter('allowUnsafeSql', 0, false) as boolean;

	if (!queries?.query?.length) {
		throw new NodeOperationError(ctx.getNode(), 'At least one query is required');
	}

	const context: Record<string, any> = {};
	const out: INodeExecutionData[] = [];
	let transactionFailed = false;

	const conn = await createPool(credential);

	try {
		if (inTransaction && !dryRun) {
			await conn.beginTransaction();
		}

		for (let i = 0; i < queries.query.length; i++) {
			const q = queries.query[i];
			const outputName = `output${i}`;

			try {
				const params = normalizeBindingFromUI(q.binding, context);
				const bindingResult = buildSqlAndBindings(q.sql, params, allowUnsafeSql, dialect);
				const { sql, values } = bindingResult;

				if (dryRun) {
					out.push({
						json: {
							[outputName]: {
								sql,
								parameters: values.map((v, idx) => ({
									index: idx + 1,
									value: v,
								})),
								valid: true,
							},
						},
					});
					continue;
				}

				if ('empty' in bindingResult && bindingResult.empty) {
					context[outputName] = [];
					out.push({ json: { [outputName]: [] } });
					continue;
				}

				const result = await conn.queryAsync(sql, values);
				context[outputName] = result;
				out.push({ json: { [outputName]: result } });
			} catch (e) {
				const message = (e as Error).message;
				out.push({
					json: {
						[outputName]: {
							error: message,
						},
						error: message,
						contextSnapshot: { ...context },
					},
				});

				if (inTransaction && !dryRun) {
					await conn.rollbackTransaction();
					transactionFailed = true;
				}

				if (stopOnError) {
					throw new NodeOperationError(ctx.getNode(), message, {
						itemIndex: i,
					});
				}

				// Transaction is dead after rollback — do not continue mutating.
				if (inTransaction && !dryRun) {
					break;
				}
			}
		}

		if (inTransaction && !dryRun && !transactionFailed) {
			await conn.commitTransaction();
		}
	} finally {
		await conn.closeAsync();
	}

	try {
		return applyReturnMode(out, returnMode, returnOutput);
	} catch (e) {
		throw new NodeOperationError(ctx.getNode(), (e as Error).message);
	}
}

function applyReturnMode(
	out: INodeExecutionData[],
	returnMode: string,
	returnOutput: number,
): INodeExecutionData[] {
	if (returnMode === 'last') {
		return out.length ? [out[out.length - 1]] : out;
	}
	if (returnMode === 'specific') {
		const idx = Number(returnOutput) || 0;
		if (idx < 0 || idx >= out.length) {
			throw new Error(`Specific output index ${idx} is out of range (0..${Math.max(out.length - 1, 0)})`);
		}
		return [out[idx]];
	}
	return out;
}

function interpolate(str: string, ctxObj: Record<string, any>) {
	return str.replace(/\$\{([^}]+)\}/g, (_, key) => {
		const value = key.split('.').reduce(
			(acc: any, part: string) => (acc ? acc[part] : undefined),
			ctxObj,
		);
		if (Array.isArray(value)) return '__ARRAY__:' + JSON.stringify(value);

		return value === undefined || value === null ? '' : String(value);
	});
}
