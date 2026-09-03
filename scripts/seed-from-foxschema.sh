#!/usr/bin/env bash
# Bring up / reseed foxSchema demo DBs used by this package's e2e tests.
# Usage:
#   pnpm seed:foxschema              # postgres + mysql (default)
#   pnpm seed:foxschema postgres
#   pnpm seed:foxschema all
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FOX_SCHEMA="${FOX_SCHEMA_ROOT:-$ROOT/../foxSchema}"
TARGET="${1:-postgres,mysql}"

if [[ ! -d "$FOX_SCHEMA" ]]; then
  echo "foxSchema repo not found at $FOX_SCHEMA"
  echo "Clone it next to this package or set FOX_SCHEMA_ROOT."
  exit 1
fi

cd "$FOX_SCHEMA"

if [[ "$TARGET" == "all" ]]; then
  SERVICES=(postgres mysql mariadb sqlserver oracle cockroachdb yugabytedb clickhouse tidb redshift)
elif [[ "$TARGET" == *","* ]]; then
  IFS=',' read -r -a SERVICES <<< "$TARGET"
else
  SERVICES=("$TARGET")
fi

COMPOSE_SERVICES=()
for svc in "${SERVICES[@]}"; do
  if [[ "$svc" != "sqlite" && "$svc" != "duckdb" ]]; then
    COMPOSE_SERVICES+=("$svc")
  fi
done

if [[ ${#COMPOSE_SERVICES[@]} -gt 0 ]]; then
  echo "▶ Starting foxSchema containers: ${COMPOSE_SERVICES[*]}"
  docker compose up -d "${COMPOSE_SERVICES[@]}"
else
  echo "▶ No containers to start (file-based dialect)"
fi

echo "▶ Waiting for health…"
# Postgres is usually ready quickly; others may take longer.
for svc in "${SERVICES[@]}"; do
  case "$svc" in
    postgres)
      for i in $(seq 1 30); do
        if docker exec foxschema-postgres pg_isready -U foxuser -d foxdb >/dev/null 2>&1; then
          break
        fi
        sleep 2
      done
      ;;
    mysql)
      for i in $(seq 1 60); do
        if docker exec foxschema-mysql mysqladmin ping -uroot -pfoxrootpass --silent >/dev/null 2>&1 \
          && docker exec foxschema-mysql mysql -uroot -pfoxrootpass -e 'SELECT 1' >/dev/null 2>&1; then
          break
        fi
        sleep 3
      done
      ;;
    mariadb)
      for i in $(seq 1 60); do
        if docker exec foxschema-mariadb mysqladmin ping -uroot -pfoxrootpass --silent >/dev/null 2>&1 \
          && docker exec foxschema-mariadb mariadb -uroot -pfoxrootpass -e 'SELECT 1' >/dev/null 2>&1; then
          break
        fi
        sleep 3
      done
      ;;
    sqlserver)
      for i in $(seq 1 60); do
        if docker exec foxschema-sqlserver /opt/mssql-tools18/bin/sqlcmd -S localhost -U SA -P 'FoxPass123!' -C -Q "SELECT 1" >/dev/null 2>&1; then
          break
        fi
        sleep 3
      done
      ;;
    oracle)
      echo "  Oracle can take several minutes on first boot…"
      for i in $(seq 1 90); do
        if docker exec foxschema-oracle healthcheck.sh >/dev/null 2>&1; then
          break
        fi
        sleep 5
      done
      ;;
    sqlite)
      echo "  SQLite is file-based — no container. Seeding via seed-all.sh…"
      ;;
    duckdb)
      echo "  DuckDB is file-based — no container. Seeding via seed-all.sh…"
      ;;
    cockroachdb)
      for i in $(seq 1 40); do
        if docker exec foxschema-cockroachdb cockroach sql --insecure -e 'SELECT 1' >/dev/null 2>&1; then
          break
        fi
        sleep 2
      done
      ;;
    yugabytedb)
      echo "  YugabyteDB can take a minute on first boot…"
      for i in $(seq 1 60); do
        if docker exec foxschema-yugabytedb bash -c "bin/ysqlsh -h \$(hostname -i | awk '{print \$1}') -p 5433 -U yugabyte -c 'SELECT 1'" >/dev/null 2>&1; then
          break
        fi
        sleep 5
      done
      ;;
    clickhouse)
      for i in $(seq 1 40); do
        if docker exec foxschema-clickhouse clickhouse-client --user default --password foxpass -q 'SELECT 1' >/dev/null 2>&1; then
          break
        fi
        sleep 2
      done
      ;;
    tidb)
      for i in $(seq 1 40); do
        if docker exec foxschema-tidb bash -c 'exec 3<>/dev/tcp/127.0.0.1/10080' >/dev/null 2>&1; then
          break
        fi
        sleep 2
      done
      ;;
    redshift)
      for i in $(seq 1 30); do
        if docker exec foxschema-redshift pg_isready -U foxuser -d foxdb >/dev/null 2>&1; then
          break
        fi
        sleep 2
      done
      ;;
  esac
done

echo "▶ Reseeding…"
if [[ "$TARGET" == "all" ]]; then
  bash scripts/seed/seed-all.sh all
elif [[ "$TARGET" == *","* ]]; then
  for svc in "${SERVICES[@]}"; do
    bash scripts/seed/seed-all.sh "$svc" || true
  done
else
  bash scripts/seed/seed-all.sh "$TARGET"
fi

echo "✓ foxSchema seed ready for e2e"
