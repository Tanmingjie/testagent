import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { LlmClient } from "./llm-client";

const TEST_URL = "https://api.test.com/v1";
const TEST_KEY = "sk-test";
const TEST_MODEL = "gpt-4";

function makeClient() {
  return new LlmClient({
    apiUrl: TEST_URL,
    apiKey: TEST_KEY,
    model: TEST_MODEL,
  });
}

function mockFetch(response: Response, track?: () => void) {
  globalThis.fetch = ((async () => {
    track?.();
    return response;
  }) as unknown) as typeof fetch;
}

describe("LlmClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns content and token count on valid response", async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "Hello, world!" } }],
          usage: { total_tokens: 42 },
        }),
        { status: 200 },
      ),
    );

    const client = makeClient();
    const result = await client.chatCompletion([
      { role: "user", content: "Say hi" },
    ]);

    expect(result.content).toBe("Hello, world!");
    expect(result.tokensUsed).toBe(42);
  });

  it("retries once on 5xx then throws", async () => {
    let attempts = 0;
    mockFetch(new Response("Server Error", { status: 502 }), () => {
      attempts++;
    });

    const client = makeClient();
    await expect(
      client.chatCompletion([{ role: "user", content: "hi" }]),
    ).rejects.toThrow("LLM API error: 502");

    expect(attempts).toBe(2);
  });

  it("throws immediately on 4xx without retry", async () => {
    let attempts = 0;
    mockFetch(new Response("Bad Request", { status: 400 }), () => {
      attempts++;
    });

    const client = makeClient();
    await expect(
      client.chatCompletion([{ role: "user", content: "hi" }]),
    ).rejects.toThrow("LLM API error: 400");

    expect(attempts).toBe(1);
  });

  it("tracks cumulative tokens via getTokensUsed", async () => {
    let callCount = 0;
    globalThis.fetch = ((async () => {
      callCount++;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" } }],
          usage: { total_tokens: callCount * 10 },
        }),
        { status: 200 },
      );
    }) as unknown) as typeof fetch;

    const client = makeClient();
    await client.chatCompletion([{ role: "user", content: "a" }]);
    await client.chatCompletion([{ role: "user", content: "b" }]);
    await client.chatCompletion([{ role: "user", content: "c" }]);

    expect(client.getTokensUsed()).toBe(60); // 10 + 20 + 30
  });
});
