import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// No StrictMode: its double mount/unmount in dev would spawn+kill+respawn the PTYs.
createRoot(document.getElementById("root")!).render(<App />);
