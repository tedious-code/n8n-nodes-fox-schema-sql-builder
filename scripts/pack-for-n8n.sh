#!/usr/bin/env bash
# Build this community node into tmp/n8n-pack for mounting into the n8n Db2 image.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACK="$ROOT/tmp/n8n-pack/n8n-nodes-fox-schema-sql-builder"

cd "$ROOT"
pnpm build

rm -rf "$PACK"
mkdir -p "$PACK"

# Minimal installable package surface for N8N_CUSTOM_EXTENSIONS
cp "$ROOT/package.json" "$PACK/package.json"
cp -R "$ROOT/dist" "$PACK/dist"

# Optional runtime drivers for live credential tests against foxSchema seeds
cd "$PACK"
npm install --omit=dev --ignore-scripts pg mysql2 mssql 2>/dev/null || npm install --omit=dev pg mysql2 mssql

# Drop junk to keep mount small
find node_modules -type d \( -name test -o -name tests -o -name __tests__ -o -name docs -o -name example -o -name examples \) -prune -exec rm -rf {} + 2>/dev/null || true

echo "✓ packed → $PACK"
ls -la "$PACK"
