// Shared implementation for engines whose *code* may be installable but whose
// *weights* cannot be obtained from this environment's allowed hosts.
//
// These adapters deliberately refuse to synthesise. A silent fallback to another
// engine would corrupt voice identity across episodes (brief §5), so the failure is
// loud, typed and carries remediation steps.
import { probeProcess, which } from '../../../scripts/lib/proc.mjs';
import { exists } from '../../../scripts/lib/paths.mjs';
import { StudioError } from '../../../scripts/lib/log.mjs';

export function makeWeightsGatedAdapter(spec) {
  const meta = {
    id: spec.id,
    displayName: spec.displayName,
    kind: spec.kind,
    productionEligible: spec.productionEligible ?? false,
    qualityTier: spec.qualityTier,
    supportsLanguages: spec.supportsLanguages ?? [],
  };

  async function probe() {
    const python = (await which('python3')) ?? (await which('python'));
    const codePresent = python
      ? (
          await probeProcess(python, [
            '-c',
            `import importlib.util,sys; sys.exit(0 if importlib.util.find_spec(${JSON.stringify(spec.pythonModule)}) else 1)`,
          ])
        ).ok
      : false;

    const weightsPath = spec.weightsEnv ? process.env[spec.weightsEnv] : undefined;
    const weightsPresent = weightsPath ? await exists(weightsPath) : false;

    let status = 'blocked-no-weights';
    let detail = spec.blockedReason;
    if (weightsPresent) {
      status = 'weights-present-unverified';
      detail = `weights found at ${weightsPath}; run a CPU benchmark before assigning production voices`;
    } else if (!python) {
      status = 'blocked-no-python';
      detail = 'python3 not available';
    } else if (!codePresent) {
      detail = `python package '${spec.pythonModule}' not installed and model weights unreachable (${spec.weightsEnv ?? 'n/a'})`;
    }

    return {
      available: false,
      status,
      detail,
      codeInstalled: codePresent,
      python,
      weightsEnv: spec.weightsEnv ?? null,
      weightsPresent,
      remediation: spec.remediation,
    };
  }

  async function synthesize(job) {
    throw new StudioError(
      `engine '${spec.id}' cannot synthesise: model weights are not available in this environment`,
      {
        code: 3,
        details: { status: 'blocked-no-weights', blockedReason: spec.blockedReason },
        hint: spec.remediation,
      },
    );
  }

  return { meta, probe, synthesize };
}
