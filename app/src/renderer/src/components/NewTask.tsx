import { useEffect, useState } from "react";
import type { ExecutorInfo, Isolation, SandboxMode, StartInput, StartResult } from "../types";

const SANDBOXES: { v: SandboxMode; label: string }[] = [
  { v: "read-only", label: "只读" },
  { v: "workspace-write", label: "改工作区" },
  { v: "danger-full-access", label: "完全" },
];

export function NewTask({
  executors,
  defaultExecutor,
  isRepo,
  onDispatch,
  onReview,
}: {
  executors: ExecutorInfo[];
  defaultExecutor: string;
  isRepo: boolean;
  onDispatch: (input: StartInput) => Promise<StartResult>;
  onReview: () => Promise<StartResult>;
}) {
  const [prompt, setPrompt] = useState("");
  const [executor, setExecutor] = useState(defaultExecutor);
  const [sandbox, setSandbox] = useState<SandboxMode>("workspace-write");
  const [isolation, setIsolation] = useState<Isolation>("inplace");
  const [model, setModel] = useState("");
  const [retries, setRetries] = useState(0);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // worktree isolation needs git; fall back to in-place for non-git projects.
  useEffect(() => {
    if (!isRepo && isolation === "worktree") setIsolation("inplace");
  }, [isRepo, isolation]);

  async function dispatch() {
    if (!prompt.trim()) return;
    setBusy(true);
    setErr(null);
    const r = await onDispatch({
      prompt,
      executor,
      sandbox,
      isolation,
      model: model.trim() || undefined,
      retries,
      label: label.trim() || undefined,
    });
    setBusy(false);
    if (!r.ok) setErr(r.error ?? "派发失败");
    else setPrompt("");
  }

  return (
    <div>
      <div className="section">
        <h3>新建任务</h3>
        <textarea rows={7} placeholder="描述这个任务（含验收标准 / 相关文件）…" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </div>

      <label className="field">执行器</label>
      <select value={executor} onChange={(e) => setExecutor(e.target.value)}>
        {executors.map((x) => (
          <option key={x.name} value={x.name} disabled={!x.available}>
            {x.name}
            {!x.available ? "（未安装）" : ""}
            {x.experimental ? " · experimental" : ""}
          </option>
        ))}
      </select>

      <label className="field">沙箱</label>
      <div className="seg">
        {SANDBOXES.map((s) => (
          <button key={s.v} className={sandbox === s.v ? "on" : ""} onClick={() => setSandbox(s.v)}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="row2">
        <div>
          <label className="field">隔离</label>
          <select value={isolation} onChange={(e) => setIsolation(e.target.value as Isolation)}>
            <option value="inplace">就地</option>
            <option value="worktree" disabled={!isRepo}>
              worktree{!isRepo ? "（需 git）" : ""}
            </option>
          </select>
        </div>
        <div>
          <label className="field">重试</label>
          <input type="number" min={0} max={5} value={retries} onChange={(e) => setRetries(Number(e.target.value) || 0)} />
        </div>
      </div>

      <div className="row2">
        <div>
          <label className="field">模型（可选）</label>
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="默认" />
        </div>
        <div>
          <label className="field">标签（可选）</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="" />
        </div>
      </div>

      <div className="actions">
        <button className="primary" disabled={busy || !prompt.trim()} onClick={dispatch}>
          {busy ? "派发中…" : "▶ 派发"}
        </button>
        <button onClick={() => void onReview()}>审查当前改动</button>
      </div>
      {err && <div className="section" style={{ color: "var(--red)", marginTop: 10 }}>{err}</div>}
    </div>
  );
}
