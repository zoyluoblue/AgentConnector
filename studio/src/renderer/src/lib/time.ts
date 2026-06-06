import type { Lang } from "../i18n";

/** "刚刚 / 5 分钟前 / 3 小时前 / 2 天前 / Jun 3" */
export function relTime(ts: number, lang: Lang): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return lang === "zh" ? "刚刚" : "just now";
  if (m < 60) return lang === "zh" ? `${m} 分钟前` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return lang === "zh" ? `${h} 小时前` : `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return lang === "zh" ? `${d} 天前` : `${d}d ago`;
  return new Date(ts).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" });
}

export type DateGroup = "today" | "yesterday" | "week" | "earlier";

export function dateGroup(ts: number): DateGroup {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (ts >= startToday) return "today";
  if (ts >= startToday - 86_400_000) return "yesterday";
  if (ts >= startToday - 6 * 86_400_000) return "week";
  return "earlier";
}
