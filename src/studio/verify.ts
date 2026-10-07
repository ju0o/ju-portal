/**
 * JU Portal Studio — Verify gates.
 *
 * Runs the real, committed quality gates and reports each as PASS/FAIL:
 *   BUILD   -> npm run build          (verify-registry + build-static + render)
 *   TEST    -> tsx --test tests/*     (the committed test suite, no mock)
 *   REGISTRY-> node scripts/verify-registry.mjs
 *   LINES   -> node scripts/verify-links.mjs
 *
 * Test is run with the local tsx binary (npx --no-install) on the explicit test
 * file list — this avoids `npm test`'s pretest rebuild so BUILD and TEST stay
 * independent gates. TEST depends on a fresh dist, so the Studio runs BUILD
 * first.
 *
 * An optional `runner` is accepted purely for tests so the four gates can be
 * driven deterministically offline (the network LINKS gate cannot pass in a
 * sandboxed runner). Production uses the real `runCommand`.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runCommand, type CommandResult } from './proc';

export type Runner = typeof runCommand;

export interface GateResult { ok: boolean; output: string; durationMs: number; code: number; }
export interface VerifyReport {
  tsxAvailable: boolean;
  build: GateResult;
  test: GateResult;
  registry: GateResult;
  links: GateResult;
  allPass: boolean;
}

export function runVerify(cwd: string, runner: Runner = runCommand): VerifyReport {
  const tsxAvailable = existsSync(join(cwd, 'node_modules', '.bin', 'tsx'));

  const report: VerifyReport = {
    tsxAvailable,
    build: { ok: false, output: '', durationMs: 0, code: -1 },
    test: { ok: false, output: '', durationMs: 0, code: -1 },
    registry: { ok: false, output: '', durationMs: 0, code: -1 },
    links: { ok: false, output: '', durationMs: 0, code: -1 },
    allPass: false,
  };

  // 1. BUILD (also populates dist for TEST and the Preview flow).
  report.build = runner('npm', ['run', 'build'], cwd, { timeoutMs: 240000 });

  // 2. TEST — the real suite, no pretest rebuild.
  if (report.build.ok && tsxAvailable) {
    const files = readdirSync(join(cwd, 'tests'))
      .filter((f) => f.endsWith('.test.mjs'))
      .map((f) => 'tests/' + f);
    report.test = runner('npx', ['--no-install', 'tsx', '--test', '--test-concurrency=1', ...files], cwd, { timeoutMs: 240000 });
  } else if (!tsxAvailable) {
    report.test = { ok: false, output: 'tsx not installed (npm install needed)', durationMs: 0, code: 127 };
  } else if (!report.build.ok) {
    report.test = { ok: false, output: 'BUILD gate failed; TEST skipped', durationMs: 0, code: 1 };
  }

  // 3. REGISTRY — independent verify-registry gate.
  report.registry = runner('node', ['scripts/verify-registry.mjs'], cwd, { timeoutMs: 120000 });

  // 4. LINKS.
  report.links = runner('node', ['scripts/verify-links.mjs'], cwd, { timeoutMs: 180000 });

  report.allPass = report.build.ok && report.test.ok && report.registry.ok && report.links.ok;
  return report;
}

export type { CommandResult };
