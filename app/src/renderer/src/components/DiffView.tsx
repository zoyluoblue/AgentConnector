import { useMemo } from "react";
import { html as diffHtml } from "diff2html";
import "diff2html/bundles/css/diff2html.min.css";
import type { DiffFile } from "../types";

export function DiffView({
  patch,
  files,
  format,
}: {
  patch: string;
  files: DiffFile[];
  format: "line-by-line" | "side-by-side";
}) {
  const rendered = useMemo(() => {
    if (!patch.trim()) return "";
    try {
      return diffHtml(patch, { drawFileList: false, matching: "lines", outputFormat: format });
    } catch {
      return "";
    }
  }, [patch, format]);

  return (
    <div>
      {files.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {files.map((f) => (
            <div className="filebadge" key={f.path}>
              <span className="muted">{f.status || "??"}</span> {f.path}
            </div>
          ))}
        </div>
      )}
      {rendered ? (
        <div className="d2h" dangerouslySetInnerHTML={{ __html: rendered }} />
      ) : patch ? (
        <div className="console">{patch}</div>
      ) : (
        <div className="muted">（新建文件的内容不在 unified diff 中，见上方文件列表；或无文本改动）</div>
      )}
    </div>
  );
}
