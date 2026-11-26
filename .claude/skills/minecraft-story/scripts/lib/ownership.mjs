// Shared helpers for ownership: load ownership.json, match globs, split a path into (project dir, relative path).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const OWNERSHIP = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, "ownership.json"), "utf8"));

const norm = (p) => p.replace(/\\/g, "/");

/** glob → RegExp. `*` = one segment (no '/'), `**` = any number of segments. Case-insensitive (Windows). */
export function globRe(glob) {
  let re = "";
  const g = norm(glob);
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === "*" && g[i + 1] === "*") {
      i++;
      if (g[i + 1] === "/") { i++; re += "(?:.*/)?"; } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i");
}

export const matchAny = (rel, globs) => globs.some((g) => globRe(g).test(rel));

/** the globs an agent may write (its own + its REQUESTS file) */
export function ownGlobs(agent) {
  const a = OWNERSHIP.agents[agent];
  if (!a) return null;
  return [...a.own, `REQUESTS/${agent}__*.md`];
}

/** split an absolute/relative path into { project, rel } where project = .../projects/<slug>; null when outside */
export function splitProject(p) {
  const abs = norm(path.resolve(p));
  const m = abs.match(/^(.*\/projects\/[^/]+)\/(.+)$/i);
  if (!m) return null;
  return { project: m[1], rel: m[2] };
}

/** which agents own `rel` (among `agents`, default all) */
export function ownersOf(rel, agents = Object.keys(OWNERSHIP.agents)) {
  return agents.filter((a) => matchAny(rel, ownGlobs(a)));
}
