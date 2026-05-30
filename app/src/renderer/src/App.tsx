import { useEffect, useMemo, useState } from "react";
import { agent } from "./api";
import { NewRun } from "./components/NewRun";
import { RunDetail } from "./components/RunDetail";
import { RunList } from "./components/RunList";
import { Settings } from "./components/Settings";
import { StatusBar } from "./components/StatusBar";
import type { ConfigView, ExecutorInfo, ProjectInfo, Run, RunStartInput } from "./types";

type Theme = "dark" | "light";

export default function App() {
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; runId: string } | null>(null);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [executors, setExecutors] = useState<ExecutorInfo[]>([]);
  const [defaultExecutor, setDefaultExecutor] = useState("codex");
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("theme") as Theme) || "dark");

  async function refreshRuns() {
    const list = await agent.runList();
    setRuns(Object.fromEntries(list.map((r) => [r.runId, r])));
  }
  async function refreshRun(id: string) {
    const r = await agent.runGet(id);
    if (r) setRuns((prev) => ({ ...prev, [id]: r }));
  }

  useEffect(() => {
    void (async () => {
      setProject(await agent.getProject());
      const ex = await agent.executors();
      setExecutors(ex.executors);
      setDefaultExecutor(ex.default);
      setConfig(await agent.getConfig());
      await refreshRuns();
    })();
    const off = agent.onRunUpdate((id) => void refreshRun(id));
    return off;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSettingsOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen((s) => !s);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const runList = useMemo(() => Object.values(runs).sort((a, b) => b.createdAt - a.createdAt), [runs]);
  const selectedRun = selectedRunId ? runs[selectedRunId] : undefined;
  const isRepo = project?.isRepo ?? false;

  async function startRun(input: RunStartInput) {
    const r = await agent.runStart(input);
    await refreshRuns();
    setSelectedRunId(r.runId);
    return r;
  }
  const withRun = (fn: (id: string) => void | Promise<void>) => () => {
    if (selectedRunId) void Promise.resolve(fn(selectedRunId)).then(() => refreshRun(selectedRunId));
  };
  async function pickProject() {
    const p = await agent.pickProject();
    if (p) setProject(p);
  }
  async function deleteRun(runId: string) {
    setMenu(null);
    await agent.runDelete(runId);
    if (selectedRunId === runId) setSelectedRunId(null);
    await refreshRuns();
  }

  return (
    <div className="app">
      <div className="header">
        <span className="brand">⬢ AgentConnector</span>
        <button className="iconbtn" title="新建 Task" onClick={() => setSelectedRunId(null)}>
          ＋
        </button>
        <span className="modelabel">Task</span>
        <button className="iconbtn" onClick={() => void pickProject()} title="选择项目目录（可新建文件夹）">
          📁 选择目录
        </button>
        <span
          className="muted"
          style={{ fontSize: 12, maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {project
            ? `${shortPath(project.cwd)}${project.isRepo ? ` (${project.branch ?? "detached"}${project.dirty ? ` ✎${project.dirty}` : ""})` : " · 非git"}`
            : "未选择目录"}
        </span>
        <span className="spacer" />
        <button className="iconbtn" title="切换深/浅色" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
          {theme === "dark" ? "☀︎" : "☾"}
        </button>
        <button className="iconbtn" title="设置 (⌘,)" onClick={() => setSettingsOpen(true)}>
          ⚙
        </button>
      </div>

      <div className="tasks">
        <RunList
          runs={runList}
          selectedId={selectedRunId}
          onSelect={setSelectedRunId}
          onContextMenu={(runId, x, y) => setMenu({ x, y, runId })}
        />
      </div>

      <div className="detail">
        {selectedRun ? (
          <RunDetail
            run={selectedRun}
            onApprovePlan={withRun((id) => agent.runApprovePlan(id))}
            onApprovePhase={withRun((id) => agent.runApprovePhase(id))}
            onPause={withRun((id) => agent.runPause(id))}
            onResume={withRun((id) => agent.runResume(id))}
            onAbort={withRun((id) => agent.runAbort(id))}
            onIntervene={(text) => {
              if (selectedRunId) void agent.runIntervene(selectedRunId, text).then(() => refreshRun(selectedRunId));
            }}
          />
        ) : (
          <div className="empty">选择左侧的 Task 查看详情，或在右侧新建一个目标。</div>
        )}
      </div>

      <div className="compose">
        <NewRun isRepo={isRepo} onStart={startRun} />
      </div>

      <StatusBar runs={runList} project={project} defaultExecutor={defaultExecutor} />

      {settingsOpen && <Settings config={config} executors={executors} onClose={() => setSettingsOpen(false)} />}

      {menu && (
        <div className="ctxbackdrop" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }}>
          <div className="ctxmenu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
            <button className="danger" onClick={() => void deleteRun(menu.runId)}>
              删除此 Task
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function shortPath(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts.length <= 2 ? p : ".../" + parts.slice(-2).join("/");
}
