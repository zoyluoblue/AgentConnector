import type { ProjectInfo, Run } from "../types";

export function StatusBar({
  runs,
  project,
  defaultExecutor,
}: {
  runs: Run[];
  project: ProjectInfo | null;
  defaultExecutor: string;
}) {
  const c = (pred: (r: Run) => boolean) => runs.filter(pred).length;
  return (
    <div className="status">
      <span>进行 {c((r) => r.status === "running" || r.status === "planning")}</span>
      <span>完成 {c((r) => r.status === "done")}</span>
      <span>待人工 {c((r) => r.status === "needs_human")}</span>
      <span>失败 {c((r) => r.status === "failed")}</span>
      <span className="spacer" style={{ flex: 1 }} />
      <span>默认执行器: {defaultExecutor}</span>
      {project && <span>{project.isRepo ? `git: ${project.branch ?? "(detached)"}` : "非 git · 文件快照对比"}</span>}
    </div>
  );
}
