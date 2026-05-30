"use server";

import { getOpenAIClient } from "../../lib/openai";

export type SpeechAudioBlob = Blob;

const ACCEPTED_AUDIO_TYPES = new Set(["audio/wav", "audio/wave", "audio/webm"]);

function audioFileName(filename: string, type: string) {
  if (/\.(wav|webm)$/i.test(filename)) {
    return filename;
  }

  if (type.includes("wav")) {
    return `${filename}.wav`;
  }

  return `${filename}.webm`;
}

export async function speechAction(
  audio: SpeechAudioBlob,
  filename = "speech.webm"
): Promise<string> {
  if (!(audio instanceof Blob)) {
    throw new Error("speechAction expects a WAV or WebM Blob");
  }
  if (audio.type && !ACCEPTED_AUDIO_TYPES.has(audio.type)) {
    throw new Error(`speechAction only accepts WAV or WebM audio, got ${audio.type}`);
  }

  const client = getOpenAIClient();
  const file = new File([audio], audioFileName(filename, audio.type), {
    type: audio.type || "audio/webm"
  });

  const transcript = await client.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "text"
  });

  return typeof transcript === "string" ? transcript.trim() : "";
}
