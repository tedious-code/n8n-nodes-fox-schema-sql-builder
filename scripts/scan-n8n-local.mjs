#!/usr/bin/env node
/**
 * Run the same ESLint ruleset as `npx @n8n/scan-community-package@beta`
 * against the local source (and compiled dist after build).
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const scannerPkg = path.join(
	root,
	'node_modules',
	'@n8n',
	'scan-community-package',
	'scanner',
	'scanner.mjs',
);

if (!fs.existsSync(scannerPkg)) {
	console.error(
		'Install @n8n/scan-community-package as a devDependency, or run: pnpm add -D @n8n/scan-community-package@beta',
	);
	process.exit(1);
}

const { analyzePackage, SOURCE_FILE_PATTERNS } = await import(pathToFileURL(scannerPkg).href);

const sourceResult = await analyzePackage(root, SOURCE_FILE_PATTERNS);
let distResult = { passed: true };
const distPkg = path.join(root, 'dist');
if (fs.existsSync(distPkg)) {
	// Analyze compiled JS + a copy of package.json as the published tarball would.
	const tmp = fs.mkdtempSync(path.join(root, '.tmp-scan-'));
	try {
		fs.cpSync(distPkg, path.join(tmp, 'dist'), { recursive: true });
		fs.copyFileSync(path.join(root, 'package.json'), path.join(tmp, 'package.json'));
		distResult = await analyzePackage(tmp, ['**/*.js', 'package.json']);
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
}

if (!sourceResult.passed) {
	console.error('SOURCE SCAN FAILED\n');
	console.error(sourceResult.details || sourceResult.message);
}
if (!distResult.passed) {
	console.error('DIST SCAN FAILED\n');
	console.error(distResult.details || distResult.message);
}
if (!sourceResult.passed || !distResult.passed) {
	process.exit(1);
}

console.log('Local n8n community scan passed (source + dist).');
