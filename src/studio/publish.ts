/**
 * JU Portal Studio — publish adapter (GIT WRITES).
 *
 * This is the ONLY module that issues git mutations: branch creation, staging,
 * commit, push, and PR creation. It is intentionally isolated from the read-only
 * `git.ts` inspection helpers.
 *
 * EVERY write path is guarded by `STUDIO_ALLOW_GIT`:
 *   - When unset (the default, and the Git-Freeze state) `executePublish` returns
 *     immediately with `{ refused: true, reason: 'GIT_FREEZE_ACTIVE' }` and
 *     performs ZERO git operations.
 *   - Even when allowed, publish is blocked on `REMOTE_MAIN_CHANGED`, failed
 *     verification gates, and an unsafe/dirty state. main is never written to
 *     directly: a dedicated content branch is created and pushed only.
 *
 * The PR is opened with `gh`, which infers the repository from the git remote and
 * uses the Founder's own gh auth. No git credentials, tokens, or .env contents
 * are ever read, embedded, or sent to the browser — this module runs only on the
 * local server process.
 */
import { spawnSync } from 'node:child_process';
import { execGit } from './git';
import type { PublishPlan } from './git';

export interface PublishResult {
  done: boolean;
  refused?: boolean;
  reason?: 'GIT_FREEZE_ACTIVE' | 'REMOTE_MAIN_CHANGED' | 'NOT_PUBLISHABLE' | 'GIT_ERROR';
  message: string;
  branch?: string;
  remote?: string;
  sha?: string;
  pr?: string;
  steps?: string[];
}

export function isGitAllowed(): boolean {
  return process.env.STUDIO_ALLOW_GIT === '1' || process.env.STUDIO_ALLOW_GIT === 'true';
}

/**
 * Execute the publish plan. Safe to call during a Git Freeze: returns a refusal
 * with no git side effects until `STUDIO_ALLOW_GIT` is explicitly enabled.
 */
export function executePublish(cwd: string, plan: PublishPlan): PublishResult {
  if (!isGitAllowed()) {
    return {
      done: false,
      refused: true,
      reason: 'GIT_FREEZE_ACTIVE',
      message: 'GIT FREEZE ACTIVE — Commit/Push disabled. Re-enable with STUDIO_ALLOW_GIT=1.',
    };
  }
  if (plan.remoteMainChanged) {
    return {
      done: false,
      refused: true,
      reason: 'REMOTE_MAIN_CHANGED',
      message: 'REMOTE_MAIN_CHANGED — origin/main moved since last sync. STOP and re-sync manually.',
    };
  }
  if (!plan.publishable) {
    return {
      done: false,
      refused: true,
      reason: 'NOT_PUBLISHABLE',
      message: 'Publish blocked: verification gates failed or tree unsafe. Reasons: ' + plan.reasons.join('; '),
    };
  }

  const steps: string[] = [];
  const branch = plan.branch;
  const remote = 'origin';

  // 1. Create and switch to a dedicated content branch (never main).
  let r = execGit(['switch', '-c', branch], cwd);
  if (r.code !== 0) {
    // branch may already exist from a prior attempt — try switching to it
    r = execGit(['switch', branch], cwd);
    if (r.code !== 0) {
      return { done: false, refused: true, reason: 'GIT_ERROR', message: 'could not create branch: ' + r.stdout, branch };
    }
  }
  steps.push(`branch: ${branch}`);

  // 2. Stage only the changed content files (path-scoped, no traversal risk).
  const staging = ['add', '--'];
  for (const f of plan.changedFiles) staging.push(f);
  r = execGit(staging, cwd);
  if (r.code !== 0) {
    // rollback the branch switch
    execGit(['switch', '-'], cwd);
    return { done: false, refused: true, reason: 'GIT_ERROR', message: 'git add failed: ' + r.stdout, branch };
  }
  steps.push('staged changed content files');

  // 3. Commit (content changes only).
  r = execGit(['commit', '-m', 'Studio: content update', '-m', `Publish branch: ${branch}`], cwd);
  if (r.code !== 0) {
    execGit(['switch', '-'], cwd);
    return { done: false, refused: true, reason: 'GIT_ERROR', message: 'git commit failed: ' + r.stdout, branch };
  }
  const sha = execGit(['rev-parse', 'HEAD'], cwd).stdout.trim();
  steps.push('committed content changes ' + sha);

  // 4. Push the content branch (never force).
  r = execGit(['push', '-u', remote, branch], cwd);
  if (r.code !== 0) {
    execGit(['switch', '-'], cwd);
    return { done: false, refused: true, reason: 'GIT_ERROR', message: 'git push failed: ' + r.stdout, branch, remote, sha };
  }
  steps.push(`pushed ${branch} to ${remote}`);

  // 5. Open a PR against main. `gh` infers the repo from the git remote and uses
  //    the Founder's own gh auth — no token is ever read or embedded here.
  const title = 'Studio: content update ' + branch;
  const body =
    'JU Portal Studio content publish.\n\n' +
    'Changed files: ' + (plan.changedFiles.join(', ') || 'none') + '\n' +
    'Branch: ' + branch + '\n\n' +
    'Opened by JU Portal Studio. Do NOT merge here — review and merge in GitHub.';
  const pr = spawnGhPr('main', branch, title, body);
  if (pr.ok) {
    steps.push('opened PR: ' + pr.url);
    return { done: true, message: 'PULL REQUEST READY on ' + branch, branch, remote, sha, pr: pr.url, steps };
  }
  return {
    done: true,
    message: 'Branch ' + branch + ' committed (' + sha + ') and pushed; open the PR in GitHub. ' + pr.error,
    branch,
    remote,
    sha,
    steps,
  };
}

function spawnGhPr(base: string, head: string, title: string, body: string): { ok: boolean; url?: string; error?: string } {
  try {
    const r = spawnSync(
      'gh',
      ['pr', 'create', '--head', head, '--base', base, '--title', title, '--body', body],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0' },
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    const out = (r.stdout ?? '') + (r.stderr ?? '');
    const m = out.match(/(https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+)/i);
    if (m) return { ok: true, url: m[1] };
    const detail = out.trim().slice(0, 240) || 'gh pr create produced no URL';
    const extra = (r as { error?: Error }).error ? ' (' + (r as { error?: Error }).error!.message + ')' : '';
    return { ok: false, error: detail + extra };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export { executePublish as publishContent };
