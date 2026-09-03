#!/usr/bin/env bash
# Idempotent Cloud Agent setup for n8n-nodes-fox-schema-sql-builder.
#
# The build bundles @foxschema/db (+ reachable @foxschema/sql) which are not
# published to npm; they live in the sibling tedious-code/foxschema monorepo.
# We clone that repo once and symlink its packages into node_modules/@foxschema
# so scripts/bundle-foxschema.mjs can resolve them.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FOX_DIR="${FOX_SCHEMA_DIR:-$HOME/foxschema}"
FOX_REPO="${FOX_SCHEMA_REPO:-https://github.com/tedious-code/foxschema.git}"

echo "==> Ensuring FoxSchema source at $FOX_DIR"
if [ -d "$FOX_DIR/.git" ]; then
	git -C "$FOX_DIR" pull --ff-only || echo "warn: could not fast-forward $FOX_DIR (keeping existing checkout)"
else
	git clone --depth 1 "$FOX_REPO" "$FOX_DIR"
fi

echo "==> Installing dependencies with pnpm"
cd "$ROOT"
pnpm install

echo "==> Linking @foxschema/{db,sql} into node_modules"
mkdir -p "$ROOT/node_modules/@foxschema"
ln -sfn "$FOX_DIR/packages/db" "$ROOT/node_modules/@foxschema/db"
ln -sfn "$FOX_DIR/packages/sql" "$ROOT/node_modules/@foxschema/sql"

echo "==> Building (bundles FoxSchema core, compiles TS, copies icons)"
pnpm build

echo "==> Setup complete"
