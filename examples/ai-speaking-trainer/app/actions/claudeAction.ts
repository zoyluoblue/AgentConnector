"use server";

import { getAnthropicClient } from "../../lib/anthropic";
import type { ConversationTurn } from "../../types/conversation";

type ClaudeMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ClaudeConversationHistory = ConversationTurn[];

const CLAUDE_MODEL = "claude-sonnet-4-6";

const COACH_SYSTEM_PROMPT = [
  "You are a native English-speaking conversation coach for spoken-English practice.",
  "Keep the conversation natural, idiomatic, and appropriate for daily real-world speech.",
  "Reply like a real conversation partner first, then add very concise coaching only when it helps.",
  "When the learner's wording sounds unnatural, offer one native alternative and explain why in simple terms.",
  "Avoid long lectures. Keep replies short enough to be spoken aloud."
].join(" ");

function buildClaudeMessages(history: ConversationTurn[]): {
  system: string;
  messages: ClaudeMessage[];
} {
  const systemAdditions: string[] = [];
  const messages: ClaudeMessage[] = [];

  for (const turn of history) {
    const text = turn.text.trim();
    if (!text) {
      continue;
    }

    if (turn.role === "system") {
      systemAdditions.push(text);
      continue;
    }

    const role = turn.role;
    const last = messages[messages.length - 1];
    if (last?.role === role) {
      last.content = `${last.content}\n\n${text}`;
    } else {
      messages.push({ role, content: text });
    }
  }

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    messages.push({
      role: "user",
      content: "Please continue this spoken English practice conversation naturally."
    });
  }

  return {
    system:
      systemAdditions.length > 0
        ? `${COACH_SYSTEM_PROMPT}\n\nSession notes:\n${systemAdditions.join("\n")}`
        : COACH_SYSTEM_PROMPT,
    messages
  };
}

export async function claudeAction(
  history: ClaudeConversationHistory
): Promise<ReadableStream<Uint8Array>> {
  const client = getAnthropicClient();
  const { system, messages } = buildClaudeMessages(history);
  const stream = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 700,
    system,
    messages,
    stream: true
  });

  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });
}

export async function readClaudeStream(
  stream: ReadableStream<Uint8Array>
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      return text;
    }
    text += decoder.decode(value, { stream: true });
  }
}
