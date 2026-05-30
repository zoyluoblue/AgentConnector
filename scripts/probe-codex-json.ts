// Re-capture Codex's `exec --json` event schema (read-only, ephemeral, side-effect-free).
// Run: npm run probe -- "optional custom prompt"
// Pipe stdout to test/fixtures/codex-events.jsonl to refresh the parser fixture.
import { spawn } from "node:child_process";

const prompt =
  process.argv.slice(2).join(" ") ||
  "List the files in the current directory using ls, then say the single word done.";
const bin = process.env.AGENTCONNECTOR_CODEX_BIN || "codex";

const child = spawn(
  bin,
  ["exec", "--ephemeral", "-s", "read-only", "--skip-git-repo-check", "-c", 'approval_policy="never"', "--json", "-"],
  { stdio: ["pipe", "inherit", "inherit"] },
);

child.stdin.write(prompt);
child.stdin.end();
child.on("close", (code) => process.exit(code ?? 0));
