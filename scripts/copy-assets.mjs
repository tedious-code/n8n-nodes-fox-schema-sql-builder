#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function copyGlob(fromDir, destRoot, exts) {
	if (!fs.existsSync(fromDir)) return;
	for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
		const full = path.join(fromDir, entry.name);
		if (entry.isDirectory()) {
			copyGlob(full, destRoot, exts);
			continue;
		}
		const ext = path.extname(entry.name).toLowerCase();
		if (!exts.has(ext)) continue;
		const rel = path.relative(root, full);
		const dest = path.join(destRoot, rel);
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.copyFileSync(full, dest);
	}
}

const dist = path.join(root, 'dist');
copyGlob(path.join(root, 'nodes'), dist, new Set(['.png', '.svg', '.json', '.cjs']));
copyGlob(path.join(root, 'credentials'), dist, new Set(['.png', '.svg', '.json']));
console.log('Copied node/credential assets into dist/');
