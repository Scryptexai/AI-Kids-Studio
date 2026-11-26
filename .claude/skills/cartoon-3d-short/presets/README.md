# Motion presets

Reusable motion for cartoon-3D shorts, taken from the Mob Farm hook (r8-r11, 2026-11-13).
- **How plans use it:** a Director plan names these presets instead of inventing motion. The draft's
  `shots[].presets` is expanded by `src/director/director/presets.ts` into `minecraft/direction.src.json`.
- **Tests:** `src/director/test/minecraft-presets.test.ts` keeps the files in step with the renderer:
  - the faces match toon.ts;
  - every action is one McShort performs;
  - every ease exists.
- **Details:** see `bible/modes/minecraft.md`, "Motion presets", and `REVIEW_RUBRIC.md` for how drafts are judged.
