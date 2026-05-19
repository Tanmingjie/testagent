import { appendFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

let logReady: Promise<void> | null = null;
function ensureLogDir(): Promise<void> {
  if (!logReady) {
    logReady = mkdir(resolve(process.cwd(), 'data/logs'), { recursive: true }).then(() => {}).catch(() => {});
  }
  return logReady;
}

function truncate(s: string, max: number): string {
  if (!s || s.length <= max) return s || '';
  return s.slice(0, max) + `… (${s.length - max} more chars)`;
}

function extractUserMsg(messages: { role: string; content: string }[]): string {
  const user = messages.find((m) => m.role === 'user');
  return user?.content || '';
}

function extractSysMsg(messages: { role: string; content: string }[]): string {
  const sys = messages.find((m) => m.role === 'system');
  return sys?.content || '';
}

async function logLlmCall(
  type: 'chat' | 'sse',
  model: string,
  messages: { role: string; content: string }[],
  response: string,
  tokens: number,
  durationMs: number,
  error?: string,
) {
  const ts = new Date().toISOString();
  const sysBrief = truncate(extractSysMsg(messages), 120).replace(/\n/g, '↵');
  const userBrief = truncate(extractUserMsg(messages), 200).replace(/\n/g, '↵');
  const respBrief = truncate(response, 300).replace(/\n/g, '↵');

  console.log(
    `[LLM] ${type} | ${model} | ${tokens} tok | ${durationMs}ms${error ? ' | ERROR: ' + error : ''}`,
  );

  const detail = [
    `--- LLM ${type.toUpperCase()} ${ts} ---`,
    `Model: ${model}`,
    `Tokens: ${tokens} | Duration: ${durationMs}ms${error ? ' | Error: ' + error : ''}`,
    `--- SYSTEM PROMPT ---`,
    extractSysMsg(messages),
    `--- USER PROMPT ---`,
    extractUserMsg(messages),
    `--- RESPONSE ---`,
    response,
    `--- END LLM ${type.toUpperCase()} ---`,
    '',
  ].join('\n');

  await ensureLogDir();
  appendFile(resolve(process.cwd(), 'data/logs/llm.log'), detail, 'utf-8').catch(() => {});
}

export class LlmClient {
  private apiUrl: string;
  private apiKey: string;
  private model: string;
  private tokensUsed = 0;

  constructor(opts: { apiUrl: string; apiKey: string; model: string }) {
    this.apiUrl = opts.apiUrl.replace(/\/+$/, '');
    this.apiKey = opts.apiKey;
    this.model = opts.model;
  }

  async chatCompletion(
    messages: { role: string; content: string }[],
    opts?: { responseFormat?: { type: 'json_object' | 'text' } },
  ): Promise<{ content: string; tokensUsed: number }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    const start = Date.now();

    try {
      const result = await this._attempt(messages, controller, false, opts);
      await logLlmCall('chat', this.model, messages, result.content, result.tokensUsed, Date.now() - start);
      return result;
    } catch (err) {
      await logLlmCall('chat', this.model, messages, '', 0, Date.now() - start, (err as Error).message);
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async *chatCompletionStream(
    messages: { role: string; content: string }[],
    opts?: { responseFormat?: { type: 'json_object' | 'text' } },
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

    const start = Date.now();
    let fullText = '';

    const response = await fetch(`${this.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      await logLlmCall('sse', this.model, messages, errText, 0, Date.now() - start, `HTTP ${response.status}`);
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            await logLlmCall('sse', this.model, messages, fullText, 0, Date.now() - start);
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            const chunk = delta?.content || delta?.reasoning_content;
            if (chunk) {
              fullText += chunk;
              yield chunk;
            }
          } catch {}
        }
      }

      await logLlmCall('sse', this.model, messages, fullText, 0, Date.now() - start);
    } catch (err) {
      await logLlmCall('sse', this.model, messages, fullText, 0, Date.now() - start, (err as Error).message);
      throw err;
    }
  }

  private async _attempt(
    messages: { role: string; content: string }[],
    controller: AbortController,
    isRetry = false,
    opts?: { responseFormat?: { type: 'json_object' | 'text' } },
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
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
      throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string; reasoning_content?: string } }[];
      usage: { total_tokens: number };
    };

    const msg = data.choices?.[0]?.message;
    const content = msg?.content || msg?.reasoning_content || '';
    const tokens = data.usage?.total_tokens ?? 0;
    this.tokensUsed += tokens;

    return { content, tokensUsed: tokens };
  }

  getTokensUsed(): number {
    return this.tokensUsed;
  }
}
