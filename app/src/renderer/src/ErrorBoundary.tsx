import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[app-error]", error?.stack || String(error), info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div style={{ padding: 24, fontFamily: "ui-monospace, monospace", color: "#e6e8ee", background: "#15161a", height: "100vh", overflow: "auto" }}>
          <h2 style={{ color: "#ef5b6a" }}>应用出错</h2>
          <p style={{ color: "#e6b34a" }}>{error.message}</p>
          <pre style={{ color: "#9aa1b1", fontSize: 11, whiteSpace: "pre-wrap" }}>{error.stack}</pre>
          <button onClick={() => location.reload()} style={{ marginTop: 12 }}>
            重载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
