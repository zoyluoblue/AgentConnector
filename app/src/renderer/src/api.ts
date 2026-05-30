// The preload-exposed bridge to the engine (typed via global.d.ts).
export const agent = window.agent;

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m${rem.toString().padStart(2, "0")}s`;
}

export const STATE_LABEL: Record<string, string> = {
  queued: "排队",
  running: "运行中",
  done: "完成",
  error: "失败",
  canceled: "已取消",
};
