import { useState } from "react";
import { fmtDuration, STATE_LABEL } from "../api";
import type { ApplyResult, StartResult, TaskView } from "../types";
import { DiffView } from "./DiffView";

export function TaskDetail({
  task,
  onCancel,
  onResume,
  onApply,
}: {
  task: TaskView;
  onCancel: (id: string) => Promise<void>;
  onResume: (id: string, prompt: string) => Promise<StartResult>;
  onApply: (id: string) => Promise<ApplyResult>;
}) {
  const [resumeText, setResumeText] = useState("");
  const [showResume, setShowResume] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [diffFormat, setDiffFormat] = useState<"line-by-line" | "side-by-side">("line-by-line");
  const terminal = task.state === "done" || task.state === "error" || task.state === "canceled";
  const canApply = task.state === "done" && !!task.worktreePath && !task.appliedAt;

  return (
    <div>
      <div className="section">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={`dot ${task.state}`} />
          <b style={{ fontSize: 15 }}>{task.label || task.taskId}</b>
          <span className="pill">{STATE_LABEL[task.state] ?? task.state}</span>
        </div>
        <div className="kv" style={{ marginTop: 8 }}>
          <span>执行器 <b>{task.executor}</b></span>
          <span>沙箱 <b>{task.sandbox}</b></span>
          <span>隔离 <b>{task.isolation}</b></span>
          <span>耗时 <b>{fmtDuration(task.durationMs)}</b></span>
          {task.exitCode != null && <span>退出码 <b>{task.exitCode}</b></span>}
          {task.attempt > 0 && <span>尝试 <b>{task.attempt + 1}</b></span>}
        </div>
        <div className="kv" style={{ marginTop: 4 }}>
          <span>id <b>{task.taskId}</b></span>
          {task.sessionId && <span>session <b>{task.sessionId.slice(0, 12)}…</b></span>}
        </div>
      </div>

      <div className="actions" style={{ marginTop: 0, marginBottom: 14 }}>
        {(task.state === "running" || task.state === "queued") && (
          <button className="danger" onClick={() => void onCancel(task.taskId)}>取消</button>
        )}
        {terminal && (
          <button onClick={() => setShowResume((s) => !s)}>续跑…</button>
        )}
        {canApply && (
          <button
            className="primary"
            onClick={async () => {
              const r = await onApply(task.taskId);
              setNote(r.applied ? "已合并到主工作树" : `未合并：${r.reason ?? r.error ?? ""}`);
            }}
          >
            ✓ 合并到主树
          </button>
        )}
        {task.appliedAt && <span className="pill" style={{ alignSelf: "center" }}>已合并</span>}
      </div>
      {note && <div className="section muted">{note}</div>}

      {showResume && (
        <div className="section">
          <textarea rows={3} placeholder="续跑指令（保留此前会话上下文）…" value={resumeText} onChange={(e) => setResumeText(e.target.value)} />
          <div className="actions">
            <button
              className="primary"
              disabled={!resumeText.trim()}
              onClick={async () => {
                const r = await onResume(task.taskId, resumeText);
                if (!r.ok) setNote(r.error ?? "续跑失败");
                else {
                  setResumeText("");
                  setShowResume(false);
                }
              }}
            >
              续跑
            </button>
          </div>
        </div>
      )}

      <div className="section">
        <h3>实时活动（{task.eventCount}）</h3>
        <div className="console">
          {task.recentEvents.length === 0 ? (
            <span className="muted">（暂无事件）</span>
          ) : (
            task.recentEvents.map((e, i) => (
              <div className={`ev ${e.kind}`} key={i}>
                <span className="k">{e.kind}</span>
                {e.text ? <> · {e.text}</> : null}
              </div>
            ))
          )}
        </div>
      </div>

      {task.stderrTail.length > 0 && task.state === "error" && (
        <div className="section">
          <h3>stderr</h3>
          <div className="console">{task.stderrTail.join("\n")}</div>
        </div>
      )}

      {task.finalMessage && (
        <div className="section">
          <h3>最终消息</h3>
          <div className="console">{task.finalMessage}</div>
        </div>
      )}

      {task.structuredOutput != null && (
        <div className="section">
          <h3>结构化输出</h3>
          <div className="console">{JSON.stringify(task.structuredOutput, null, 2)}</div>
        </div>
      )}

      {task.diff && (
        <div className="section">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h3 style={{ margin: 0 }}>差异{task.diff.changed ? `（${task.diff.files.length} 文件）` : "（无改动）"}</h3>
            <span style={{ flex: 1 }} />
            {task.diff.changed && (
              <div className="seg" style={{ width: 180 }}>
                <button className={diffFormat === "line-by-line" ? "on" : ""} onClick={() => setDiffFormat("line-by-line")}>
                  统一
                </button>
                <button className={diffFormat === "side-by-side" ? "on" : ""} onClick={() => setDiffFormat("side-by-side")}>
                  并排
                </button>
              </div>
            )}
          </div>
          <div style={{ marginTop: 8 }}>
            <DiffView patch={task.diff.patch} files={task.diff.files} format={diffFormat} />
            {task.diff.truncated && <div className="muted" style={{ marginTop: 6 }}>… diff 已截断（{task.diff.totalBytes} 字节）</div>}
          </div>
        </div>
      )}
    </div>
  );
}
