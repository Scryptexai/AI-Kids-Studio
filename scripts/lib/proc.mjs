// Child-process wrapper with hard timeout, captured output and structured errors.
// Used for every external engine call (espeak-ng, python CLIs, ffmpeg).
import { spawn } from 'node:child_process';
import { StudioError } from './log.mjs';

export function runProcess(cmd, args = [], opts = {}) {
  const { timeoutMs = 120_000, cwd, env, input, maxBuffer = 8 * 1024 * 1024 } = opts;
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      if (stdout.length < maxBuffer) stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      if (stderr.length < maxBuffer) stderr += d.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(
        new StudioError(`failed to spawn ${cmd}: ${err.message}`, {
          hint: `check that ${cmd} is installed and executable (npm run doctor)`,
        }),
      );
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const result = {
        cmd,
        args,
        code,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
      };
      if (timedOut) {
        reject(
          new StudioError(`${cmd} exceeded timeout of ${timeoutMs}ms`, {
            details: { stderr: stderr.slice(-1500) },
            hint: 'increase --timeout or reduce the input length',
          }),
        );
      } else if (code !== 0) {
        reject(
          new StudioError(`${cmd} exited with code ${code}`, {
            details: { stderr: stderr.slice(-1500), stdout: stdout.slice(-500) },
          }),
        );
      } else {
        resolve(result);
      }
    });

    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

/** Like runProcess but resolves `{ok:false}` instead of throwing — for probing. */
export async function probeProcess(cmd, args = [], opts = {}) {
  try {
    const r = await runProcess(cmd, args, { timeoutMs: 15_000, ...opts });
    return { ok: true, ...r };
  } catch (err) {
    return { ok: false, error: err.message, details: err.details };
  }
}

export async function which(bin) {
  const r = await probeProcess('sh', ['-c', `command -v ${JSON.stringify(bin)}`]);
  if (!r.ok) return null;
  const p = r.stdout.trim().split('\n').pop();
  return p || null;
}
