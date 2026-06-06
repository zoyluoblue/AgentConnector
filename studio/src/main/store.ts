// Persisted conversation store: one JSON file per session under userData/history.
// Powers the History view and cross-session Search. Saves are debounced so the
// live transcript survives crashes without thrashing the disk.
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ChatMessage, Mode, SearchHit, Session, SessionMeta } from "../shared/ipc.js";
import { log } from "./log.js";

let dir = "";
let current: Session | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function initStore(baseDir: string): void {
  dir = baseDir;
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
}

function genId(): string {
  return `s_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function metaOf(s: Session): SessionMeta {
  return {
    id: s.id,
    projectCwd: s.projectCwd,
    projectName: s.projectName,
    mode: s.mode,
    title: s.title || "（未命名对话）",
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    messageCount: s.messages.length,
  };
}

function fileFor(id: string): string {
  return join(dir, `${id}.json`);
}

/** Begin a fresh (empty) session — only hits disk once it has messages. */
export function startSession(projectCwd: string, projectName: string, mode: Mode): void {
  flush();
  const now = Date.now();
  current = { id: genId(), projectCwd, projectName, mode, title: "", createdAt: now, updatedAt: now, messageCount: 0, messages: [] };
}

/** Make an existing (loaded) session the live one — used by "继续对话". */
export function adoptSession(s: Session): void {
  flush();
  current = s;
}

export function recordMessage(m: ChatMessage): void {
  if (!current) return;
  const i = current.messages.findIndex((x) => x.id === m.id);
  if (i === -1) current.messages.push(m);
  else current.messages[i] = m;
  if (!current.title && m.role === "user" && m.text.trim()) {
    current.title = m.text.trim().replace(/\s+/g, " ").slice(0, 48);
  }
  current.updatedAt = Date.now();
  scheduleSave();
}

export function setMode(mode: Mode): void {
  if (current) current.mode = mode;
}

export function setAgentIds(ids: { claudeSession?: string; codexThread?: string }): void {
  if (!current) return;
  if (ids.claudeSession) current.claudeSession = ids.claudeSession;
  if (ids.codexThread) current.codexThread = ids.codexThread;
  scheduleSave();
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 500);
}

/** Persist the live session now (no-op while it has no messages). */
export function flush(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!current || current.messages.length === 0) return;
  current.messageCount = current.messages.length;
  try {
    writeFileSync(fileFor(current.id), JSON.stringify(current));
  } catch (e) {
    log("history.save.error", { err: String(e) });
  }
}

function sessionIds(): string[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
}

function readSession(id: string): Session | null {
  if (current && current.id === id) return current; // freshest copy
  try {
    return JSON.parse(readFileSync(fileFor(id), "utf8")) as Session;
  } catch {
    return null;
  }
}

export function list(): SessionMeta[] {
  const metas: SessionMeta[] = [];
  const seen = new Set<string>();
  for (const id of sessionIds()) {
    const s = readSession(id);
    if (s && s.messages.length > 0) {
      metas.push(metaOf(s));
      seen.add(id);
    }
  }
  if (current && current.messages.length > 0 && !seen.has(current.id)) metas.push(metaOf(current));
  metas.sort((a, b) => b.updatedAt - a.updatedAt);
  return metas;
}

export function get(id: string): Session | null {
  return readSession(id);
}

export function remove(id: string): void {
  try {
    unlinkSync(fileFor(id));
  } catch {
    /* ignore */
  }
  if (current && current.id === id) current = null;
  log("history.delete", { id });
}

export function rename(id: string, title: string): void {
  const t = title.trim().slice(0, 80);
  if (!t) return;
  if (current && current.id === id) {
    current.title = t;
    flush();
    return;
  }
  const s = readSession(id);
  if (!s) return;
  s.title = t;
  try {
    writeFileSync(fileFor(id), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function makeSnippet(text: string, idx: number, len: number): string {
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + len + 60);
  const pre = start > 0 ? "…" : "";
  const post = end < text.length ? "…" : "";
  return (pre + text.slice(start, end) + post).replace(/\s+/g, " ").trim();
}

export function search(query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const scan = (s: Session) => {
    for (const m of s.messages) {
      if (m.role === "system" || !m.text) continue;
      const idx = m.text.toLowerCase().indexOf(q);
      if (idx === -1) continue;
      hits.push({
        sessionId: s.id,
        sessionTitle: s.title || "（未命名对话）",
        projectName: s.projectName,
        messageId: m.id,
        n: m.n,
        role: m.role,
        lane: m.lane,
        ts: m.ts,
        snippet: makeSnippet(m.text, idx, q.length),
      });
    }
  };
  for (const id of sessionIds()) {
    if (seen.has(id)) continue;
    seen.add(id);
    const s = readSession(id);
    if (s) scan(s);
  }
  if (current && !seen.has(current.id)) scan(current);
  hits.sort((a, b) => b.ts - a.ts);
  return hits.slice(0, 200);
}
