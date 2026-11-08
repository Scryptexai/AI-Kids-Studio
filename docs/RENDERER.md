# Renderer (P4)

Scene JSON → frames → H.264/AAC MP4, CPU-only. Two interchangeable backends:

```
scene.json + world.json + characters/*.json
        │
        ├── backend "svg" (default)
        │     buildSceneSvg()  pure function: scene + t → SVG
        │       ├── background plate (location, camera pan/zoom)
        │       ├── props (procedural until final art exists)
        │       ├── characters   (rig; animation state per t)
        │       └── subtitle     (timed from the scene's subtitle track)
        │     resvg (Rust, prebuilt) → raw RGBA   ~160 ms/frame @1280x720 / 2 vCPU
        │
        ├── backend "remotion" (Chromium + React — verified working, see §1)
        │     Scene.jsx, same animationState()/cameraAt(), rendered via CDP
        │     ~198 ms/frame with two concurrent renderers
        │
        ├── ffmpeg rawvideo → libx264 (veryfast, crf 20, yuv420p)
        ├── ffmpeg audio mix (dialogue placed by startSec + ambience, EBU R128 −16 LUFS)
        └── ffmpeg concat (stream copy, no re-encode)
```

---

## 1. Chromium and Remotion: corrected finding

An earlier version of this document claimed Remotion was **blocked** in this environment by
missing shared libraries. That conclusion was **wrong**, and the error was in the method: it
was reached after `npm install` and a launch attempt, without ever opening the npm tarball to
see what it actually ships. `@sparticuz/chromium` does not merely contain a browser binary —
it contains the browser's system libraries as well.

### What the tarball contains

`npm pack @sparticuz/chromium@153.0.0` → 69,995,309 bytes, four brotli payloads:

| Payload | Size | Contents |
|---|---|---|
| `bin/chromium.br` | 67.0 MB | the browser binary (209 MB unpacked) |
| `bin/al2023.tar.br` | 1.21 MB | Amazon Linux 2023 libs: **`libnss3.so`, `libnspr4.so`, `libnssutil3.so`**, `libsoftokn3`, `libfreebl3`, `libplc4`, `libplds4`, `libexpat.so.1` |
| `bin/swiftshader.tar.br` | 1.64 MB | `libvk_swiftshader.so`, `libvulkan.so.1`, `libEGL.so`, `libGLESv2.so` |
| `bin/fonts.tar.br` | 184 KB | Open Sans |

The three libraries reported as missing were **inside the second payload the whole time**.
`chromium.executablePath()` only unpacks `chromium.br`, which is why the naive path fails.
Unpack `al2023.tar.br` too, export `LD_LIBRARY_PATH`, and the browser starts.

### Reproduced results

| Step | Result |
|---|---|
| decompress all four payloads into `.tools/chromium` | ✅ automated in `scripts/lib/chromium.mjs` |
| `ldd chromium` with `LD_LIBRARY_PATH=.tools/chromium/lib` | ✅ **0 not found** |
| `chromium --version` | ✅ `Chromium 153.0.8010.0` |
| one-shot CLI `--headless --screenshot` / `--dump-dom` | ⚠️ hangs — avoid this path |
| **CDP**: `--remote-debugging-port` + `Page.navigate` + `Page.captureScreenshot` | ✅ page rendered, text read back, PNG produced |
| `remotion render` smoke composition (30 frames, 640×360) | ✅ 42 s cold, valid H.264 |
| **Remotion rendering the real `sc-001`** (72 frames, 1280×720) | ✅ 19.4 s render (269 ms/frame) |
| **Full `ep-001` through Remotion** (2 scenes, 835 frames) | ✅ 80.0 s + 69.8 s, 8.5 MB MP4 |

**Lesson recorded here so it is not repeated: a failed `npm install` or launch is not evidence
that a package is unusable. `npm pack`, extract the tarball, and look inside.**

### Why SVG + resvg is still the default

Remotion works and is worth keeping for effects that are awkward in a bespoke renderer (DOM/CSS
transforms, filters, complex text layout). It is not the default, for measured reasons:

| | SVG + resvg | Remotion |
|---|---|---|
| Render speed, 1280×720, same scene | **95 ms/frame** | 198 ms/frame (c=2), 269 (c=1) |
| Real-time factor | **~5.0×** | ~0.5× (c=2) |
| Cold start | ~0.2 s | 3.6 s bundle (41 s on first ever run) |
| Peak RSS | ~250 MB | ~900 MB (browser + node) |
| Dependencies | 1 prebuilt native module | 236 packages + 209 MB browser |
| Determinism | byte-identical output | pixel-stable, encoder-dependent |
| Failure surface | small | Chromium sandbox, GL, fonts, dev shm |

A 2-minute episode: **~10 minutes** with SVG, roughly an hour with Remotion on this hardware.
Both are offline-production viable; only one is pleasant. The numbers are reproducible with
`npm run renderer:bench` and are stored in `renders/bench/bench-sc-001.json`.

The scene contract stays renderer-agnostic and both backends read the same data, so this is a
switch, not a fork:

```bash
npm run episode:render -- --episode ep-001                        # svg (default)
npm run episode:render -- --episode ep-001 --backend remotion     # browser pipeline
npm run renderer:bench -- --scene sc-001 --seconds 3              # A/B both
```

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

Cross-backend comparison, identical 3-second slice of `sc-001`, same machine:

| Backend | Wall | Bundle | Render | ms/frame (render only) | Output |
|---|---|---|---|---|---|
| svg (quality sampling) | 7.0 s | — | 6.8 s | **95** | 0.13 MB |
| remotion, concurrency 1 | 62.5 s | 41.5 s (cold) | 19.4 s | 269 | 0.19 MB |
| remotion, concurrency 2 | 19.0 s | 3.6 s (warm) | 14.3 s | **198** | 0.19 MB |

A frame-by-frame comparison at t=2.0 s shows both backends produce the same composition: same
character placement, framing and subtitle box.

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
| `--backend svg\|remotion` | frame backend (default `svg`) |
| `--concurrency N` | Remotion renderer parallelism (default 1; 2 suits 2 vCPU) |
| `renderer:bench` | timed A/B of both backends on one scene slice |
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

## 6. Remotion backend (implemented)

`apps/renderer/remotion/` is a real backend, not a plan:

* `Root.jsx` — one `KidsScene` composition; `calculateMetadata` reads duration/fps/size from props.
* `Scene.jsx` — React/SVG reimplementation of rig, camera, props and subtitles, importing the
  *same* `animationState()` and `cameraAt()`, so motion matches by construction.
* `render.mjs` — bundling, `selectComposition`, `renderMedia`, returning the same
  `{outputPath, frames, renderMs, avgFrameMs}` contract as the SVG backend.

Requirements and notes:

1. `npm install remotion @remotion/{cli,renderer,bundler} react react-dom @sparticuz/chromium`
2. `scripts/lib/chromium.mjs` unpacks **all four** payloads (the step that was missed before),
   verifies the libraries exist and writes `.tools/chromium/version.json`.
3. `FONTCONFIG_FILE` is generated pointing at `dejavu-fonts-ttf` plus the tarball font payload,
   so both backends use the same subtitle faces.
4. Drive it through CDP (`renderMedia`), never the one-shot CLI screenshot flags.
5. Diff `render:preview` output from both backends before switching production over.
