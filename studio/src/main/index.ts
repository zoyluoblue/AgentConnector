import { mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { BrowserWindow, app, dialog, ipcMain } from "electron";
import {
  type AgentKind,
  type AuthState,
  type AuthStatus,
  type BusyState,
  CH,
  type ChatMessage,
  type Mode,
  type MsgKind,
  type ProjectInfo,
  type Role,
} from "../shared/ipc.js";
import { agentLogin, agentStatus } from "./auth.js";
import { askClaude } from "./claudeDriver.js";
import { askCodex } from "./codexDriver.js";
import { gitDiff } from "./diff.js";
import { fixPath } from "./fixPath.js";

// GUI apps don't inherit the shell PATH — repair it so claude/codex/git resolve.
fixPath();

const MAX_REVISE = 3;

let win: BrowserWindow | null = null;
let projectCwd: string | null = null;
let mode: Mode = process.env.STUDIO_MODE === "collab" ? "collab" : "solo";
let claudeSession: string | undefined;
let codexThread: string | undefined;
const busy: BusyState = { claude: false, codex: false };
const aborts: Record<AgentKind, AbortController | null> = { claude: null, codex: null };
const agentModel: Record<AgentKind, string> = { claude: "", codex: "" };

const PLANNER_SYSTEM =
  "你是 AgentConnector 的规划助手，面向不懂编程的用户。用简洁、友好的中文交流，避免专业黑话。" +
  "把用户想做的东西拆成简短的分步实现计划（3 步以内），供 Codex 执行。只输出计划本身，不要写代码。";
const REVIEWER_SYSTEM =
  "你是严谨的代码审查员。基于用户目标和 Codex 刚做的改动，判断是否达成目标且没有明显问题。用简洁中文。";

function planPrompt(goal: string): string {
  return `用户目标：${goal}\n\n请给出一个简短的分步实现计划（3 步以内），供 Codex 执行。`;
}
function executePrompt(plan: string): string {
  return `请在当前项目里按以下计划实现，直接新建/修改文件；完成后用一两句话说明你做了什么改动：\n\n${plan}`;
}
function reviewPrompt(goal: string, diff: string): string {
  return (
    `用户目标：${goal}\n\n以下是 Codex 刚做的改动（git diff / 新增文件清单）：\n\n${diff}\n\n` +
    `请审查是否达成目标且无明显问题。若可以，回复以「✅ 通过」开头并一句话总结；` +
    `若需修改，回复以「❌ 需修改」开头，并简要列出要改的点。`
  );
}
function revisePrompt(feedback: string): string {
  return `审查反馈如下，请据此继续修改代码：\n\n${feedback}`;
}
function verdictPass(text: string): boolean {
  const head = text.trim().slice(0, 16);
  return head.includes("✅") || head.includes("通过");
}

function send(channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}
function authCwd(): string {
  return projectCwd ?? homedir();
}
function setBusy(kind: AgentKind, v: boolean): void {
  busy[kind] = v;
  send(CH.busy, { ...busy });
}

let seq = 0;
function post(role: Role, kind: MsgKind, text: string, pending: boolean, id: string | undefined, lane: AgentKind): string {
  const mid = id ?? `m${Date.now().toString(36)}_${seq++}`;
  send(CH.event, { id: mid, role, kind, text, ts: Date.now(), lane, pending } satisfies ChatMessage);
  return mid;
}
function projInfo(): ProjectInfo {
  return { cwd: projectCwd, name: projectCwd ? basename(projectCwd) : null };
}

// ---- single agent turns (post to a lane + return the result) ----
async function claudeTurn(prompt: string, system: string) {
  const pid = post("claude", "text", "", true, undefined, "claude");
  setBusy("claude", true);
  aborts.claude = new AbortController();
  const res = await askClaude({ prompt, cwd: projectCwd as string, sessionId: claudeSession, systemPrompt: system, disableTools: true, model: agentModel.claude || undefined, signal: aborts.claude.signal });
  if (res.sessionId) claudeSession = res.sessionId;
  post(res.ok ? "claude" : "system", res.ok ? "text" : "error", res.ok ? res.text : (res.error ?? "出错了"), false, pid, "claude");
  setBusy("claude", false);
  aborts.claude = null;
  return res;
}
async function codexTurn(prompt: string) {
  const pid = post("codex", "progress", "Codex 正在处理…", true, undefined, "codex");
  setBusy("codex", true);
  aborts.codex = new AbortController();
  const res = await askCodex({
    prompt,
    cwd: projectCwd as string,
    threadId: codexThread,
    sandbox: "workspace-write",
    model: agentModel.codex || undefined,
    signal: aborts.codex.signal,
    onDelta: (t) => post("codex", "text", t, true, pid, "codex"),
  });
  if (res.threadId) codexThread = res.threadId;
  const suffix = res.ok && res.steps ? `\n\n（执行了 ${res.steps} 步操作）` : "";
  post(res.ok ? "codex" : "system", res.ok ? "text" : "error", res.ok ? res.text + suffix : (res.error ?? "出错了"), false, pid, "codex");
  setBusy("codex", false);
  aborts.codex = null;
  return res;
}

// ---- collab: automatic plan -> execute -> review -> revise ----
async function runOrchestration(goal: string): Promise<void> {
  post("user", "text", goal, false, undefined, "claude");

  const planRes = await claudeTurn(planPrompt(goal), PLANNER_SYSTEM);
  if (!planRes.ok) return;

  const exec = await codexTurn(executePrompt(planRes.text));
  if (!exec.ok) return;

  for (let iter = 0; iter < MAX_REVISE; iter++) {
    const diff = await gitDiff(projectCwd as string);
    const review = await claudeTurn(reviewPrompt(goal, diff), REVIEWER_SYSTEM);
    if (!review.ok) return;
    if (verdictPass(review.text)) {
      post("system", "text", "✅ 完成：Claude 审查通过。", false, undefined, "claude");
      return;
    }
    if (iter === MAX_REVISE - 1) {
      post("system", "text", `已自动修改 ${MAX_REVISE} 轮仍未通过，请人工查看或补充说明。`, false, undefined, "claude");
      return;
    }
    const revise = await codexTurn(revisePrompt(review.text));
    if (!revise.ok) return;
  }
}

async function handleSend(text: string, target: AgentKind): Promise<void> {
  if (!projectCwd) {
    post("system", "error", "请先选择一个项目文件夹。", false, undefined, target);
    return;
  }
  if (mode === "collab") {
    await runOrchestration(text);
  } else if (target === "claude") {
    post("user", "text", text, false, undefined, "claude");
    await claudeTurn(text, PLANNER_SYSTEM);
  } else {
    post("user", "text", text, false, undefined, "codex");
    await codexTurn(text);
  }
}

// ---- auth: session-scoped, NOT persisted. Both agents start DISCONNECTED on
// every launch; the user must explicitly connect (authenticate) each session. ----
const sessionAuth: AuthState = { claude: { connected: false }, codex: { connected: false } };

async function connectAgent(kind: AgentKind): Promise<AuthStatus> {
  // Adopt an existing CLI login if present; otherwise run the interactive login flow.
  const cur = await agentStatus(kind, authCwd());
  if (cur.connected) {
    sessionAuth[kind] = cur;
    return cur;
  }
  const label = kind === "claude" ? "Claude" : "Codex";
  const st = await agentLogin(kind, authCwd(), (url) => {
    post("system", "text", `如果浏览器没有自动打开，请手动访问以下链接完成 ${label} 登录：\n${url}`, false, undefined, kind);
  });
  sessionAuth[kind] = st;
  return st;
}

function capture(path: string): void {
  void win?.webContents
    .capturePage()
    .then((img) => {
      writeFileSync(path, img.toPNG());
      console.error(`[main] captured screenshot -> ${path}`);
    })
    .catch((e) => console.error("[main] capture failed", e));
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 640,
    title: "AgentConnector",
    backgroundColor: "#0e0f13",
    webPreferences: { preload: join(__dirname, "../preload/index.js"), contextIsolation: true, sandbox: false },
  });

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, "../renderer/index.html"));

  win.webContents.on("did-finish-load", () => console.error("[main] renderer loaded OK"));
  win.webContents.on("preload-error", (_e, p, err) => console.error(`[preload-error] ${p}:`, err));
  win.webContents.on("did-fail-load", (_e, code, desc) => console.error(`[did-fail-load] ${code} ${desc}`));

  // No auto auth check on launch — agents start disconnected until the user connects.

  // Dev affordances.
  const shotPath = process.env.STUDIO_SHOT;
  const demo = process.env.STUDIO_DEMO;
  win.webContents.on("did-finish-load", () => {
    if (demo) {
      const demoDir = join(tmpdir(), "agentconnector-demo");
      try {
        mkdirSync(demoDir, { recursive: true });
      } catch {
        /* ignore */
      }
      projectCwd = demoDir;
      send(CH.projectEvent, projInfo());
      void handleSend(demo, "claude").then(async () => {
        const cd = process.env.STUDIO_DEMO_CODEX;
        if (cd && mode === "solo") await handleSend(cd, "codex");
        if (shotPath) setTimeout(() => capture(shotPath), 1500);
      });
    } else if (shotPath) {
      setTimeout(() => capture(shotPath), Number(process.env.STUDIO_SHOT_DELAY ?? 8000));
    }
  });

  win.on("closed", () => {
    win = null;
  });
}

app.whenReady().then(() => {
  ipcMain.handle(CH.send, (_e, p: { text: string; target: AgentKind }) => handleSend(p.text, p.target));
  ipcMain.on(CH.abort, (_e, target: AgentKind) => aborts[target]?.abort());

  ipcMain.handle(CH.modeGet, () => mode);
  ipcMain.on(CH.modeSet, (_e, m: Mode) => {
    mode = m;
    send(CH.modeEvent, mode);
  });
  ipcMain.on(CH.modelSet, (_e, p: { agent: AgentKind; model: string }) => {
    agentModel[p.agent] = p.model;
  });

  ipcMain.handle(CH.projectGet, () => projInfo());
  ipcMain.handle(CH.projectPick, async () => {
    const target = win ?? BrowserWindow.getAllWindows()[0];
    const r = await dialog.showOpenDialog(target, { properties: ["openDirectory", "createDirectory"], buttonLabel: "选择项目" });
    if (!r.canceled && r.filePaths[0]) {
      projectCwd = r.filePaths[0];
      claudeSession = undefined;
      codexThread = undefined;
      const p = projInfo();
      send(CH.projectEvent, p);
      return p;
    }
    return projInfo();
  });

  ipcMain.handle(CH.authGet, () => sessionAuth);
  ipcMain.handle(CH.authConnect, async (_e, kind: AgentKind) => {
    const st = await connectAgent(kind);
    send(CH.authEvent, sessionAuth);
    return st;
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
