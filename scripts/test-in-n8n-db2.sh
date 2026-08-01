#!/usr/bin/env bash
# Start the n8n Db2 image with this package mounted; verify the node loads.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Unmount before repacking — deleting a live bind-mount source empties the container path.
if docker compose ps -q n8n 2>/dev/null | grep -q .; then
	echo "▶ Stopping n8n so the pack mount can be refreshed…"
	docker compose stop n8n >/dev/null
fi

bash scripts/pack-for-n8n.sh

echo "▶ Starting n8n Db2 image with fox-schema package…"
docker compose up -d

echo "▶ Waiting for healthz…"
for i in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${N8N_HOST_PORT:-5678}/healthz" >/dev/null; then
    echo "  ✓ n8n is up"
    break
  fi
  sleep 3
  if [[ "$i" -eq 40 ]]; then
    echo "n8n failed to become healthy"
    docker compose logs --tail=80 n8n
    exit 1
  fi
done

echo "▶ Checking custom extensions inside container…"
docker exec n8n-fox-schema sh -c 'ls -la /opt/n8n-custom/node_modules; ls /opt/n8n-custom/node_modules/n8n-nodes-fox-schema-sql-builder/dist/nodes | head'

echo "▶ Verifying node module can be required (via n8n peer path)…"
docker exec \
	-e NODE_PATH=/usr/local/lib/node_modules/n8n/node_modules:/usr/local/lib/node_modules \
	n8n-fox-schema node -e "
const path = require('path');
const pkg = '/opt/n8n-custom/node_modules/n8n-nodes-fox-schema-sql-builder';
const p = require(path.join(pkg, 'package.json'));
console.log('package', p.name, p.version);
const Node = require(path.join(pkg, p.n8n.nodes[0]));
const Ctor = Node.FoxSchemaSqlBuilder || Object.values(Node).find(v => typeof v === 'function');
const n = new Ctor();
console.log('node', n.description.name, n.description.displayName);
if (n.description.name !== 'foxSchemaSqlBuilder') process.exit(1);
const Cred = require(path.join(pkg, p.n8n.credentials[0]));
const C = Cred.FoxSchemaDbCredentialsApi || Object.values(Cred).find(v => typeof v === 'function');
const c = new C();
const dialects = (c.properties || []).find(x => x.name === 'dialect')?.options?.map(o => o.value) || [];
if (dialects.includes('db2')) {
  console.error('FAIL: db2 must not appear in credential dialects');
  process.exit(1);
}
console.log('OK fox-schema node loads in n8n Db2 image; dialects=', dialects.join(','));
"

# Confirm both Db2 (baked-in) and Fox Schema packages are present under custom extensions
docker exec n8n-fox-schema sh -c \
	'test -d /opt/n8n-custom/node_modules/n8n-nodes-db2-sql-builder && test -d /opt/n8n-custom/node_modules/n8n-nodes-fox-schema-sql-builder && echo OK both community packages present'

echo "✓ Open http://127.0.0.1:${N8N_HOST_PORT:-5678} — search for Fox Schema SQL Builder (Db2 builder remains available too)"
