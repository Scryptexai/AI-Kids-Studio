# Judging a dependency without installing it

This document exists because of a real mistake made in this repository, and to stop it
recurring.

## The mistake

The first attempt to answer "can we use Remotion here?" did this:

1. `npm install remotion @remotion/{cli,renderer,bundler} react react-dom @sparticuz/chromium`
2. run `remotion render` with the extracted Chromium
3. see `Failed to launch the browser process`
4. run `ldd` and find `libnss3.so`, `libnspr4.so`, `libnssutil3.so` missing
5. try `apt` (blocked), building NSS from source (no autotools), browser CDNs (blocked)
6. **conclude: Remotion is blocked in this environment**

Step 6 was wrong. The libraries were inside the tarball the entire time. `@sparticuz/chromium`
ships four brotli payloads, and only the first is the browser:

| Payload | Unpacked | Contents |
|---|---|---|
| `bin/chromium.br` | 209.02 MB | the browser binary |
| `bin/al2023.tar.br` | 3.53 MB | `libnss3.so`, `libnspr4.so`, `libnssutil3.so`, `libsoftokn3.so`, `libfreebl3.so`, `libplc4.so`, `libplds4.so`, `libexpat.so.1` |
| `bin/swiftshader.tar.br` | 7.49 MB | `libvk_swiftshader.so`, `libvulkan.so.1`, `libEGL.so`, `libGLESv2.so` |
| `bin/fonts.tar.br` | 0.46 MB | Open Sans |

`chromium.executablePath()` unpacks `chromium.br` only. Decompress `al2023.tar.br`, put its
`lib/` on `LD_LIBRARY_PATH`, and `ldd` reports **0 missing libraries** and the browser starts
as `Chromium 153.0.8010.0`.

Reproduce the whole finding in one command:

```bash
npm run pkg:inspect -- @sparticuz/chromium --brotli
```

## The rule

> **`npm install` failing, or a binary refusing to start, is not evidence that a package is
> unusable. Inspect the artifact: `npm pack`, extract the tarball, decompress the payloads,
> read what is inside. Then decide.**

The same rule applies to PyPI (`pip download`, unzip the wheel, `ldd` the extension modules)
and to any model or tool distribution.

## Tool: `npm run pkg:inspect`

```
npm run pkg:inspect -- <package> [--version X] [--brotli]
```

It packs, extracts, classifies every file (native binary / shared lib / WASM / brotli / JS /
source / data), prints the binaries and compressed payloads by size, optionally decompresses
brotli and lists nested tarballs, and writes `.tools/pkg-inspect/<pkg>/inspection.json`.

Classification is the point: a package whose largest entries are `brotli`/`tar`/`wasm` is
carrying real engine payloads, and those must be opened before any verdict.

## Results for the optional engines

### Chromium / Remotion — usable

| Step | Result |
|---|---|
| tarball unpacked (all four payloads) | ✅ `ldd` → 0 missing |
| `chromium --version` | ✅ `Chromium 153.0.8010.0` |
| one-shot CLI `--headless --screenshot` / `--dump-dom` | ⚠️ hangs — do not use |
| CDP `Page.navigate` + `Page.captureScreenshot` | ✅ PNG produced, DOM readable |
| `remotion render` smoke composition | ✅ 30 frames, valid H.264 |
| Remotion rendering real `sc-001` | ✅ 269 ms/frame (c=1), 198 ms/frame (c=2) |
| Remotion rendering full `ep-001` | ✅ 80.0 s + 69.8 s, 8.5 MB MP4 |

Verdict: **usable**, and shipped as `--backend remotion`. SVG+resvg stays the default purely
on speed (`npm run renderer:bench`). See `docs/RENDERER.md`.

### Blender — two routes, one works

`npm run blender:probe` tests both and reports missing libraries by name.

| Route | Result |
|---|---|
| **native** — PyPI `bpy` wheel (5.0.1, cp311 manylinux, 374 MB) | ❌ imports fail: `libXrender.so.1`, `libXfixes.so.3`, `libXi.so.6`, `libxkbcommon.so.0`, `libSM.so.6`, `libICE.so.6`, `libGL.so.1` not found |
| where those libs could come from | ❌ not on npm (`libX11`/`libXrender`/`xkbcommon` searches return JS clients, not libraries); not on PyPI; no apt in this image |
| **wasm** — npm `@volter/blender-engine` (Blender **5.2.0 LTS**, EEVEE, GPL-3.0-or-later) | ✅ unpacks (18.4 MB wasm + 8.0 MB data) and **boots in 1.3 s** in Node, exposing `_blender_web_exec`, `_blender_web_export_frame`, `_blender_web_export_buffer`, `_blender_web_session_alive`, plus an Emscripten `FS`/`HEAPU8` |
| caveat | the execute path is an RPC surface for the package's own worker/session protocol; calling `_blender_web_exec` directly returned a non-zero status and `session_alive() === 0`. Booting is proven, **scripted rendering is not** |

Verdict: **not needed, and not yet proven for rendering.** Blender is an optional later stage;
the 2.5D renderer does not depend on it. The viable route if it is ever wanted is the WASM
build driven through its worker protocol, not the native wheel.

### Godot — no Linux binary exists

| Route | Result |
|---|---|
| npm `@ringozz/godot` 4.7.2-685 | ❌ `main` points at `src/index.ts` (raw TypeScript). Node refuses: *"Stripping types is currently unsupported for files under node_modules"*. Optional native deps are **macos-arm64, windows-x86_64, web-wasm32 only** — no linux-x64. |
| npm `@ringozz/godot-web-wasm32` | ✅ real Godot 4.7.2 wasm build (24.1 MB, 9 files: `godot.web.template_release.wasm32.nothreads.wasm` + JS) — browser/WASM target only |
| native Linux editor/headless build | ❌ not published to npm; the official binaries live on `downloads.tuxfamily.org` / `github.com/godotengine/godot-builds/releases`, outside this sandbox's allowlist |

Verdict: **not available as a native tool here.** Consistent with the standing decision that
Godot is a later optional stage and must never be assumed installable.

## What this changes

* `docs/RENDERER.md` now states the corrected finding and keeps both backends.
* `scripts/lib/chromium.mjs` performs the full unpacking and verifies the three libraries.
* `tests/chromium.test.mjs` fails loudly if a future version of the package stops shipping
  the library payload.
* `npm run pkg:inspect` makes the inspection step cheap enough that skipping it is a choice,
  not an accident.
