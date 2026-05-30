import type { AgentApi } from "../../shared/ipc";

declare global {
  interface Window {
    agent: AgentApi;
  }
}

export {};
