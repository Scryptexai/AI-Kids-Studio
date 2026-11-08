// JSON Schema validation for every manifest type. Schemas are draft 2020-12 and are
// registered together so they can $ref each other by $id.
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import fs from 'node:fs/promises';
import path from 'node:path';
import { P } from './paths.mjs';
import { StudioError } from './log.mjs';

let ajv;
let loaded = false;

export async function getAjv() {
  if (loaded) return ajv;
  ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const files = (await fs.readdir(P.schemas)).filter((f) => f.endsWith('.schema.json'));
  for (const f of files) {
    const schema = JSON.parse(await fs.readFile(path.join(P.schemas, f), 'utf8'));
    ajv.addSchema(schema, schema.$id ?? `https://studio.local/schemas/${f}`);
  }
  loaded = true;
  return ajv;
}

const prettify = (errs) =>
  (errs ?? []).map((e) => `${e.instancePath || '/'} ${e.message}${e.params ? ` ${JSON.stringify(e.params)}` : ''}`);

/** Validate `data` against the schema whose $id ends with `schemaFile`. Returns error list. */
export async function validateAgainst(schemaFile, data, label = 'document') {
  const v = await getAjv();
  const id = `https://studio.local/schemas/${schemaFile}`;
  const validate = v.getSchema(id);
  if (!validate) throw new StudioError(`schema not registered: ${schemaFile}`);
  if (validate(data)) return [];
  return prettify(validate.errors).map((m) => ({ where: label, message: m }));
}
