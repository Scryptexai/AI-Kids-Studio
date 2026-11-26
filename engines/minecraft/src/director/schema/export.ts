// Writes src/director/schema/json/<Kind>.schema.json from the zod schemas. Run: node src/director/schema/export.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { jsonSchemas, stableJson } from "./index.ts";

export const JSON_DIR = join(import.meta.dirname, "json");

export const exportJsonSchemas = (dir = JSON_DIR) => {
  mkdirSync(dir, { recursive: true });
  const out: string[] = [];
  for (const [kind, schema] of Object.entries(jsonSchemas())) {
    const file = join(dir, `${kind}.schema.json`);
    writeFileSync(file, stableJson(schema));
    out.push(file);
  }
  return out;
};

if (import.meta.main) for (const f of exportJsonSchemas()) console.log(f);
