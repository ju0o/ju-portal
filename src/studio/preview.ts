/**
 * JU Portal Studio — Preview (build) runner.
 *
 * Preview always uses the REAL Portal build (`npm run build`) and serves the real
 * `dist/`. There is no mock data. The Studio HTTP server mounts `dist/` under
 * `/preview/` and serves it directly once a build succeeds.
 */
import { runCommand } from './proc';

export interface BuildResult {
  ok: boolean;
  output: string;
  durationMs: number;
  code: number;
}

/** Run the real Portal build from `cwd`. Returns PASS/FAIL + raw output. */
export function runPortalBuild(cwd: string, timeoutMs = 240000): BuildResult {
  return runCommand('npm', ['run', 'build'], cwd, { timeoutMs });
}
