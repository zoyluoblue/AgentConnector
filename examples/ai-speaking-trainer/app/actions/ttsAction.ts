"use server";

import { getOpenAIClient } from "../../lib/openai";

export type TtsAudioBuffer = ArrayBuffer;

export async function ttsAction(text: string): Promise<TtsAudioBuffer> {
  const input = text.trim();
  if (!input) {
    throw new Error("ttsAction expects non-empty text");
  }

  const client = getOpenAIClient();
  const speech = await client.audio.speech.create({
    model: "tts-1",
    voice: "alloy",
    input,
    response_format: "mp3"
  });

  return speech.arrayBuffer();
}
