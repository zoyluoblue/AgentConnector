// DeepSeek backend (master/planner only): a direct OpenAI-compatible chat call.
// DeepSeek has no CLI — it authenticates with an API key. api.deepseek.com is
// reachable directly in CN, so this does NOT go through the proxy.
import { log } from "./log.js";

const ENDPOINT = "https://api.deepseek.com/chat/completions";

export interface DeepseekAsk {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  apiKey: string;
  signal?: AbortSignal;
}

export interface DeepseekResult {
  ok: boolean;
  text: string;
  error?: string;
}

function fakeDeepseek(ask: DeepseekAsk): Promise<DeepseekResult> {
  const isReview = ask.prompt.includes("审查") || ask.prompt.includes("git diff");
  const text = isReview ? "✅ 通过：DeepSeek 审查认为改动达成了目标。" : "好的（DeepSeek）：我把它拆成 3 步，交给右栏执行。";
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: true, text }), Number(process.env.STUDIO_FAKE_DELAY ?? 900));
    ask.signal?.addEventListener("abort", () => {
      clearTimeout(t);
      resolve({ ok: false, text: "", error: "已停止" });
    });
  });
}

/** Single-turn DeepSeek completion. Context for collab is carried in the prompt itself. */
export async function askDeepseek(ask: DeepseekAsk): Promise<DeepseekResult> {
  if (process.env.STUDIO_FAKE) return fakeDeepseek(ask);
  if (!ask.apiKey) return { ok: false, text: "", error: "请先填写 DeepSeek API Key" };

  const messages: { role: string; content: string }[] = [];
  if (ask.systemPrompt) messages.push({ role: "system", content: ask.systemPrompt });
  messages.push({ role: "user", content: ask.prompt });
  const model = ask.model || "deepseek-chat";
  log("deepseek.exec", { model, promptLen: ask.prompt.length });

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ask.apiKey}` },
      body: JSON.stringify({ model, messages, stream: false }),
      signal: ask.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const msg = body.slice(0, 300) || `HTTP ${res.status}`;
      log("deepseek.error", { status: res.status, body: msg });
      return { ok: false, text: "", error: `DeepSeek 请求失败（${res.status}）：${msg}` };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? "";
    log("deepseek.done", { len: text.length });
    return text ? { ok: true, text } : { ok: false, text: "", error: "DeepSeek 返回为空" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (ask.signal?.aborted) return { ok: false, text: "", error: "已停止" };
    log("deepseek.error", { err: msg });
    return { ok: false, text: "", error: `DeepSeek 网络错误：${msg}` };
  }
}
