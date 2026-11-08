# Internal production dashboard (P3)

```bash
npm run studio          # http://0.0.0.0:4173
```

An internal casting console. It is **not** a product, not a SaaS, and not a kids app: it exists so
a director can audition voices, compare candidates and approve a profile without hand-editing
`audio/voices/registry.json`. Bind `0.0.0.0` because the sandbox preview proxy reaches it that way.

No build step, no bundler, no framework — Node's `http` server plus one HTML page. The server
imports `scripts/lib/*`, so the GUI and the CLI cannot drift apart: the same approval gates,
the same quality checks, the same registry writer.

---

## Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/state` | characters, profiles, engines (live probe), policy, revision |
| GET | `/api/engines` | fresh engine probe |
| GET | `/api/character/:id` | one character + its candidates |
| GET | `/api/auditions/:id` | candidates on disk, backfilled with real measurements |
| POST | `/api/audition` | render N variants of the audition text |
| POST | `/api/approve` | approve a candidate |
| POST | `/api/reject` | reject a draft |
| POST | `/api/migrate` | engine change: version+1, alias preserved, A/B recorded |
| GET | `/audio/<path>` | stream generated WAV/MP3 |

## What the screen gives you

* **Character Library** — one row per character with its permanent alias and current status.
* **Engines** — live probe. `ready`, `blocked-no-weights`, `needs-configuration` come from the
  adapter itself, never from a hardcoded list. Production-eligible engines are badged `prod`.
* **Voice Profile** — alias, version, status, engine/model/speaker, approval, quality figures.
* **Audition** — pick engine + speaker, edit the text, generate three candidates, play them.
  Only one clip plays at a time. All candidates use the **same sentence**, so the comparison
  answers "which character is this?" rather than "which number sounds nicer?".
* **Approval** — requires a name and passes the quality gate. Approved profiles are immutable.
* **History** — append-only event log read straight from the registry.

## Rules the code enforces

These are not UI hints; each one throws and the write is aborted.

| Rule | Where |
|---|---|
| Only a production-eligible engine can produce an approved profile | `approveVoice()` checks `voicePolicy.productionEngines` |
| Approval must name a person | `approvedBy` required, recorded in `history` |
| Silent or too-short audio cannot be approved | `inspectCandidate()` — rms, peak, duration |
| An approved profile cannot be silently re-cast or rejected | `rejectCandidate()` refuses approved; `approveVoice()` refuses a different engine |
| Engine changes keep the alias and bump the version | `migrate()` — records `from`/`to` for the A/B |
| Registry writes are snapshotted first and schema-validated after | `persist()` — writes `audio/voices/history/registry.r<N>.json` |
| A missing profile halts rather than falling back | `findProfile()` throws |

Snapshot naming: `registry.r3.json` contains revision **3**, i.e. the state that was just replaced.
The snapshot is taken before the revision bumps, so the name always matches the contents.

## Verified behaviour

Run against the live server, not asserted from reading code:

```
GET  /api/state                 → 3 characters (all draft), 6 engines probed
POST /api/audition {bobby, espeak}
                                → 3 candidates: 7.62s / 8.62s / 9.51s, rms 0.10–0.12
POST /api/approve {engine:espeak}
                                → 409 "engine 'espeak' is not production-eligible"
POST /api/approve {no approver}
                                → 400 "approvedBy is required: approvals must name a person"
GET  /audio/%2e%2e%2f...%2fetc%2fpasswd
                                → 403 (path traversal blocked)
GET  /                          → 200; page renders, clicking a character loads its profile
```

The dashboard screenshot used for review was captured through CDP against the running server, so
the layout, the live engine badges and the candidate list are all real output.

## What is still missing (honest status)

* **No production engine is approved yet.** Every candidate is eSpeak placeholder audio. The
  approve button is wired and gated correctly, but it cannot succeed until `http-remote` is
  configured (see `docs/VOICE-PIPELINE.md` §4) or a weight-based engine becomes available.
  This is the intended state, not a bug: the gate is doing its job.
* **No A/B player.** Comparing two clips means listening to them sequentially. A side-by-side
  waveform/dual-transport view is the next UI step.
* **No migration UI.** `POST /api/migrate` works and is tested, but the screen only exposes
  approve/reject. Migration is currently a CLI/API action.
* **No authentication.** It binds `0.0.0.0` so the preview proxy can reach it. Keep it internal;
  never deploy it publicly.

## Tests

`tests/casting.test.mjs` — 11 tests over a temporary registry fixture:

* non-production engine refused, registry untouched and revision unchanged
* unnamed approver refused
* silent audio refused with the failing measurements in `details`
* valid approval records alias, checksum, quality, actor and a pre-change snapshot
* migration keeps the alias, bumps the version, records both sides of the A/B
* approved profiles cannot be rejected
* drafts can be rejected and stay re-castable
* unknown character throws instead of falling back to a default voice
* the shipped registry never contains an approved profile without engine and checksum
* `inspectCandidate` returns real measurements
* the dashboard files exist and call the documented routes
