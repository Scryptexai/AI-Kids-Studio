// CA-aware HTTP helper.
//
// Node's fetch() only trusts its bundled root store. In restricted sandboxes (like this
// one) egress passes through a TLS-inspecting proxy whose CA lives in the system store but
// NOT in Node's bundle — so fetch fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE while `curl`
// succeeds. This module builds a trust list from Node's roots + any extra CA files found
// on disk, so downloads work without disabling certificate verification.
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import tls from 'node:tls';
import https from 'node:https';
import { StudioError } from './log.mjs';

const EXTRA_CA_CANDIDATES = [
  process.env.NODE_EXTRA_CA_CERTS,
  process.env.STUDIO_EXTRA_CA,
  '/usr/local/share/ca-certificates/e2b-ca.crt',
  '/etc/ssl/certs/ca-certificates.crt',
  '/etc/pki/tls/certs/ca-bundle.crt',
];

let cachedCa = null;

export function trustList() {
  if (cachedCa) return cachedCa;
  const cas = [...tls.rootCertificates];
  const loaded = [];
  for (const p of EXTRA_CA_CANDIDATES) {
    if (!p) continue;
    try {
      const content = fsSync.readFileSync(p, 'utf8');
      // Only append if it looks like PEM (skip system bundle duplicates is harmless).
      if (content.includes('BEGIN CERTIFICATE')) {
        cas.push(content);
        loaded.push(p);
      }
    } catch {
      /* missing file is fine */
    }
  }
  cachedCa = { cas, loaded };
  return cachedCa;
}

/**
 * GET a URL and return the raw buffer, following redirects.
 * @param {string} url
 * @param {{maxRedirects?:number, timeoutMs?:number}} opts
 */
export async function getBuffer(url, opts = {}) {
  const { maxRedirects = 5, timeoutMs = 120_000 } = opts;
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await rawGet(current, timeoutMs);
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      current = new URL(res.headers.location, current).href;
      continue;
    }
    if (res.status !== 200) {
      throw new StudioError(`HTTP ${res.status} downloading ${current}`, { code: 2 });
    }
    return res.body;
  }
  throw new StudioError(`too many redirects downloading ${url}`);
}

function rawGet(url, timeoutMs) {
  const { cas } = trustList();
  return new Promise((resolve, reject) => {
    const req = https.get(url, { ca: cas, headers: { 'user-agent': 'kids-ai-studio/0.1' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout after ${timeoutMs}ms: ${url}`)));
    req.on('error', reject);
  });
}

/** Download to a file atomically. */
export async function download(url, destPath, opts) {
  const buf = await getBuffer(url, opts);
  const tmp = `${destPath}.part`;
  await fs.writeFile(tmp, buf);
  await fs.rename(tmp, destPath);
  return { bytes: buf.length, path: destPath };
}

/** Reachability probe that does NOT download the body. Returns the HTTP status or an error. */
export function statusOf(url, { timeoutMs = 8000 } = {}) {
  const { cas } = trustList();
  return new Promise((resolve) => {
    const req = https.get(url, { ca: cas, headers: { 'user-agent': 'kids-ai-studio/0.1' } }, (res) => {
      res.resume();
      resolve({ reachable: true, httpStatus: res.statusCode });
      req.destroy();
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ reachable: false, error: 'timeout' });
    });
    req.on('error', (err) => resolve({ reachable: false, error: err.code ?? err.message }));
  });
}
