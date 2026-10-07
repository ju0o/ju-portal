/**
 * JU Portal Studio — git helpers (READ-ONLY inspection + publish *prep*).
 *
 * This module never mutates git state. It only reads branch, HEAD, dirty
 * status, changed files, diffs, and the remote-tracking main SHA (via the
 * read-only `git ls-remote`, which never updates local refs).
 *
 * The actual git WRITE operations (create branch, commit, push, open PR) live
 * in `publish.ts` and are gated behind `STUDIO_ALLOW_GIT` so they can never fire
 * during a Git Freeze and can never touch main directly.
 */
import { spawnSync } from 'node:child_process';

export interface GitState {
  branch: string;
  head: string;
  dirty: boolean;
  changedFiles: string[];
}

export interface PublishPlan {
  branch: string;
  head: string;
  changedFiles: string[];
  diffShort: string;
  remoteMainChanged: boolean;
  remoteMainSha: string;
  publishable: boolean;
  reasons: string[];
}

function execGit(args: string[], cwd: string): { stdout: string; code: number } {
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    maxBuffer: 64 * 1024 * 1024,
  });
  return { stdout: r.stdout ?? '', code: r.status ?? -1 };
}

export function getBranch(cwd: string): string {
  const r = execGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  return r.code === 0 ? r.stdout.trim() : '';
}

export function getHead(cwd: string): string {
  const r = execGit(['rev-parse', 'HEAD'], cwd);
  return r.code === 0 ? r.stdout.trim() : '';
}

export function isDirty(cwd: string): boolean {
  const r = execGit(['status', '--porcelain'], cwd);
  return r.code === 0 ? r.stdout.trim().length > 0 : false;
}

/**
 * Files with uncommitted changes (modified AND untracked), repo-relative.
 *
 * `git diff HEAD` only lists tracked files, which would silently drop a
 * newly-created content file (e.g. a new product, or content/home.ts on first
 * add) from the publish set. Using `git status --porcelain -uall` includes
 * untracked files so Publish never commits only half of an edit. Ignored paths
 * (dist/, node_modules/) are excluded by git itself.
 */
export function getChangedFiles(cwd: string): string[] {
  const r = execGit(['status', '--porcelain', '--untracked-files=all'], cwd);
  if (r.code !== 0) return [];
  return r.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const p = line.slice(3); // strip the two status columns and the space
      return (p.includes(' -> ') ? p.split(' -> ')[1] : p).trim();
    })
    .filter(Boolean);
}

export function getDiff(cwd: string, paths?: string[]): string {
  const args = ['--no-pager', 'diff', '--stat'];
  if (paths && paths.length) args.push(...paths);
  const r = execGit(args, cwd);
  return r.code === 0 ? r.stdout : '';
}

/** Read-only: resolve the remote main SHA without touching local refs (git ls-remote). */
export function getRemoteMainSha(cwd: string, remote = 'origin', branch = 'main'): string {
  const r = execGit(['ls-remote', remote, branch], cwd);
  if (r.code !== 0 || !r.stdout.trim()) return '';
  return r.stdout.split(/\s+/)[0] ?? '';
}

/** Read-only: local tracking main SHA (refs/remotes/origin/main) if present. */
export function getLocalTrackingMainSha(cwd: string, remote = 'origin', branch = 'main'): string {
  const r = execGit(['rev-parse', `${remote}/${branch}`], cwd);
  return r.code === 0 ? r.stdout.trim() : '';
}

export function remoteMainChanged(cwd: string, remote = 'origin', branch = 'main'): boolean {
  const remoteSha = getRemoteMainSha(cwd, remote, branch);
  const localSha = getLocalTrackingMainSha(cwd, remote, branch);
  if (!remoteSha) return false;
  if (!localSha) return true; // no tracking ref -> treat as changed/unsafe
  return remoteSha !== localSha;
}

export function getState(cwd: string): GitState {
  return {
    branch: getBranch(cwd),
    head: getHead(cwd),
    dirty: isDirty(cwd),
    changedFiles: getChangedFiles(cwd),
  };
}

export function proposedBranchName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `studio/content-${stamp}`;
}

/**
 * Build a Publish plan WITHOUT touching git writes. The plan records what WOULD
 * be pushed: the proposed content branch, changed files, diff, and whether the
 * remote main has moved since the local was last synced (an unsafe condition).
 */
export function buildPublishPlan(cwd: string): PublishPlan {
  const state = getState(cwd);
  const remoteMain = getRemoteMainSha(cwd);
  const localMain = getLocalTrackingMainSha(cwd);
  const rmc = remoteMainChanged(cwd);
  const reasons: string[] = [];
  if (state.dirty && state.changedFiles.length === 0) {
    reasons.push('worktree dirty but no staged/HEAD changes detected');
  }
  if (rmc) reasons.push('REMOTE_MAIN_CHANGED');
  if (!state.head) reasons.push('no HEAD (empty repo)');
  return {
    branch: proposedBranchName(),
    head: state.head,
    changedFiles: state.changedFiles,
    diffShort: getDiff(cwd, state.changedFiles.length ? state.changedFiles : undefined),
    remoteMainSha: remoteMain,
    remoteMainChanged: rmc,
    publishable: reasons.length === 0 && state.changedFiles.length > 0,
    reasons,
  };
}

export { execGit };
