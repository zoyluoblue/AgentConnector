import { useEffect, useMemo, useState } from "react";
import { agent } from "./api";
import { NewTask } from "./components/NewTask";
import { Settings } from "./components/Settings";
import { StatusBar } from "./components/StatusBar";
import { TaskDetail } from "./components/TaskDetail";
import { TaskList } from "./components/TaskList";
import type { ConfigView, ExecutorInfo, ProjectInfo, ResumeInput, StartInput, TaskView } from "./types";

type Theme = "dark" | "light";
const FILTERS = ["all", "running", "queued", "done", "error", "canceled"] as const;

export default function App() {
  const [tasks, setTasks] = useState<Record<string, TaskView>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [executors, setExecutors] = useState<ExecutorInfo[]>([]);
  const [defaultExecutor, setDefaultExecutor] = useState("codex");
  const [config, setConfig] = useState<ConfigView | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("theme") as Theme) || "dark");

  async function refreshAll() {
    const list = await agent.list();
    setTasks(Object.fromEntries(list.map((t) => [t.taskId, t])));
  }
  async function refreshTask(id: string) {
    const v = await agent.getTask(id);
    if (v) setTasks((prev) => ({ ...prev, [id]: v }));
  }

  useEffect(() => {
    void (async () => {
      setProject(await agent.getProject());
      const ex = await agent.executors();
      setExecutors(ex.executors);
      setDefaultExecutor(ex.default);
      setConfig(await agent.getConfig());
      await refreshAll();
    })();
    const off = agent.onUpdate((id) => void refreshTask(id));
    return off;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSettingsOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key === "r") {
        e.preventDefault();
        void refreshAll();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen((s) => !s);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const list = useMemo(() => Object.values(tasks).sort((a, b) => b.startedAt - a.startedAt), [tasks]);
  const filtered = useMemo(() => (filter === "all" ? list : list.filter((t) => t.state === filter)), [list, filter]);
  const selected = selectedId ? tasks[selectedId] : undefined;

  async function dispatch(input: StartInput) {
    const r = await agent.start(input);
    if (r.ok && r.taskId) {
      await refreshAll();
      setSelectedId(r.taskId);
    }
    return r;
  }
  async function review() {
    const r = await agent.review({ uncommitted: true });
    if (r.ok && r.taskId) {
      await refreshAll();
      setSelectedId(r.taskId);
    }
    return r;
  }
  async function cancel(id: string) {
    await agent.cancel(id);
    await refreshTask(id);
  }
  async function resume(id: string, prompt: string) {
    const input: ResumeInput = { taskId: id, prompt };
    const r = await agent.resume(input);
    if (r.ok && r.taskId) {
      await refreshAll();
      setSelectedId(r.taskId);
    }
    return r;
  }
  async function apply(id: string) {
    const r = await agent.apply(id);
    await refreshTask(id);
    return r;
  }
  async function pickProject() {
    const p = await agent.pickProject();
    if (p) {
      setProject(p);
      await refreshAll();
    }
  }

  return (
    <div className="app">
      <div className="header">
        <span className="brand">⬢ AgentConnector</span>
        <span className="project" onClick={() => void pickProject()} title="点击切换项目目录">
          项目: <b>{project ? shortPath(project.cwd) : "…"}</b>
          {project?.isRepo ? ` (${project.branch ?? "detached"}${project.dirty ? ` ✎${project.dirty}` : ""})` : ""}
        </span>
        <span className="spacer" />
        <span className="muted" style={{ marginRight: 8 }}>你当导演</span>
        <button className="iconbtn" title="切换深/浅色" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
          {theme === "dark" ? "☀︎" : "☾"}
        </button>
        <button className="iconbtn" title="设置 (⌘,)" onClick={() => setSettingsOpen(true)}>
          ⚙
        </button>
      </div>

      <div className="tasks">
        <div className="filterbar">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {f === "all" ? "全部" : f} {f === "all" ? `(${list.length})` : `(${list.filter((t) => t.state === f).length})`}
              </option>
            ))}
          </select>
        </div>
        <TaskList tasks={filtered} selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      <div className="detail">
        {selected ? (
          <TaskDetail task={selected} onCancel={cancel} onResume={resume} onApply={apply} />
        ) : (
          <div className="empty">选择左侧的任务查看详情，或在右侧新建一个任务。</div>
        )}
      </div>

      <div className="compose">
        <NewTask
          executors={executors}
          defaultExecutor={defaultExecutor}
          isRepo={project?.isRepo ?? false}
          onDispatch={dispatch}
          onReview={review}
        />
      </div>

      <StatusBar tasks={list} project={project} defaultExecutor={defaultExecutor} />

      {settingsOpen && <Settings config={config} executors={executors} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function shortPath(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts.length <= 2 ? p : ".../" + parts.slice(-2).join("/");
}
