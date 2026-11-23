import { INodePropertyOptions } from 'n8n-workflow';
import { ColumnSchema, SelectItem } from '../type';
import { quoteIdent, quoteAlias } from '../sqlSafety';
import type { SupportedDialect } from '../supportedDialects';

export function buildSchemaMapFromOptions(
	options: INodePropertyOptions[],
): Record<string, ColumnSchema> {
	const map: Record<string, ColumnSchema> = {};
	for (const opt of options) {
		if (typeof opt.value !== 'string') continue;

		const colName = opt.value.toUpperCase();
		const type = (opt.description || '').toUpperCase();
		if (!type) continue;

		map[colName] = {
			name: colName,
			type,
			isNumeric: ['INTEGER', 'BIGINT', 'SMALLINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE'].includes(type),
			isDate: ['DATE', 'TIMESTAMP', 'TIME'].includes(type),
			isString: ['CHAR', 'VARCHAR', 'CLOB'].includes(type),
		};
	}

	return map;
}

export function assertColumn(
	column: string,
	schema: Record<string, ColumnSchema>,
	dialect?: SupportedDialect,
) {
	if (column === '*') {
		return '*';
	}
	const col = schema[column] ?? schema[column.toUpperCase()];
	if (!col) {
		throw new Error(`Unknown column "${column}"`);
	}
	return quoteIdent(col.name, 'column', dialect);
}

export function buildSelectExpr(
	item: SelectItem,
	schema: Record<string, ColumnSchema>,
	dialect?: SupportedDialect,
): string {
	switch (item.mode) {
		case 'column': {
			const { column, alias } = item.columnSelect!;
			const col = assertColumn(column, schema, dialect);
			return alias ? `${col} AS ${quoteAlias(alias, dialect)}` : col;
		}

		case 'aggregate': {
			const { fn, field, distinct, alias } = item.aggregateSelect!;

			let expr: string;

			if (fn === 'COUNT') {
				expr = field
					? `${distinct ? 'DISTINCT ' : ''}${assertColumn(field, schema, dialect)}`
					: '*';
			} else {
				if (!field) {
					throw new Error(`${fn} aggregate requires a column`);
				}
				const key = field.toUpperCase();
				const col = schema[key] ?? schema[field];
				if (!col) {
					throw new Error(`Unknown aggregate column "${field}"`);
				}
				if (['SUM', 'AVG'].includes(fn) && !col.isNumeric) {
					throw new Error(`Cannot ${fn} on non-numeric column "${field}"`);
				}
				const decimalType = dialect === 'clickhouse' ? 'Decimal(18, 2)' : 'DECIMAL(18, 2)';
				expr =
					fn === 'SUM' || fn === 'AVG'
						? `CAST(${quoteIdent(col.name, 'column', dialect)} AS ${decimalType})`
						: quoteIdent(col.name, 'column', dialect);
			}

			const finalAlias =
				alias?.trim() || `${fn.toLowerCase()}_${field ?? 'all'}`;

			return `${fn}(${expr}) AS ${quoteAlias(finalAlias, dialect)}`;
		}

		case 'custom': {
			const { expression, alias } = item.customSql!;
			if (!expression?.trim()) {
				throw new Error('Custom SQL expression is required');
			}
			return alias
				? `${expression} AS ${quoteAlias(alias, dialect)}`
				: expression;
		}

		default:
			throw new Error('Unsupported select mode');
	}
}

export function buildSelectClause(
	selectItems: SelectItem[],
	schema: Record<string, ColumnSchema>,
	dialect?: SupportedDialect,
): string {
	const items = selectItems.length
		? selectItems
		: [{ mode: 'column' as const, columnSelect: { column: '*' } }];

	return items.map(item => buildSelectExpr(item, schema, dialect)).join(', ');
}

export function buildSchemaMap(rows: any[]): Record<string, ColumnSchema> {
	const map: Record<string, ColumnSchema> = {};

	for (const r of rows) {
		const colName = String(r.COLNAME).toUpperCase();
		if (colName === '*') {
			map[colName] = {
				name: colName,
				type: null,
				isNumeric: null,
				isDate: null,
				isString: null,
			};
			continue;
		}

		const type = String(r.TYPENAME).toUpperCase();
		map[colName] = {
			name: colName,
			type,
			isNumeric: ['INTEGER', 'BIGINT', 'SMALLINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE'].includes(type),
			isDate: ['DATE', 'TIMESTAMP', 'TIME'].includes(type),
			isString: ['CHAR', 'VARCHAR', 'CLOB'].includes(type),
		};
	}
	return map;
}
