/**
 * Loads the bundled FoxSchema CJS build produced by scripts/bundle-foxschema.mjs.
 * Relative import only — n8n Cloud forbids fs / process / __dirname in community nodes.
 */
export {
	ConnectionFactory,
	getAdapter,
	getRegisteredProvider,
} from './vendor/foxschema-core.cjs';

export type {
	FoxColumnInfo,
	FoxRoutineParameter,
	FoxTableSchema,
} from './vendor/foxschema-core.cjs';
