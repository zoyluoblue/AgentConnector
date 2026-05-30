import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diffSnapshots, snapshotDir } from "../src/diff/snapshotDiff";

describe("snapshotDiff (git-free change capture)", () => {
  it("detects added/modified/removed files and renders new-file content", () => {
    const dir = mkdtempSync(join(tmpdir(), "ac-snap-"));
    writeFileSync(join(dir, "keep.txt"), "keep");
    writeFileSync(join(dir, "old.txt"), "old");
    const before = snapshotDir(dir);

    writeFileSync(join(dir, "new.txt"), "hello\nworld\n");
    writeFileSync(join(dir, "keep.txt"), "keep changed bigger");
    rmSync(join(dir, "old.txt"));

    const d = diffSnapshots(dir, before, 100000);
    expect(d.changed).toBe(true);
    const byPath = Object.fromEntries(d.files.map((f) => [f.path, f.status]));
    expect(byPath["new.txt"]).toBe("A");
    expect(byPath["keep.txt"]).toBe("M");
    expect(byPath["old.txt"]).toBe("D");
    expect(d.patch).toContain("new file mode");
    expect(d.patch).toContain("+hello");
    expect(d.patch).toContain("+world");
  });

  it("ignores node_modules/.git", () => {
    const dir = mkdtempSync(join(tmpdir(), "ac-snap2-"));
    mkdirSync(join(dir, "node_modules"));
    writeFileSync(join(dir, "node_modules", "x.js"), "junk");
    writeFileSync(join(dir, "real.txt"), "x");
    const snap = snapshotDir(dir);
    expect([...snap.keys()]).toContain("real.txt");
    expect([...snap.keys()].some((p) => p.includes("node_modules"))).toBe(false);
  });
});
