export class LlmClient {
  private apiUrl: string;
  private apiKey: string;
  private model: string;
  private tokensUsed = 0;

  constructor(opts: { apiUrl: string; apiKey: string; model: string }) {
    this.apiUrl = opts.apiUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.model = opts.model;
  }

  async chatCompletion(
    messages: { role: string; content: string }[],
    opts?: { responseFormat?: { type: "json_object" | "text" } },
  ): Promise<{ content: string; tokensUsed: number }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    try {
      return await this._attempt(messages, controller, false, opts);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async *chatCompletionStream(
    messages: { role: string; content: string }[],
    opts?: { responseFormat?: { type: "json_object" | "text" } },
  ): AsyncGenerator<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: 0,
      stream: true,
    };
    if (opts?.responseFormat) {
      body.response_format = opts.responseFormat;
    }

    const response = await fetch(`${this.apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch { }
      }
    }
  }

  private async _attempt(
    messages: { role: string; content: string }[],
    controller: AbortController,
    isRetry = false,
    opts?: { responseFormat?: { type: "json_object" | "text" } },
  ): Promise<{ content: string; tokensUsed: number }> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: 0,
    };
    if (opts?.responseFormat) {
      body.response_format = opts.responseFormat;
    }

    const response = await fetch(`${this.apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status >= 500 && !isRetry) {
        await new Promise((r) => setTimeout(r, 1000));
        return this._attempt(messages, controller, true);
      }
      throw new Error(
        `LLM API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
      usage: { total_tokens: number };
    };

    const content = data.choices?.[0]?.message?.content ?? "";
    const tokens = data.usage?.total_tokens ?? 0;
    this.tokensUsed += tokens;

    return { content, tokensUsed: tokens };
  }

  getTokensUsed(): number {
    return this.tokensUsed;
  }
}
