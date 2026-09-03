/**
 * Slim CJS entry for the n8n bundle. Do not re-export @foxschema/db's index —
 * that re-exports all of @foxschema/sql (compare, weave, DDL) and bloats the pack.
 */
export { ConnectionFactory } from '#foxschema-factory';
export { getAdapter } from '#foxschema-adapters';
export { getRegisteredProvider } from '#foxschema-providers';
