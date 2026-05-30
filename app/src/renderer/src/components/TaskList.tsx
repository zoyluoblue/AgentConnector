import { fmtDuration, STATE_LABEL } from "../api";
import type { TaskView } from "../types";

export function TaskList({
  tasks,
  selectedId,
  onSelect,
}: {
  tasks: TaskView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (tasks.length === 0) {
    return <div className="empty">还没有任务。<br />在右侧新建一个 →</div>;
  }
  return (
    <div>
      {tasks.map((t) => (
        <div
          key={t.taskId}
          className={`task-row${t.taskId === selectedId ? " sel" : ""}`}
          onClick={() => onSelect(t.taskId)}
        >
          <div className="top">
            <span className={`dot ${t.state}`} />
            <span className="label">{t.label || t.taskId}</span>
            {t.isolation === "worktree" && <span className="pill">wt</span>}
          </div>
          <div className="meta">
            {STATE_LABEL[t.state] ?? t.state} · {t.executor} · {fmtDuration(t.durationMs)}
          </div>
        </div>
      ))}
    </div>
  );
}
