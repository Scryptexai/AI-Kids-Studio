// A tiny review player for rendered episodes.
//
// Drive is the archive, but a Drive video needs a sign-in and a download before a scene can be
// judged. This serves the same mp4 out of `renders/` over HTTP with range support, so the video can
// be scrubbed in the browser while the render is still fresh.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.PORT ?? 4173);
const EPISODE = process.env.EPISODE ?? 'ep-002';
const DIR = path.join(ROOT, 'renders', EPISODE);

const clip = (f) => path.join(DIR, f);

const page = () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.mp4'));
  const main = files.filter((f) => /T\d\d-\d\d-\d\d/.test(f)).sort().at(-1);
  const scenes = files.filter((f) => /-sc-\d+/.test(f)).sort();
  const card = (name, label, big = false) => `
    <section class="${big ? 'episode' : 'scene'}">
      <h2>${label}</h2>
      <video controls preload="metadata" ${big ? 'width="100%"' : ''} src="/media/${encodeURIComponent(name)}"></video>
      <p class="meta">${name}</p>
    </section>`;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${EPISODE} — review</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#10161b; color:#e8eef4; font:15px/1.5 system-ui, sans-serif; }
  header { padding:20px 24px 8px; }
  h1 { margin:0; font-size:20px; }
  .note { color:#8fa3b3; font-size:13px; margin-top:6px; }
  .episode { padding:12px 24px 8px; }
  .scenes { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px; padding:16px 24px 40px; }
  .scene { background:#172129; border-radius:10px; padding:12px; }
  .scene h2, .episode h2 { font-size:14px; margin:0 0 8px; color:#a9c0d2; font-weight:600; }
  video { display:block; width:100%; border-radius:6px; background:#000; }
  .meta { margin:8px 0 0; font-size:12px; color:#6f8494; word-break:break-all; }
</style></head><body>
<header>
  <h1>Pebblepop World — ${EPISODE}</h1>
  <div class="note">Render terbaru. Suara masih placeholder (espeak) — jangan dipublikasikan.
  Versi arsip ada di Google Drive / video ready.</div>
</header>
${main ? card(main, 'Episode penuh', true) : '<p style="padding:24px">Belum ada render.</p>'}
<div class="scenes">${scenes.map((f, i) => card(f, `Adegan ${i + 1}`)).join('')}</div>
</body></html>`;
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/' ) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(page());
  }
  if (url.pathname.startsWith('/media/')) {
    const name = path.basename(decodeURIComponent(url.pathname.slice(7)));
    const file = clip(name);
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    const size = fs.statSync(file).size;
    const range = req.headers.range;
    // Range requests are what make a 12 MB render scrubbable instead of a download.
    if (range) {
      const [startStr, endStr] = range.replace('bytes=', '').split('-');
      const start = Number(startStr) || 0;
      const end = endStr ? Math.min(Number(endStr), size - 1) : size - 1;
      res.writeHead(206, {
        'content-type': 'video/mp4',
        'accept-ranges': 'bytes',
        'content-range': `bytes ${start}-${end}/${size}`,
        'content-length': end - start + 1,
      });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': size });
    return fs.createReadStream(file).pipe(res);
  }
  res.writeHead(404); res.end('not found');
});

server.listen(PORT, '0.0.0.0', () => console.log(`review player on http://0.0.0.0:${PORT}/`));
