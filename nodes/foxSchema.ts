/**
 * Loads the bundled FoxSchema (@foxschema/db + @foxschema/sql) CJS build
 * produced by scripts/bundle-foxschema.mjs.
 * Relative import only — n8n Cloud forbids fs / process / __dirname in community nodes.
 */
export {
	ConnectionFactory,
	getAdapter,
	getRegisteredProvider,
	openDatabase,
	queryOnce,
	assertSafeIdentifier,
	DEFAULT_PORTS,
	PROVIDER_SETTINGS,
	getProviderSettings,
	dialectFamily,
	isFileDialect,
	placeholderStyleFor,
	renderPlaceholder,
	quoteSqlIdentifier,
	quoteQualifiedName,
	sqlLiteral,
	sqlReadingsFor,
	sqlTokens,
} from './vendor/foxschema-core.cjs';

export type {
	FoxColumnInfo,
	FoxRoutineParameter,
	FoxTableSchema,
	OpenDatabase,
	SqlPlaceholderStyle,
	SqlToken,
	SqlTokenOptions,
} from './vendor/foxschema-core.cjs';
