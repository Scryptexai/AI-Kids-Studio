# scripts/mc — helper pipeline

Tanpa dependency Node (≥ 18). Panggil dengan path absolut, jalankan dari root project (`.rcon.json` dibaca dari cwd).
`SKILL` = `~/.claude/skills/minecraft-story`.

| File | Fungsi |
|---|---|
| `rcon.mjs` | Client RCON + CLI. `node SKILL/scripts/mc/rcon.mjs "time set day"`, `--file <x>.mcfunction`, `--check`. Balasan error dari server dihitung gagal (`failureOf`) |
| `shot.mjs` | Eksekusi satu `shots/<shot>.json` **hasil compile**. Default dry-run, `--run` untuk kirim. Berhenti di command pertama yang ditolak server |
| `scarpet/crowd.sc` | Kerumunan mob: `wander` (AI asli, ada radius dalam), `march` (barisan), `stop`, `clear` |
| `scarpet/wall.sc` | Tembok lingkaran bertahap + bibir tembok |
| `scarpet/env.sc` | Api, obor, air, drain |
| `scarpet/actor.sc` | Entity jalan lewat waypoint, satu `follow` per aktor, boleh beberapa sekaligus (cari entity lewat nama = id aktor) |

## Setup sekali per project

1. Copy app yang dipakai ke server: `<server>/config/carpet/scripts/`.
2. Isi `.rcon.json` di root project:
   ```json
   { "host": "127.0.0.1", "port": 25575, "password": "ganti-ini",
     "tick_freeze": "tick freeze on", "tick_unfreeze": "tick freeze off" }
   ```
   `tick_freeze` / `tick_unfreeze` = command yang dipakai `shot.mjs` (default `tick freeze` / `tick unfreeze`). Di Carpet 1.20.1 `tick freeze` polos adalah toggle, jadi isi dengan bentuk eksplisit yang berfungsi di servermu (`/tick freeze status` untuk mengecek).
3. Tes: `node SKILL/scripts/mc/rcon.mjs --check` → harus balas daftar player.

## Urutan satu shot

```powershell
node ~/.claude/skills/minecraft-story/scripts/compile_shots.mjs projects/<slug>
node ~/.claude/skills/minecraft-story/scripts/mc/shot.mjs projects/<slug>/shots/s12.json --dry
node ~/.claude/skills/minecraft-story/scripts/mc/shot.mjs projects/<slug>/shots/s12.json --run --only prep
# (inspeksi framing manual — dunia beku)
# mulai rekam ReplayMod, lalu:
node ~/.claude/skills/minecraft-story/scripts/mc/shot.mjs projects/<slug>/shots/s12.json --run --only take
```

`prep` = `pre,build,actors,load`. `pre` dibuka dengan `forceload add` (chunk set). `take` = unfreeze lalu semua panggilan scarpet. Tanpa unfreeze, mob dan `__on_tick` diam.

## Satu-satunya cara memanggil scarpet

```
/script load crowd
/script in crowd run wander('minecraft:villager',5,[0,65,0],6,2)
/script in crowd run clear()
```
Isi SEMUA argumen fungsi (scarpet menolak jumlah argumen yang kurang). Kalau ada error, cek log server — scarpet menulis nama file + baris.
Jangan pakai `script run call('app','fn')` (call() tidak bisa memanggil app lain) atau `script run 'app.fn()'` (hanya string, tidak menjalankan apa pun).

## Status uji app scarpet

Tes Node (`tests/run_tests.mjs`) tidak menjalankan Minecraft. App di `scarpet/` **harus dites di game** (SKILL.md Step 0.5 langkah 6) sebelum dipakai untuk take. Yang perlu diperhatikan saat tes:
- trigonometri scarpet memakai derajat (sudah dipakai di semua app),
- `global_actors += e` (append) dan `modify(e, 'remove')` di `crowd.sc`,
- `modify(e, 'yaw', …)` untuk arah hadap di `crowd.sc` (march) dan `actor.sc`,
- `spawn(type, pos, '{Tags:["mcs_actor"],PersistenceRequired:1b}')`.
Kalau salah satu ditolak versi Carpet-mu, error-nya muncul di log server dan `shot.mjs` menandai take sebagai `ERR`.

**Hasil uji di game 2026-11-24** (Carpet 1.20-1.4.112, server uji lokal, lewat RCON, 14/14 lolos):
- `crowd.wander` 12 villager tersebar (jarak min 2.3, radius 3.2–7.9), tag `mcs_actor` + `PersistenceRequired`; `clear()` menghapus semua.
- `crowd.march` 6 mob bergerak ke +x (4.4 blok / 2 s), yaw −90 (menghadap arah jalan).
- `wall.ring_now` r10 h4 lip1 → 294 blok, lingkaran tanpa celah; `ring` berikutnya kembali ke 8 blok/tick.
- `env.torches` grid 2×2 = 4 obor; `env.ignite` 10/10 api.
- `actor.follow` aktor NoAI bergerak +x, yaw −90; nama salah → `actor not found`.
- `tick freeze on` / `tick freeze off` berfungsi; `tick unfreeze` DITOLAK server → isi `.rcon.json`.
- **Difficulty peaceful**: mob hostile (pillager, zombie, dll.) langsung hilang setelah `spawn` — `march` tetap mengembalikan 6 tapi tidak ada yang hidup. Cerita dengan mob hostile butuh `difficulty easy` (atau lebih). → server uji diubah ke **easy** 2026-11-24 (`doMobSpawning false`, jadi tidak ada spawn liar); pillager march 6/6 hidup.
- Belum diuji: `env.water`, `env.drain`, gerak kaki aktor NoAI di render (lihat Catatan).

## Catatan

- `march` memakai pos+motion, bukan pathfinding. Close-up bisa terlihat sliding → pakai `wander` atau BBS.
- `wall` menaruh 8 blok/tick. Naikkan `global_bpt` untuk build instan, turunkan untuk timelapse lebih lambat.
- Di `shots/<shot>.json` hasil compile semua posisi sudah koordinat world nyata (compile mengubah anchor + offset; anchor = tengah blok).
- Mob aktor di-summon `NoAI`. `actor.sc` tetap bisa menggerakkannya (memindah posisi tiap tick), tapi animasi kaki bisa tidak jalan — untuk jalan di close-up pakai BBS.
