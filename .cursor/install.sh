#!/usr/bin/env bash
# Idempotent Cloud Agent setup for n8n-nodes-fox-schema-sql-builder.
#
# The build bundles @foxschema/db + @foxschema/sql which are cloned from the
# sibling tedious-code/foxschema-db and tedious-code/foxschema-sql repos and
# symlinked into node_modules/@foxschema so scripts/bundle-foxschema.mjs can
# resolve them without pulling in @foxschema/db-db2 / ibm_db.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FOX_DB_DIR="${FOX_SCHEMA_DB_DIR:-$HOME/foxschema-db}"
FOX_SQL_DIR="${FOX_SCHEMA_SQL_DIR:-$HOME/foxschema-sql}"
FOX_DB_REPO="${FOX_SCHEMA_DB_REPO:-https://github.com/tedious-code/foxschema-db.git}"
FOX_SQL_REPO="${FOX_SCHEMA_SQL_REPO:-https://github.com/tedious-code/foxschema-sql.git}"

ensure_repo() {
	local dir="$1"
	local repo="$2"
	echo "==> Ensuring source at $dir"
	if [ -d "$dir/.git" ]; then
		git -C "$dir" pull --ff-only || echo "warn: could not fast-forward $dir (keeping existing checkout)"
	else
		git clone --depth 1 "$repo" "$dir"
	fi
}

ensure_repo "$FOX_DB_DIR" "$FOX_DB_REPO"
ensure_repo "$FOX_SQL_DIR" "$FOX_SQL_REPO"

echo "==> Installing dependencies with pnpm"
cd "$ROOT"
pnpm install

echo "==> Linking @foxschema/{db,sql} into node_modules"
mkdir -p "$ROOT/node_modules/@foxschema"
ln -sfn "$FOX_DB_DIR" "$ROOT/node_modules/@foxschema/db"
ln -sfn "$FOX_SQL_DIR" "$ROOT/node_modules/@foxschema/sql"

echo "==> Building (bundles FoxSchema db+sql, compiles TS, copies icons)"
pnpm build

echo "==> Setup complete"
