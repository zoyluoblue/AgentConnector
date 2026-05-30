import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { truncateHeadTail } from "../util/truncate.js";

const pExecFile = promisify(execFile);

export interface DiffFile {
  path: string;
  /** Porcelain status code, e.g. "M", "A", "??", "D". */
  status: string;
}

export interface DiffResult {
  changed: boolean;
  files: DiffFile[];
  patch: string;
  truncated: boolean;
  totalBytes: number;
}

/**
 * Capture the working-tree changes in `cwd` as a unified diff plus a porcelain
 * file list. Phase 1 runs the executor directly in the repo, so `git diff`
 * reflects tracked edits; untracked files are surfaced via the porcelain list.
 */
export async function computeDiff(cwd: string, maxBytes: number): Promise<DiffResult> {
  const patchRaw = await runGit(["diff", "--no-color"], cwd, 64 * 1024 * 1024);
  const porcelain = await runGit(["status", "--porcelain"], cwd, 16 * 1024 * 1024);

  const files = parsePorcelain(porcelain);
  const changed = patchRaw.trim().length > 0 || files.length > 0;
  const t = truncateHeadTail(patchRaw, maxBytes);

  return { changed, files, patch: t.text, truncated: t.truncated, totalBytes: t.totalBytes };
}

async function runGit(args: string[], cwd: string, maxBuffer: number): Promise<string> {
  try {
    const { stdout } = await pExecFile("git", args, { cwd, maxBuffer });
    return stdout;
  } catch {
    // Not a git repo, or git error — treat as no output.
    return "";
  }
}

function parsePorcelain(out: string): DiffFile[] {
  const files: DiffFile[] = [];
  for (const line of out.split("\n")) {
    if (line.trim() === "") continue;
    const status = line.slice(0, 2).trim();
    // porcelain v1: "XY <path>"; for renames "XY <old> -> <new>".
    let path = line.slice(3).trim();
    const arrow = path.indexOf(" -> ");
    if (arrow >= 0) path = path.slice(arrow + 4);
    if (path) files.push({ path, status });
  }
  return files;
}
