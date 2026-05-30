function hasRealKey(value: string | undefined, placeholder: string) {
  return Boolean(value && value.trim() && value !== placeholder);
}

function installMockFetch() {
  const encoder = new TextEncoder();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.includes("api.anthropic.com/v1/messages")) {
      const chunks = [
        {
          event: "message_start",
          data: {
            type: "message_start",
            message: {
              id: "msg_test",
              type: "message",
              role: "assistant",
              content: [],
              model: "claude-sonnet-4-6",
              stop_reason: null,
              stop_sequence: null,
              usage: { input_tokens: 8, output_tokens: 0 }
            }
          }
        },
        {
          event: "content_block_start",
          data: {
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" }
          }
        },
        {
          event: "content_block_delta",
          data: {
            type: "content_block_delta",
            index: 0,
            delta: {
              type: "text_delta",
              text: "Sure. Let's practice a natural coffee order."
            }
          }
        },
        {
          event: "content_block_stop",
          data: { type: "content_block_stop", index: 0 }
        },
        {
          event: "message_delta",
          data: {
            type: "message_delta",
            delta: { stop_reason: "end_turn", stop_sequence: null },
            usage: { output_tokens: 10 }
          }
        },
        { event: "message_stop", data: { type: "message_stop" } }
      ];
      const body = chunks
        .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n`)
        .join("\n");

      return new Response(encoder.encode(body), {
        status: 200,
        headers: { "content-type": "text/event-stream" }
      });
    }

    if (url.includes("api.openai.com/v1/audio/transcriptions")) {
      return new Response("mock transcript", {
        status: 200,
        headers: { "content-type": "text/plain" }
      });
    }

    if (url.includes("api.openai.com/v1/audio/speech")) {
      return new Response(encoder.encode("mock mp3 bytes"), {
        status: 200,
        headers: { "content-type": "audio/mpeg" }
      });
    }

    return originalFetch(input, init);
  }) satisfies typeof fetch;
}

function makeSilentWavBlob() {
  const sampleRate = 16_000;
  const seconds = 1;
  const dataSize = sampleRate * seconds * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset: number, value: string) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  return new Blob([buffer], { type: "audio/wav" });
}

async function main() {
  const live = process.argv.includes("--live");

  const hasAnthropicKey = hasRealKey(
    process.env.ANTHROPIC_API_KEY,
    "sk-ant-your-anthropic-api-key"
  );
  const hasOpenAIKey = hasRealKey(
    process.env.OPENAI_API_KEY,
    "sk-your-openai-api-key"
  );

  if (live && (!hasAnthropicKey || !hasOpenAIKey)) {
    throw new Error(
      "Live action test requires ANTHROPIC_API_KEY and OPENAI_API_KEY in .env.local"
    );
  }

  if (!live) {
    process.env.ANTHROPIC_API_KEY ||= "sk-ant-test";
    process.env.OPENAI_API_KEY ||= "sk-test";
    installMockFetch();
  }

  const { claudeAction, readClaudeStream } = await import(
    "../app/actions/claudeAction"
  );
  const { speechAction } = await import("../app/actions/speechAction");
  const { ttsAction } = await import("../app/actions/ttsAction");

  const stream = await claudeAction([
    {
      role: "user",
      text: "I want to practice ordering coffee in a natural way."
    }
  ]);
  const reply = await readClaudeStream(stream);
  console.log("Claude streamed reply sample:", reply.slice(0, 240));

  const audioBuffer = await ttsAction("Could I get a small latte to go?");
  console.log("TTS bytes:", audioBuffer.byteLength);

  const transcript = await speechAction(makeSilentWavBlob(), "silence.wav");
  console.log("STT transcript:", transcript);

  console.log(
    live
      ? "Live action test passed: claudeAction, speechAction, and ttsAction were called."
      : "Mocked action test passed: claudeAction, speechAction, and ttsAction were called."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
