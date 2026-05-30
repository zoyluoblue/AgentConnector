import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to initialize OpenAI");
  }

  client ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    fetch: (...args) => globalThis.fetch(...args)
  });

  return client;
}
