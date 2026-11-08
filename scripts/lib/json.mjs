import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { StudioError } from './log.mjs';

export async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new StudioError(`missing file: ${file}`, {
        hint: 'run `npm run bootstrap` to generate the missing artefact',
      });
    }
    throw new StudioError(`invalid JSON in ${file}: ${err.message}`, { code: 2 });
  }
}

/** Deterministic JSON writer: stable key order, trailing newline, atomic replace. */
export async function writeJson(file, data) {
  const tmp = `${file}.tmp`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, file);
}

export async function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const fh = await fs.open(file, 'r');
  try {
    for await (const chunk of fh.createReadStream()) hash.update(chunk);
  } finally {
    await fh.close();
  }
  return hash.digest('hex');
}

export function sha256Text(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}
