/**
 * JU Portal Studio — shared command runner.
 *
 * `runCommand` runs a child process synchronously and captures combined output.
 * It is used by the Preview/Verify/Publish adapters to shell out to npm/node.
 */
import { spawnSync } from 'node:child_process';

export interface CommandResult {
  ok: boolean;
  code: number;
  output: string;
  durationMs: number;
}

export function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  opts: { timeoutMs?: number } = {},
): CommandResult {
  const start = Date.now();
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    timeout: opts.timeoutMs ?? 180000,
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  const output = (r.stdout ?? '') + (r.stderr ?? '');
  return { ok: r.status === 0, code: r.status ?? -1, output, durationMs: Date.now() - start };
}
