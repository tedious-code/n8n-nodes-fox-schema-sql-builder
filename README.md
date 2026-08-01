# Fox Schema SQL Builder (n8n community node)

Multi-dialect **SQL Builder** for [n8n](https://n8n.io), powered by [`@foxschema/core`](https://foxschema.com) catalog discovery.

Supported dialects: **PostgreSQL**, **MySQL**, **MariaDB**, **SQL Server**, **Oracle**.

**Db2 is not supported.** Native `ibm_db` cannot install through n8n’s community-node installer. For Db2, use [`n8n-nodes-db2-sql-builder`](https://github.com/tedious-code/n8n-nodes-db2-sql-builder) with a custom Docker image.

---

## Install (community node)

1. In n8n: **Settings → Community nodes → Install**
2. Package name: `n8n-nodes-fox-schema-sql-builder`
3. Restart n8n if required

This package **does not** ship database drivers. Install succeeds on normal n8n hosts (including environments that cannot compile native addons).

### Runtime drivers (optional peers)

Install only the driver(s) you need on the n8n host (or bake them into your image):

| Dialect | npm package |
|---|---|
| PostgreSQL | `pg` |
| MySQL / MariaDB | `mysql2` |
| SQL Server | `mssql` |
| Oracle | `oracledb` (+ Oracle Instant Client on the host) |

Example (self-hosted):

```bash
cd ~/.n8n
npm install pg mysql2 mssql
# Oracle additionally needs Instant Client / thick mode setup
```

---

## Features

### Schema browser (FoxSchema)

- Lists **tables**, **views**, **procedures**, and **functions**
- Tables / views → selectable **columns**
- Procedures / functions → **IN / OUT / INOUT** parameters

### Row operations

- Get / Create / Update / Delete with visual SELECT, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT

### Routine operations

- **Call Procedure** / **Call Function** (one routine per node)
- Parameter modes: **Form** (catalog IN/INOUT list), **From Item** (map incoming JSON by name + optional overrides), **JSON** object
- OUT parameters are not captured yet (bound as null). Fan-out multiple calls with separate nodes or Split in Batches.

### Execute Query

- Multi-statement workflows with bindings, preview/dry-run, optional transactions

---

## Credentials

Create a **Fox Schema Database** credential:

- Dialect (postgres / mysql / mariadb / sqlserver / oracle)
- Host, port, database/service, username, password
- Schema (optional; defaults: `public`, `dbo`, database name, or Oracle username)
- SSL options

---

## Security note

Restrict n8n database credentials to the least privilege needed. Keep **Allow Unsafe SQL** off unless every workflow editor is trusted.

---

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm validate:n8n
```

`pnpm build` bundles a CJS copy of `@foxschema/core` from the sibling `../foxSchema/packages/core` tree (or `node_modules/@foxschema/core` when published) into `dist/vendor/`.

### E2E against foxSchema seeds

Reuse the sibling [foxSchema](https://github.com/tedious-code/foxschema) Docker demo (`demo_a`):

```bash
# Start + seed Postgres (and MySQL by default)
pnpm seed:foxschema

# Or a single dialect / everything
pnpm seed:foxschema postgres
pnpm seed:foxschema all

# Run live catalog + query checks (skips dialects that are down)
pnpm test:e2e

# Fail instead of skip when a dialect is unreachable
FOX_E2E=1 pnpm test:e2e
```

Seed credentials match foxSchema compose defaults (`foxuser` / `foxpass`, schema `demo_a`). Override with `FOX_E2E_PG_*`, `FOX_E2E_MYSQL_*`, etc. if needed.

### Test inside the n8n Db2 image

Uses `5nickels/n8n-nodes-db2-sql-builder:latest` (linux/amd64) and mounts this package under `N8N_CUSTOM_EXTENSIONS`:

```bash
pnpm test:n8n
# → http://127.0.0.1:5678
# Fox Schema SQL Builder + baked-in Db2 SQL Builder both available
```

The compose file joins the external `foxschema_default` network so credentials can use container DNS:

| Dialect | Host | Port | Database | User / Pass | Schema |
|---|---|---|---|---|---|
| PostgreSQL | `foxschema-postgres` | 5432 | `foxdb` | `foxuser` / `foxpass` | `demo_a` |
| MySQL | `foxschema-mysql` | 3306 | `demo_a` | `foxuser` / `foxpass` | `demo_a` |

Do **not** put your n8n login (`email@…`) into the Fox Schema Database credential — that credential is for the SQL database only.

After editing the credential, click **Test** then reopen the Table/View list. Catalog errors now surface in the UI instead of a silent “No results”.

Stop with `docker compose down`.
