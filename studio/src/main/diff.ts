import { spawn } from "node:child_process";
import { resolveBin } from "./which.js";

function git(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve) => {
    const bin = resolveBin("git");
    if (!bin) return resolve("");
    const c = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    c.stdout.on("data", (d) => (out += d.toString()));
    c.on("error", () => resolve(""));
    c.on("close", () => resolve(out));
  });
}

/** Best-effort working-tree diff (tracked changes + names of new files) for Claude to review. */
export async function gitDiff(cwd: string): Promise<string> {
  const diff = (await git(["diff"], cwd)).trim();
  const untracked = (await git(["ls-files", "--others", "--exclude-standard"], cwd)).trim();
  let r = diff;
  if (untracked) r += `${r ? "\n\n" : ""}[新增文件]\n${untracked}`;
  return r || "（未检测到文件改动）";
}
