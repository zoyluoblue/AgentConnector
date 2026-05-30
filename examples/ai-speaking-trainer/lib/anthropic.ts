import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required to initialize Anthropic");
  }

  client ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });

  return client;
}
