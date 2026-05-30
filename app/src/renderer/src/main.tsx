import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles.css";

// Surface async errors (outside React's render path) to the console -> terminal.
window.addEventListener("error", (e) => console.error("[window-error]", e.message, `${e.filename}:${e.lineno}`));
window.addEventListener("unhandledrejection", (e) =>
  console.error("[unhandledrejection]", String((e as PromiseRejectionEvent).reason)),
);

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
