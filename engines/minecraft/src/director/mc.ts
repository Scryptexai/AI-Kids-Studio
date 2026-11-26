// Minecraft-mode CLI (the voxel-set part of the AI director):
//   node src/director/mc.ts mc-validate <file|dir>  check <set>.voxel.json files against your asset manifest
//   node src/director/mc.ts mc-stage <set>          compile <set>.voxel.json into public/mc-preview/<id>/ (world.json +
//                                                   only the textures it uses; never the whole library)
//   node src/director/mc.ts mc-preview <set>        mc-validate + mc-stage + one PNG still per camera in out/mc-preview/<id>/
// Exit codes: 0 = no errors, 1 = validation errors, 2 = usage or unreadable input.
import { parseArgs } from "node:util";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { validateMinecraftPath, validateVoxelSet, loadManifest } from "./validate/minecraft.ts";
import { stageSet } from "./minecraft/compile.ts";
import { CharactersDoc, EnvironmentsDoc, SCHEMA_VERSION, ValidationReport, type Issue } from "./schema/index.ts";

const REPO = resolve(import.meta.dirname, "..", "..");

const HELP = `usage: npm run mc -- <command> <path> [options]

  mc-validate <path>  check one <set>.voxel.json, or every *.voxel.json in a folder, against the asset manifest
                      (src/director/config/minecraft.json; env MC_MANIFEST overrides)
  mc-stage <set>      compile <set>.voxel.json into public/mc-preview/<id>/ (world.json + the textures it uses)
  mc-preview <set>    mc-validate + mc-stage + one PNG still per camera in out/mc-preview/<id>/<camera>.png

options
  --out <dir>         mc-stage: stage folder (default public/mc-preview/<id>)
  --cam <id>          mc-preview: only this camera (default: every camera of the set)
  --scale <n>         mc-preview: still scale (default 0.5 = 540x960)
  --frame <n>         mc-preview: frame number (animated water/lava; default 0)
  --no-markers        mc-preview: hide the stand-in boxes for mobs, cast and props`;

const SEVERITY = { error: 0, warning: 1, info: 2 } as const;

const buildReport = (issues: Issue[]): ValidationReport => {
  const key = (i: Issue) => [SEVERITY[i.severity], i.location.shotId ?? "~", i.location.eventId ?? "", i.code, i.location.nodeId ?? "", i.location.path ?? "", i.message];
  const sorted = [...issues].sort((a, b) => {
    const x = key(a), y = key(b);
    for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return x[k] < y[k] ? -1 : 1;
    return 0;
  });
  const count = (s: Issue["severity"]) => sorted.filter((i) => i.severity === s).length;
  return ValidationReport.parse({ schemaVersion: SCHEMA_VERSION, kind: "ValidationReport", summary: { errors: count("error"), warnings: count("warning"), info: count("info") }, issues: sorted });
};

const show = (p: string) => relative(process.cwd(), p).split("\\").join("/") || ".";

const summarize = (r: ValidationReport, max = 40) => {
  console.log(`validation: ${r.summary.errors} errors, ${r.summary.warnings} warnings, ${r.summary.info} info`);
  const top = r.issues.filter((i) => i.severity !== "info");
  for (const i of top.slice(0, max)) console.log(`  ${i.severity.padEnd(7)} ${i.code}: ${i.message}`);
  if (top.length > max) console.log(`  ... ${top.length - max} more`);
  return r.summary.errors ? 1 : 0;
};

export const main = async (argv: string[]): Promise<number> => {
  let a;
  try {
    a = parseArgs({
      args: argv, allowPositionals: true,
      options: {
        out: { type: "string" }, help: { type: "boolean", short: "h" },
        cam: { type: "string" }, scale: { type: "string" }, frame: { type: "string" }, "no-markers": { type: "boolean" },
      },
    });
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${HELP}`);
    return 2;
  }
  const [cmd, target] = a.positionals;
  if (a.values.help || !cmd || !target) { console.log(HELP); return cmd ? 2 : 0; }
  try {
    switch (cmd) {
      case "mc-validate": {
        const p = resolve(target);
        const folder = statSync(p).isFile() ? null : p;
        const doc = <T,>(f: string, schema: { parse: (v: unknown) => T }) => (folder && existsSync(join(folder, f)) ? schema.parse(JSON.parse(readFileSync(join(folder, f), "utf8"))) : null);
        const issues = validateMinecraftPath({ path: p, characters: doc("characters.json", CharactersDoc), environments: doc("environments.json", EnvironmentsDoc) });
        console.log(`checked ${show(p)}`);
        return summarize(buildReport(issues));
      }
      case "mc-stage":
      case "mc-preview": {
        const file = resolve(target);
        const set = JSON.parse(readFileSync(file, "utf8")) as { id?: string; cameras?: { id: string }[] };
        const manifest = loadManifest();
        const report = buildReport(validateVoxelSet({ set, document: show(file), manifest }));
        if (report.summary.errors) { console.log(`not staged: ${show(file)} has errors`); return summarize(report); }
        const stageRel = `mc-preview/${set.id}`;
        const stage = a.values.out ? resolve(a.values.out) : join(REPO, "public", stageRel);
        const world = stageSet(set, manifest, stage);
        const n = world.blocks.reduce((s, b) => s + b.positions.length / 3, 0);
        console.log(`staged ${show(file)} -> ${show(stage)} (${world.blocks.length} block types, ${n} visible blocks, ${Object.keys(world.textures).length} textures)`);
        if (cmd === "mc-stage") return summarize(report);
        if (a.values.out) { console.error("mc-preview stages into public/mc-preview/<id>; --out is for mc-stage only"); return 2; }
        const { renderStills } = await import("./minecraft/still.ts");
        const cams = a.values.cam ? [a.values.cam] : world.cameras.map((c) => c.id);
        for (const c of cams) if (!world.cameras.some((w) => w.id === c)) { console.error(`no camera "${c}" in ${set.id}`); return 2; }
        const files = await renderStills({
          stageDir: stageRel, cameras: cams, outDir: join(REPO, "out", "mc-preview", String(set.id)), repo: REPO,
          markers: !a.values["no-markers"], scale: a.values.scale ? Number(a.values.scale) : 0.5, frame: a.values.frame ? Number(a.values.frame) : 0,
        });
        for (const f of files) console.log(`wrote ${show(f)}`);
        return summarize(report);
      }
      default:
        console.error(`unknown command "${cmd}"\n\n${HELP}`);
        return 2;
    }
  } catch (e) {
    console.error(`mc ${cmd}: ${(e as Error).message}`);
    return 2;
  }
};

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
