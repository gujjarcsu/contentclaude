#!/usr/bin/env node
/**
 * Generate app/utils/schemaColumns.generated.js from prisma/schema.prisma.
 *
 * The drift check needs to know which columns this build expects. Parsing the
 * schema at runtime would mean shipping the .prisma file and a parser; asking
 * Prisma would mean shelling out to the CLI on every health check. So the list
 * is generated once and committed, and a test regenerates it and fails if the
 * committed copy is stale — so it cannot silently fall behind the schema.
 *
 *   node scripts/generate-schema-columns.mjs          # write
 *   node scripts/generate-schema-columns.mjs --check  # exit 1 if stale
 *
 * Read-only against the database. Touches no network.
 */
import { readFileSync, writeFileSync } from "node:fs";

const SCHEMA = "prisma/schema.prisma";
const OUT = "app/utils/schemaColumns.generated.js";

/** Prisma scalar and native types. A field whose type is a MODEL is a relation. */
const SCALARS = new Set([
  "String",
  "Boolean",
  "Int",
  "BigInt",
  "Float",
  "Decimal",
  "DateTime",
  "Json",
  "Bytes",
]);

export function parseColumns(schemaText) {
  const models = new Map();
  const enums = new Set();

  // Enum names are valid column types; model names are relations and are not.
  for (const m of schemaText.matchAll(/^enum\s+(\w+)\s*\{/gm)) enums.add(m[1]);

  const modelBlocks = [...schemaText.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)];
  for (const [, name, body] of modelBlocks) models.set(name, body);

  const columns = [];
  for (const [model, body] of models) {
    // The database table is the model name unless @@map renames it.
    const mapped = body.match(/@@map\("([^"]+)"\)/);
    const table = mapped ? mapped[1] : model;

    for (const line of body.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("//") || t.startsWith("@@")) continue;

      const m = t.match(/^(\w+)\s+(\w+)(\[\])?(\?)?/);
      if (!m) continue;
      const [, field, type, isList] = m;

      // A list of a model is a relation with no column. A single model field
      // has a foreign key, but that key is declared separately as a scalar
      // with @relation(fields: [...]), so it is picked up on its own line.
      if (isList) continue;
      if (!SCALARS.has(type) && !enums.has(type)) continue;

      const colMatch = t.match(/@map\("([^"]+)"\)/);
      const column = colMatch ? colMatch[1] : field;
      columns.push(`${table}.${column}`);
    }
  }

  return [...new Set(columns)].sort();
}

const header = `/**
 * GENERATED — do not edit by hand.
 *
 * Every column this build's Prisma client expects, as \`Table.column\`. Written
 * by scripts/generate-schema-columns.mjs from prisma/schema.prisma, and checked
 * by tests/utils/schemaDrift.test.js, which regenerates it and fails if this
 * file is stale.
 *
 * app/utils/schemaDrift.server.js compares this against information_schema at
 * startup and on every deep health check. The reason it exists is the 2026-09-09
 * incident: a migration was edited after it had been applied, Prisma skipped it
 * by name, and every /app load returned 500 for eight hours while
 * \`prisma migrate status\`, /api/health and the smoke job all reported healthy.
 */
export const EXPECTED_COLUMNS = Object.freeze([
`;

const cols = parseColumns(readFileSync(SCHEMA, "utf8"));
const body = cols.map((c) => `  ${JSON.stringify(c)},`).join("\n");
const content = `${header}${body}\n]);\n`;

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    /* missing counts as stale */
  }
  if (current.trim() !== content.trim()) {
    console.error(`${OUT} is stale. Run: node scripts/generate-schema-columns.mjs`);
    process.exit(1);
  }
  console.log(`${OUT} is up to date (${cols.length} columns).`);
} else {
  writeFileSync(OUT, content);
  console.log(`Wrote ${OUT} — ${cols.length} columns.`);
}
