import { LlmClient } from "@shared/llm-client";
import { translatorPrompt } from "@shared/llm-prompts";
import type { TestCase } from "@shared/types";
import { TestCaseSchema } from "@shared/schemas";

function buildUserMessage(rawCase: TestCase, knowledgeContent: string): string {
  const lines: string[] = [
    "请标准化以下原始测试用例：",
    "",
    '```json',
    JSON.stringify(rawCase, null, 2),
    '```',
  ];

  if (knowledgeContent) {
    lines.push("", "## 产品知识库（请参考以下术语和规范进行标准化）", "", knowledgeContent);
  }

  return lines.join("\n");
}

export async function translateTestCase(
  rawCase: TestCase,
  knowledgeContent: string,
  llm: LlmClient,
): Promise<TestCase> {
  const systemPrompt = translatorPrompt();
  const userMessage = buildUserMessage(rawCase, knowledgeContent);

  const doAttempt = async (retryFeedback?: string): Promise<TestCase> => {
    const messages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];

    if (retryFeedback) {
      messages.push({ role: "user", content: retryFeedback });
    }

    const { content } = await llm.chatCompletion(messages, {
      responseFormat: { type: "json_object" },
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error("LLM returned invalid JSON");
    }

    return TestCaseSchema.parse(parsed);
  };

  try {
    return await doAttempt();
  } catch (firstErr) {
    const feedback = `上一个回复无效: ${firstErr instanceof Error ? firstErr.message : String(firstErr)}。请确保输出是有效的 JSON，并严格遵循 TestCase 结构。`;

    try {
      return await doAttempt(feedback);
    } catch {
      throw new Error(
        `Translation failed after retry for case "${rawCase.name}" (${rawCase.id})`,
      );
    }
  }
}
