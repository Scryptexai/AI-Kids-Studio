// Minimal Google Drive client (service-account auth, REST v3, zero npm dependencies).
//
// Why not the agent-side Drive connector: GitHub Actions and local scripts cannot use the
// chat connector. Per the brief (section 11) automation needs its own credential, stored
// as a secret. Setup is documented in docs/PERSISTENCE.md:
//   GDRIVE_SERVICE_ACCOUNT_JSON  path to a service-account key file (never committed)
//   GDRIVE_FOLDER_ID             root folder that holds all studio assets
//
// Implemented for: list files in a folder, download a file by id, upload/replace a file.
// NOTE: this module is exercised by unit tests with a mocked fetch. It has NOT been run
// against a live Drive account in this sandbox because no credential exists here — that
// is stated honestly rather than claimed as verified.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { StudioError } from './log.mjs';

const SCOPE = 'https://www.googleapis.com/auth/drive';

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function loadCredentials() {
  const keyPath = process.env.GDRIVE_SERVICE_ACCOUNT_JSON;
  const inline = process.env.GDRIVE_SERVICE_ACCOUNT_JSON_INLINE;
  if (!keyPath && !inline) {
    throw new StudioError('Google Drive credentials are not configured', {
      hint: 'export GDRIVE_SERVICE_ACCOUNT_JSON=/path/to/service-account.json (see docs/PERSISTENCE.md)',
      code: 4,
    });
  }
  const raw = inline ?? (await fs.readFile(keyPath, 'utf8'));
  const creds = JSON.parse(raw);
  if (!creds.client_email || !creds.private_key) {
    throw new StudioError('service-account JSON is missing client_email or private_key');
  }
  return creds;
}

export async function getAccessToken(creds, { fetchImpl = fetch } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: creds.client_email,
      scope: SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = crypto.createSign('RSA-SHA256').update(`${header}.${claim}`).sign(creds.private_key);
  const assertion = `${header}.${claim}.${base64url(signature)}`;

  const res = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) {
    throw new StudioError(`Drive token exchange failed: HTTP ${res.status}`, {
      details: { body: (await res.text()).slice(0, 500) },
    });
  }
  const json = await res.json();
  return json.access_token;
}

export function createDriveClient({ token, fetchImpl = fetch } = {}) {
  const api = 'https://www.googleapis.com/drive/v3';
  const uploadApi = 'https://www.googleapis.com/upload/drive/v3';
  const auth = () => ({ authorization: `Bearer ${token}` });

  return {
    /** List non-trashed files directly inside a folder. */
    async list(folderId) {
      const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
      const url = `${api}/files?q=${q}&fields=files(id,name,size,md5Checksum,mimeType)&pageSize=1000`;
      const res = await fetchImpl(url, { headers: auth() });
      if (!res.ok) throw new StudioError(`Drive list failed: HTTP ${res.status}`);
      return (await res.json()).files ?? [];
    },

    async download(fileId, destPath) {
      const res = await fetchImpl(`${api}/files/${fileId}?alt=media`, { headers: auth() });
      if (!res.ok) throw new StudioError(`Drive download failed for ${fileId}: HTTP ${res.status}`);
      await fs.writeFile(destPath, Buffer.from(await res.arrayBuffer()));
      return destPath;
    },

    async upload(localPath, { name, folderId, mimeType = 'application/octet-stream', fileId = null }) {
      const body = await fs.readFile(localPath);
      const metadata = fileId ? {} : { name, parents: folderId ? [folderId] : undefined };
      const boundary = `studio${crypto.randomUUID()}`;
      const payload = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
        body,
        Buffer.from(`\r\n--${boundary}--`),
      ]);
      const url = fileId
        ? `${uploadApi}/files/${fileId}?uploadType=multipart&fields=id`
        : `${uploadApi}/files?uploadType=multipart&fields=id`;
      const res = await fetchImpl(url, {
        method: fileId ? 'PATCH' : 'POST',
        headers: { ...auth(), 'content-type': `multipart/related; boundary=${boundary}` },
        body: payload,
      });
      if (!res.ok) throw new StudioError(`Drive upload failed: HTTP ${res.status}`, { details: { body: (await res.text()).slice(0, 400) } });
      return (await res.json()).id;
    },
  };
}

export async function createDriveClientFromEnv(opts = {}) {
  const creds = await loadCredentials();
  const token = await getAccessToken(creds, opts);
  return createDriveClient({ token, ...opts });
}
