import { execFile, spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const pExecFile = promisify(execFile);
const WT_ROOT = join(tmpdir(), "agentconnector-worktrees");

export interface WorktreeInfo {
  path: string;
  branch: string;
  repoDir: string;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await pExecFile("git", args, { cwd, maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    const { stdout } = await pExecFile("git", ["rev-parse", "--is-inside-work-tree"], { cwd: dir });
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

/** Create a detached worktree at a temp path on a fresh branch from HEAD. */
export async function createWorktree(repoDir: string, taskId: string): Promise<WorktreeInfo> {
  await mkdir(WT_ROOT, { recursive: true });
  const path = join(WT_ROOT, taskId);
  const branch = `agentconnector/${taskId}`;
  await git(repoDir, ["worktree", "add", "--quiet", "-b", branch, path, "HEAD"]);
  return { path, branch, repoDir };
}

/** Remove a worktree and its branch (best-effort). */
export async function removeWorktree(info: WorktreeInfo): Promise<void> {
  try {
    await git(info.repoDir, ["worktree", "remove", "--force", info.path]);
  } catch {
    try {
      await rm(info.path, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  try {
    await git(info.repoDir, ["branch", "-D", info.branch]);
  } catch {
    /* ignore */
  }
}

/**
 * Merge a worktree's changes (tracked + untracked) into the main working tree by
 * generating a binary patch and `git apply`-ing it. Does not commit.
 */
export async function applyWorktree(info: WorktreeInfo): Promise<{ applied: boolean; reason?: string }> {
  try {
    await git(info.path, ["add", "-A"]);
  } catch (e) {
    return { applied: false, reason: `git add failed: ${String(e)}` };
  }
  let patch: string;
  try {
    patch = await git(info.path, ["diff", "--cached", "--binary"]);
  } catch (e) {
    return { applied: false, reason: `git diff failed: ${String(e)}` };
  }
  if (!patch.trim()) return { applied: false, reason: "no changes to apply" };
  try {
    await gitApplyStdin(info.repoDir, patch);
    return { applied: true };
  } catch (e) {
    return { applied: false, reason: `git apply failed (likely a conflict with the main tree): ${String(e)}` };
  }
}

/** `git apply` reading the patch from stdin, applied to repoDir's working tree. */
function gitApplyStdin(repoDir: string, patch: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["apply", "--whitespace=nowarn"], { cwd: repoDir, stdio: ["pipe", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `git apply exit ${code}`))));
    child.stdin.write(patch);
    child.stdin.end();
  });
}
