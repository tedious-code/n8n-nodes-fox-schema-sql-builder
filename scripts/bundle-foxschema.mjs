#!/usr/bin/env node
/**
 * Bundle @foxschema/db + @foxschema/sql into a slim CJS module for n8n.
 * Drivers stay external so this community package installs without native modules.
 * Db2 (@foxschema/db-db2 / ibm_db), Redis, and MongoDB are excluded.
 */
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
// Emit a .cjs next to the node sources so:
// - compiled output requires('./vendor/foxschema-core.cjs') (relative, scanner-safe)
// - the n8n scanner ignores .cjs (it only lints .js/.ts/.json)
const outDir = path.join(root, 'nodes', 'vendor');
const outfile = path.join(outDir, 'foxschema-core.cjs');
const entry = path.join(root, 'scripts', 'foxschema-bundle-entry.ts');

function resolvePackageEntry(envVar, monorepoSubpath, standaloneNames, nodeModulePkg) {
	const explicit = process.env[envVar];
	const candidates = [
		explicit,
		...standaloneNames.flatMap((name) => [
			path.resolve(root, name),
			path.resolve(root, '..', name),
		]),
		...[
			process.env.FOX_SCHEMA_ROOT,
			path.resolve(root, 'foxSchema'),
			path.resolve(root, '../foxSchema'),
			path.resolve(root, '../foxschema'),
		]
			.filter(Boolean)
			.map((p) => path.join(p, monorepoSubpath)),
		path.resolve(root, 'node_modules', nodeModulePkg),
	].filter(Boolean);

	return candidates
		.map((dir) => path.join(dir, 'src/index.ts'))
		.find((file) => fs.existsSync(file));
}

const dbEntry = resolvePackageEntry(
	'FOX_SCHEMA_DB_ROOT',
	'packages/db',
	['foxschema-db'],
	'@foxschema/db',
);
const sqlEntry = resolvePackageEntry(
	'FOX_SCHEMA_SQL_ROOT',
	'packages/sql',
	['foxschema-sql'],
	'@foxschema/sql',
);

if (!dbEntry || !sqlEntry) {
	console.error(
		'Could not find @foxschema/db + @foxschema/sql. Expected sibling ../foxschema-{db,sql}, ../foxSchema/packages/{db,sql}, or node_modules/@foxschema/{db,sql}',
	);
	process.exit(1);
}

const dbRoot = path.dirname(path.dirname(dbEntry));
const sqlRoot = path.dirname(path.dirname(sqlEntry));

// Strip non-SQL engines (MongoDB/Redis) and dynamic add-on loading (Db2) from the
// n8n community bundle so no dynamic import() or unused engine code ships.
const stripUnusedEnginesPlugin = {
	name: 'strip-unused-engines',
	setup(build) {
		build.onResolve({ filter: /mongodb\.adapter(?:\.[jt]s)?$/ }, () => ({
			path: 'stub:mongodb-adapter',
			namespace: 'fox-stub',
		}));
		build.onResolve({ filter: /redis\.adapter(?:\.[jt]s)?$/ }, () => ({
			path: 'stub:redis-adapter',
			namespace: 'fox-stub',
		}));
		build.onResolve({ filter: /redis\.provider(?:\.[jt]s)?$/ }, () => ({
			path: 'stub:redis-provider',
			namespace: 'fox-stub',
		}));
		build.onResolve({ filter: /plugins\/dialect-plugin(?:\.[jt]s)?$/ }, () => ({
			path: 'stub:dialect-plugin',
			namespace: 'fox-stub',
		}));
		build.onLoad({ filter: /.*/, namespace: 'fox-stub' }, (args) => {
			if (args.path === 'stub:mongodb-adapter') {
				return { contents: 'export const mongoDbAdapter = { dialect: "mongodb", async closeAll() {} };', loader: 'js' };
			}
			if (args.path === 'stub:redis-adapter') {
				return { contents: 'export const redisAdapter = { dialect: "redis", async closeAll() {} };', loader: 'js' };
			}
			if (args.path === 'stub:redis-provider') {
				return { contents: 'export class RedisProvider {}', loader: 'js' };
			}
			return {
				contents: `
export function dialectPlugin() { return undefined; }
export function registerDialectPlugin() { throw new Error('Dialect add-ons are not supported in this n8n community node.'); }
export async function loadDialectPlugin() { return false; }
export async function ensureDialect(dialect) {
	if (String(dialect ?? '').trim().toLowerCase() === 'db2') {
		throw new Error('Dialect "db2" is not supported by n8n-nodes-fox-schema-sql-builder.');
	}
}
export function resetDialectPluginsForTest() {}
`,
				loader: 'js',
			};
		});
	},
};

fs.mkdirSync(outDir, { recursive: true });
const withSourcemap = process.env.FOX_SOURCEMAP === '1';
if (!withSourcemap && fs.existsSync(`${outfile}.map`)) {
	fs.rmSync(`${outfile}.map`, { force: true });
}

await esbuild.build({
	entryPoints: [entry],
	bundle: true,
	minify: true,
	treeShaking: true,
	platform: 'node',
	format: 'cjs',
	target: 'node20',
	outfile,
	sourcemap: withSourcemap,
	banner: {
		js: 'var __fox_import_meta_url = require("url").pathToFileURL(__filename).href;',
	},
	define: {
		'import.meta.url': '__fox_import_meta_url',
	},
	alias: {
		'@foxschema/sql': sqlEntry,
		'@foxschema/db': dbEntry,
		'#foxschema-factory': path.join(dbRoot, 'src/cores/connection-factory.ts'),
		'#foxschema-adapters': path.join(dbRoot, 'src/providers/adapter-registry.ts'),
		'#foxschema-providers': path.join(dbRoot, 'src/providers/provider-registry.ts'),
		'#foxschema-sql-tokens': path.join(sqlRoot, 'src/modules/sql-text/sql-tokens.ts'),
		'#foxschema-sql-readings': path.join(sqlRoot, 'src/modules/sql-text/sql-readings.ts'),
	},
	external: [
		'pg',
		'mysql2',
		'mysql2/promise',
		'mssql',
		'oracledb',
		'ibm_db',
		'@foxschema/db-db2',
		'better-sqlite3',
		'@clickhouse/client',
		'@duckdb/node-api',
		'mongodb',
		'redis',
	],
	plugins: [stripUnusedEnginesPlugin],
	logLevel: 'info',
});

console.log(`Bundled foxschema db+sql → ${path.relative(root, outfile)}`);
