#!/usr/bin/env bash
# Idempotent bootstrapper for claude-shorts-skills in AI-Kids-Studio.
# Ensures ~/.claude/{skills,agents}, /usr/local/bin/{ffmpeg,ffprobe}, .venv,
# and engines/minecraft dependencies are ready and pass doctor.mjs (0 FAIL).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# 1. Python venv + ffmpeg
if [ ! -x ".venv/bin/python" ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r requirements.txt
fi
FFMPEG_BIN="$(.venv/bin/python -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')"
sudo ln -sf "$FFMPEG_BIN" /usr/local/bin/ffmpeg

# 2. Static ffprobe in /usr/local/bin/ffprobe
if ! command -v ffprobe >/dev/null 2>&1; then
  mkdir -p /home/user/.ffprobe-bin
  npm --prefix /home/user/.ffprobe-bin install --silent @ffprobe-installer/ffprobe
  FFPROBE_BIN="$(node -e "console.log(require('/home/user/.ffprobe-bin/node_modules/@ffprobe-installer/ffprobe').path)")"
  sudo ln -sf "$FFPROBE_BIN" /usr/local/bin/ffprobe
fi

# 3. Link ~/.claude/skills -> repo .claude/skills & install 9 subagents
mkdir -p /home/user/.claude
rm -rf /home/user/.claude/skills
ln -s "$REPO_ROOT/.claude/skills" /home/user/.claude/skills
node /home/user/.claude/skills/minecraft-story/scripts/install.mjs

# 4. Install engines/minecraft npm packages if missing
if [ ! -d "$REPO_ROOT/engines/minecraft/node_modules" ]; then
  (cd "$REPO_ROOT/engines/minecraft" && npm install --no-audit --no-fund)
fi

# 5. Verify doctor.mjs
node /home/user/.claude/skills/minecraft-story/scripts/doctor.mjs
