import { NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/openai";

export const runtime = "nodejs";

export async function GET() {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error: "OPENAI_API_KEY is not configured"
      },
      { status: 500 }
    );
  }

  try {
    const client = getOpenAIClient();
    const models = await client.models.list();
    const firstModel = models.data[0]?.id ?? null;

    return NextResponse.json({
      ok: true,
      firstModel
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown OpenAI error"
      },
      { status: 502 }
    );
  }
}
