# Renderer (P4)

Scene JSON → frames → H.264/AAC MP4, entirely on CPU, with no browser and no GPU.

```
scene.json + world.json + characters/*.json
        │
        ├── buildSceneSvg()      pure function: scene + t → SVG
        │     ├── background plate (location, camera pan/zoom)
        │     ├── props (procedural until final art exists)
        │     ├── characters   (rig: legs, body, arms, head, face; animation state per t)
        │     └── subtitle     (timed from the scene's subtitle track)
        │
        ├── resvg (Rust, prebuilt) → raw RGBA   ~160 ms/frame @1280x720 / 2 vCPU
        │
        ├── ffmpeg rawvideo → libx264 (veryfast, crf 20, yuv420p)
        ├── ffmpeg audio mix (dialogue placed by startSec + ambience, EBU R128 −16 LUFS)
        └── ffmpeg concat (stream copy, no re-encode)
```

---

## 1. Why not Remotion

Remotion was the first candidate. It was installed and tested, then removed. Evidence:

| Step | Result |
|---|---|
| `npm install remotion @remotion/{cli,renderer,bundler} react react-dom` (4.0.541) | ✅ installs from npm (255 packages) |
| `@sparticuz/chromium` | ✅ installs, extracts a 209 MB binary to `/tmp/chromium` |
| `npx remotion render … --browser-executable=/tmp/chromium` | ❌ `Failed to launch the browser process` |
| Root cause (`ldd`) | `libnspr4.so`, `libnss3.so`, `libnssutil3.so` not found |
| Fix via apt | ❌ `deb.debian.org` unreachable, no ffmpeg/nss candidates |
| Fix by building NSS/NSPR from source | ❌ no `autoconf`, `automake`, `libtool`, `m4`; autotools not installable without the Debian mirror |
| Fix via browser CDNs (Playwright/Puppeteer/chrome-for-testing) | ❌ `cdn.playwright.dev`, `storage.googleapis.com` blocked |

So Remotion is **blocked in this environment by three missing shared libraries**, not by Remotion itself. The packages were uninstalled afterwards so the repo does not ship 450 MB of dependencies it cannot use.

**This does not close the door.** The scene contract (`schemas/scene.schema.json`) is renderer-agnostic on purpose. On any machine with those libraries — or with working apt — the Remotion backend can be added as `apps/renderer/remotion/` and selected with a flag, without touching scene data, audio mixing or episode orchestration.

---

## 2. Why SVG + resvg

* `@resvg/resvg-js` ships a **prebuilt native binary** — no system libraries, no build step.
* Flat-vector 2.5D artwork is exactly what SVG rasterises well and cheaply.
* Deterministic: the same SVG + same fonts produce byte-identical pixels on any machine, which makes renders reproducible artefacts instead of one-off outputs.
* Text is rendered from fonts vendored through the `dejavu-fonts-ttf` npm package, so subtitles do not depend on system fonts.

---

## 3. Measured benchmark (2 vCPU, 1280×720, 24 fps)

| Implementation step | ms / frame | RTF |
|---|---|---|
| v1: resvg → PNG → disk → ffmpeg | 355 | 8.5 |
| v2: resvg → raw RGBA → ffmpeg stdin (removes PNG encode + disk writes) | 161 | 3.9 |
| v2 + no `clipPath` (the SVG viewport already clips; −36 ms) | 161 | 3.9 |
| v2 + `image-rendering=optimizeSpeed` on the background (nearest neighbour) | 65 | 1.6 |
| **Full episode render as shipped (v2, quality sampling, encode included)** | **≈205** | **≈5.0** |

Actual end-to-end result for episode `ep-001` (34.75 s of video, 2 scenes, 835 frames, 3.8 MB):

```
sc-001: 18.46s rendered in 92.6s (rtf 5.02)
sc-002: 16.29s rendered in 80.0s (rtf 4.91)
final:  3.8 MB, h264 1280x720 24fps + aac 22050 Hz mono, mean −16.8 dB / peak −1.3 dB
```

Interpretation: a 2-minute episode costs roughly **10 minutes** on 2 vCPU. That is acceptable for offline production; it is not acceptable for interactive preview, which is why `render:preview` exists (one frame in <1 s).

Every optimisation above was found by measurement, and the numbers are reproducible with `--debug-overlay` + `render:preview`.

### Knobs

| Flag | Effect |
|---|---|
| `--fast-bg` | nearest-neighbour background sampling: ~2.5× faster, minor edge aliasing on the backdrop |
| `--debug-overlay` | burns scene id, frame, time and camera state into the frame |
| `--scene sc-001` | render a single scene |
| `render:preview --at 9` | single PNG frame, seconds |

---

## 4. What the rig supports today

* Animations: `idle`, `walk`, `run`, `jump`, `talk`, `wave`, `laugh`, `cry`, `surprise` — driven by `animationState(animationId, t)`.
* Face: blinking, mouth opening tied to `talk`/`laugh`/`surprise`, tears for `cry`.
* Arms: per-side raise with correct SVG rotation sign (a downward arm rotates **inward** for positive angles — this was a real bug that crossed the arms over the chest).
* Walking legs with hip pivot and shoes; ground shadow anchored to the walk surface.
* Entrance fades (`entranceAt`), z-ordering by `position.z`, per-instance scale and facing.
* Camera: multi-keyframe interpolation (`x`, `y`, `zoom`) with smoothstep easing, applied to the whole world; background overscan 1.15× so pans never reveal an edge.
* Subtitles: bottom-anchored, wrapped, timed from the scene, kept inside the YouTube Kids safe area.

**Placeholder, not final art.** Characters are drawn from their palette as an articulated rig (head/body/limbs). This is deliberate: a rig is the thing that replaces sprites later, and it proves animation + placement + camera work before any character art exists. When final art arrives, each rig part becomes an image layer and the transform code stays.

---

## 5. Known limits (do not claim otherwise)

* No camera rotation, motion blur, depth of field, or particle effects.
* No 3D transforms; 2.5D is faked with layer order, scale and camera pan/zoom.
* Props are procedural silhouettes (tree, rock, house, flower, bench, ball) — not the final prop art.
* Text uses DejaVu only; no custom title fonts yet.
* Frame rate must be constant; variable frame timing is not supported.
* Audio is mono 22 050 Hz in the master pipeline; a stereo master would need a config change and a re-benchmark.

---

## 6. Adding a Remotion backend later

1. `npm i remotion @remotion/{cli,renderer,bundler} react react-dom` on a machine where Chromium can start.
2. Add `apps/renderer/remotion/` exporting one composition that accepts the same `{scene, world, characters, episode}` props.
3. Add `--backend=remotion` to `scripts/episode/render.mjs`; both backends must emit the same silent MP4 contract so audio mixing and concatenation stay unchanged.
4. Run `render:preview` for both backends on the same frame and diff the images before switching.
