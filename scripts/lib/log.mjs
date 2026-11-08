// Lightweight structured logger + process-level error trapping for all studio scripts.
// Keeps every command's output machine-greppable: "INFO ", "WARN ", "ERROR", "OK   ".
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };
const threshold = LEVELS[process.env.STUDIO_LOG_LEVEL ?? 'info'] ?? LEVELS.info;

const paint = (code, s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);

function emit(level, tag, msg, extra) {
  if (LEVELS[level] < threshold) return;
  const line = `${tag} ${msg}`;
  const stream = LEVELS[level] >= LEVELS.error ? process.stderr : process.stdout;
  stream.write(extra === undefined ? `${line}\n` : `${line} ${JSON.stringify(extra)}\n`);
}

export const log = {
  debug: (m, e) => emit('debug', paint('90', 'DEBUG'), m, e),
  info: (m, e) => emit('info', paint('36', 'INFO '), m, e),
  ok: (m, e) => emit('info', paint('32', 'OK   '), m, e),
  warn: (m, e) => emit('warn', paint('33', 'WARN '), m, e),
  error: (m, e) => emit('error', paint('31', 'ERROR'), m, e),
  step: (m) => emit('info', paint('35', 'STEP '), m),
  plain: (m = '') => process.stdout.write(`${m}\n`),
};

/** Error carrying an exit code and an actionable remediation hint. */
export class StudioError extends Error {
  constructor(message, { code = 1, hint, details } = {}) {
    super(message);
    this.name = 'StudioError';
    this.code = code;
    this.hint = hint;
    this.details = details;
  }
}

/** Wrap a script body so failures always exit non-zero with a clear message. */
export async function run(main) {
  try {
    const code = await main();
    process.exitCode = typeof code === 'number' ? code : 0;
  } catch (err) {
    if (err instanceof StudioError) {
      log.error(err.message);
      if (err.details) log.error('details:', err.details);
      if (err.hint) log.warn(`hint: ${err.hint}`);
      process.exitCode = err.code;
    } else {
      log.error(err?.stack ?? String(err));
      process.exitCode = 1;
    }
  }
}
