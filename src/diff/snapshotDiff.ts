import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { truncateHeadTail } from "../util/truncate.js";
import type { DiffFile, DiffResult } from "./gitDiff.js";

// A git-free fallback for change capture: snapshot the directory before a task,
// then compare after. Lets non-git (e.g. empty) project folders still show what
// the executor created/changed.

const IGNORE = new Set([
  ".git",
  "node_modules",
  ".agentconnector",
  "dist",
  "out",
  "release",
  ".next",
  ".cache",
  ".turbo",
  "target",
  "build",
  ".venv",
  "__pycache__",
]);
const MAX_FILES = 5000;
const MAX_FILE_CONTENT = 64 * 1024; // cap per-file content rendered for new files

export type DirSnapshot = Map<string, { mtimeMs: number; size: number }>;

export function snapshotDir(root: string): DirSnapshot {
  const snap: DirSnapshot = new Map();
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (IGNORE.has(e.name)) continue;
      if (snap.size >= MAX_FILES) return snap;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile()) {
        try {
          const st = statSync(full);
          snap.set(relative(root, full), { mtimeMs: st.mtimeMs, size: st.size });
        } catch {
          /* ignore unreadable */
        }
      }
    }
  }
  return snap;
}

export function diffSnapshots(root: string, before: DirSnapshot, maxBytes: number): DiffResult {
  const after = snapshotDir(root);
  const files: DiffFile[] = [];
  const blocks: string[] = [];

  for (const [path, a] of after) {
    const b = before.get(path);
    if (!b) {
      files.push({ path, status: "A" });
      const block = renderNewFile(root, path);
      if (block) blocks.push(block);
    } else if (b.mtimeMs !== a.mtimeMs || b.size !== a.size) {
      files.push({ path, status: "M" });
    }
  }
  for (const path of before.keys()) {
    if (!after.has(path)) files.push({ path, status: "D" });
  }
  files.sort((x, y) => x.path.localeCompare(y.path));

  const t = truncateHeadTail(blocks.join("\n"), maxBytes);
  return { changed: files.length > 0, files, patch: t.text, truncated: t.truncated, totalBytes: t.totalBytes };
}

/** Render an added text file as a git-style "new file" unified diff (so diff2html renders it). */
function renderNewFile(root: string, path: string): string {
  let content: string;
  try {
    const buf = readFileSync(join(root, path));
    if (buf.length > MAX_FILE_CONTENT) return "";
    if (buf.includes(0)) return ""; // binary
    content = buf.toString("utf8");
  } catch {
    return "";
  }
  const lines = content.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const body = lines.map((l) => "+" + l).join("\n");
  return `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n${body}`;
}
