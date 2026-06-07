// Long-term memory: plain Markdown files that every backend reads.
// A global file applies everywhere; each project gets its own file (keyed by a hash of its path).
// `memoryContext()` builds the block that gets injected into each model's prompt/system prompt,
// so claude / codex / deepseek all see the same memory regardless of backend.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { log } from "./log.js";

let dir = "";
/** Soft cap on the injected memory block so it can't blow up the context window. */
const MAX_CHARS = 12000;

export function initMemory(d: string): void {
  dir = d;
  try {
    mkdirSync(join(dir, "projects"), { recursive: true });
  } catch (e) {
    log("memory.init.error", { err: String(e) });
  }
}

function globalFile(): string {
  return join(dir, "global.md");
}
function projectFile(cwd: string): string {
  const hash = createHash("sha1").update(cwd).digest("hex").slice(0, 16);
  return join(dir, "projects", `${hash}.md`);
}
function read(file: string): string {
  try {
    return existsSync(file) ? readFileSync(file, "utf8") : "";
  } catch (e) {
    log("memory.read.error", { err: String(e) });
    return "";
  }
}
function write(file: string, content: string): void {
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
  } catch (e) {
    log("memory.write.error", { err: String(e) });
  }
}

export function getGlobalMemory(): string {
  return read(globalFile());
}
export function getProjectMemory(cwd: string | null): string {
  return cwd ? read(projectFile(cwd)) : "";
}
export function setGlobalMemory(content: string): void {
  write(globalFile(), content);
  log("memory.set", { scope: "global", len: content.length });
}
export function setProjectMemory(cwd: string | null, content: string): void {
  if (!cwd) return;
  write(projectFile(cwd), content);
  log("memory.set", { scope: "project", len: content.length });
}

/** Append one fact as a bullet — to the project memory if a project is open, else global. */
export function appendMemory(cwd: string | null, line: string): void {
  const fact = line.trim();
  if (!fact) return;
  const file = cwd ? projectFile(cwd) : globalFile();
  const cur = read(file).trimEnd();
  write(file, `${cur ? `${cur}\n` : ""}- ${fact}\n`);
  log("memory.append", { scope: cwd ? "project" : "global", len: fact.length });
}

/** Combined memory block injected into prompts ("" when there is no memory). */
export function memoryContext(cwd: string | null): string {
  const g = getGlobalMemory().trim();
  const p = getProjectMemory(cwd).trim();
  if (!g && !p) return "";
  let body = "";
  if (g) body += `【全局记忆】\n${g}\n`;
  if (p) body += `${body ? "\n" : ""}【项目记忆】\n${p}\n`;
  if (body.length > MAX_CHARS) body = `${body.slice(0, MAX_CHARS)}\n…（记忆过长，已截断）`;
  return `以下是用户的长期记忆，请在本次回答中参考并遵循：\n${body.trimEnd()}`;
}
