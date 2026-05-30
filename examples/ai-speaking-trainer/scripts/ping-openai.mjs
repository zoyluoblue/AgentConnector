if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not configured in .env.local");
  process.exit(1);
}

const { default: OpenAI } = await import("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const models = await client.models.list();
console.log(
  JSON.stringify(
    {
      ok: true,
      firstModel: models.data[0]?.id ?? null
    },
    null,
    2
  )
);
