// Library entry: the engine API surface consumed by frontends (the Electron app,
// and any other host). The MCP server (src/server.ts) builds on the same modules.

export { loadConfig } from "./config.js";
export type { Config, Isolation } from "./config.js";

export { TaskStore } from "./tasks/taskStore.js";
export type { StoreEvent, LaunchOptions } from "./tasks/taskStore.js";
export type { TaskRecord } from "./tasks/taskTypes.js";
export { toTaskView } from "./tasks/taskView.js";
export type { TaskView, EventView } from "./tasks/taskView.js";

export { ensureBuiltins, getExecutor, listExecutors, executorsInfo } from "./executor/registry.js";
export type { ExecutorInfo } from "./executor/registry.js";
export type { Executor, StartArgs, SandboxMode, TaskState, NormalizedEvent } from "./executor/types.js";

export type { DiffResult, DiffFile } from "./diff/gitDiff.js";
export { log } from "./util/log.js";
