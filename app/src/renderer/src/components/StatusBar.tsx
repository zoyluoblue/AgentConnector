import type { ProjectInfo, TaskView } from "../types";

export function StatusBar({
  tasks,
  project,
  defaultExecutor,
}: {
  tasks: TaskView[];
  project: ProjectInfo | null;
  defaultExecutor: string;
}) {
  const count = (s: string) => tasks.filter((t) => t.state === s).length;
  return (
    <div className="status">
      <span>运行 {count("running")}</span>
      <span>排队 {count("queued")}</span>
      <span>完成 {count("done")}</span>
      <span>失败 {count("error")}</span>
      <span className="spacer" style={{ flex: 1 }} />
      <span>默认执行器: {defaultExecutor}</span>
      {project && <span>{project.isRepo ? `git: ${project.branch ?? "(detached)"}${project.dirty ? ` ✎${project.dirty}` : ""}` : "非 git · 文件快照对比改动"}</span>}
    </div>
  );
}
