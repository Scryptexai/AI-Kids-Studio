#!/usr/bin/env node
// Inspect an npm tarball *before* judging whether a package is usable.
//
//   npm run pkg:inspect -- <package> [--version X] [--extract] [--brotli]
//
// Why this exists: the first attempt at the Chromium question ran `npm install`, tried to
// launch the browser, saw "libnspr4.so: cannot open shared object file", and concluded the
// dependency was unusable in this environment. `npm pack` + extraction showed the tarball
// ships bin/al2023.tar.br containing libnss3/libnspr4/libnssutil3 — the "missing" libraries
// were inside the package the whole time.
//
// So: pack, list, classify (native binary / shared lib / WASM / JS), and optionally
// decompress brotli/gzip payloads and unpack nested tarballs. Never conclude from install.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { P, ensureDir, rel } from '../lib/paths.mjs';
import { log, StudioError } from '../lib/log.mjs';
import { runProcess } from '../lib/proc.mjs';
import { writeJson } from '../lib/json.mjs';

function parseArgs(argv) {
  const out = { pkg: null, version: null, extract: false, brotli: false, keep: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--version') out.version = argv[++i];
    else if (a === '--extract') out.extract = true;
    else if (a === '--brotli') out.brotli = true;
    else if (a === '--keep') out.keep = true;
    else if (!a.startsWith('--')) out.pkg = a;
  }
  if (!out.pkg) {
    throw new StudioError('package name required', {
      hint: 'npm run pkg:inspect -- @sparticuz/chromium --extract --brotli',
    });
  }
  return out;
}

/** Classify an entry by extension so the report answers "does this carry real binaries?". */
function classify(name) {
  const n = name.toLowerCase();
  if (n.endsWith('.br')) return 'brotli';
  if (n.endsWith('.gz') || n.endsWith('.tgz')) return 'gzip';
  if (n.endsWith('.tar')) return 'tar';
  if (n.endsWith('.wasm')) return 'wasm';
  if (n.endsWith('.so') || /\.so\.\d+$/.test(n)) return 'shared-lib';
  if (n.endsWith('.dll') || n.endsWith('.dylib')) return 'shared-lib';
  if (n.endsWith('.node')) return 'native-addon';
  if (n.endsWith('.exe')) return 'executable';
  if (n.endsWith('.js') || n.endsWith('.mjs') || n.endsWith('.cjs')) return 'javascript';
  if (n.endsWith('.ts') || n.endsWith('.tsx') || n.endsWith('.jsx')) return 'source';
  if (n.endsWith('.json')) return 'data';
  if (n.endsWith('.py')) return 'python';
  return 'other';
}

async function walk(dir, base = dir, acc = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, base, acc);
    else {
      const st = await fs.stat(full);
      acc.push({ file: path.relative(base, full), bytes: st.size, kind: classify(entry.name) });
    }
  }
  return acc;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const work = path.join(P.tools, 'pkg-inspect', args.pkg.replace(/[/@]/g, '_'));
  await ensureDir(work);

  const spec = args.version ? `${args.pkg}@${args.version}` : args.pkg;
  log.step(`npm pack ${spec}`);
  const pack = await runProcess('npm', ['pack', spec, '--silent'], { cwd: work, timeoutMs: 900_000 });
  const tgz = pack.stdout.trim().split('\n').pop();
  if (!tgz) throw new StudioError('npm pack produced no tarball');
  const tgzPath = path.join(work, tgz);
  const tgzBytes = (await fs.stat(tgzPath)).size;
  log.ok(`${tgz} — ${(tgzBytes / 1e6).toFixed(2)} MB`);

  const extractDir = path.join(work, 'unpacked');
  await fs.rm(extractDir, { recursive: true, force: true });
  await ensureDir(extractDir);
  await runProcess('tar', ['xzf', tgzPath, '-C', extractDir], { timeoutMs: 900_000 });

  const pkgDir = path.join(extractDir, 'package');
  const pkgJson = JSON.parse(await fs.readFile(path.join(pkgDir, 'package.json'), 'utf8'));
  const entries = await walk(pkgDir);
  const byKind = {};
  for (const e of entries) {
    byKind[e.kind] ??= { count: 0, bytes: 0 };
    byKind[e.kind].count += 1;
    byKind[e.kind].bytes += e.bytes;
  }

  log.step('contents');
  for (const [kind, v] of Object.entries(byKind).sort((a, b) => b[1].bytes - a[1].bytes)) {
    log.plain(`  ${kind.padEnd(14)} ${String(v.count).padStart(5)} files  ${(v.bytes / 1e6).toFixed(2)} MB`);
  }

  const notable = entries
    .filter((e) => ['brotli', 'gzip', 'tar', 'wasm', 'shared-lib', 'native-addon', 'executable'].includes(e.kind))
    .sort((a, b) => b.bytes - a.bytes);
  if (notable.length) {
    log.step('binaries and compressed payloads (these are what decide usability)');
    for (const e of notable.slice(0, 40)) log.plain(`  ${e.kind.padEnd(12)} ${(e.bytes / 1e6).toFixed(2).padStart(8)} MB  ${e.file}`);
    if (notable.length > 40) log.plain(`  … ${notable.length - 40} more`);
  }

  // Optional: decompress so the payload can be inspected instead of guessed at.
  const decompressed = [];
  if (args.brotli || args.extract) {
    for (const e of entries.filter((x) => x.kind === 'brotli')) {
      const src = path.join(pkgDir, e.file);
      const destName = e.file.replace(/\.br$/, '');
      const dest = path.join(pkgDir, destName);
      try {
        const out = zlib.brotliDecompressSync(await fs.readFile(src));
        await fs.writeFile(dest, out);
        decompressed.push({ from: e.file, to: destName, bytes: out.length });
        log.ok(`brotli → ${destName} (${(out.length / 1e6).toFixed(2)} MB)`);
      } catch (err) {
        log.warn(`could not decompress ${e.file}: ${err.message}`);
      }
    }
    // Nested tarballs usually hold the system libraries — list them.
    for (const e of [...entries.filter((x) => x.kind === 'tar'), ...decompressed.filter((d) => d.to.endsWith('.tar')).map((d) => ({ file: d.to }))]) {
      try {
        const list = await runProcess('tar', ['tf', path.join(pkgDir, e.file)], { timeoutMs: 120_000 });
        const files = list.stdout.trim().split('\n').filter(Boolean);
        log.step(`${e.file} contents (${files.length} entries)`);
        for (const f of files.slice(0, 40)) log.plain(`  ${f}`);
        if (files.length > 40) log.plain(`  … ${files.length - 40} more`);
      } catch (err) {
        log.warn(`could not list ${e.file}: ${err.message}`);
      }
    }
  }

  const report = {
    inspectedAt: new Date().toISOString(),
    package: pkgJson.name,
    version: pkgJson.version,
    license: pkgJson.license ?? null,
    tarball: tgz,
    tarballBytes: tgzBytes,
    fileCount: entries.length,
    unpackedBytes: entries.reduce((s, e) => s + e.bytes, 0),
    byKind,
    notable: notable.slice(0, 200),
    decompressed,
    extractDir: rel(extractDir),
  };
  const reportPath = path.join(work, 'inspection.json');
  await writeJson(reportPath, report);
  log.ok(`report → ${rel(reportPath)}`);
  if (!args.keep) log.info(`extracted tree kept at ${rel(extractDir)} for inspection`);
}

main().catch((err) => {
  log.error(err.message);
  if (err.details) log.error('details', err.details);
  process.exitCode = 1;
});
