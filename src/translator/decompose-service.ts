import { LlmClient, extractJson } from "@shared/llm-client";
import { decomposerPrompt } from "@shared/llm-prompts";
import type { TestCase } from "@shared/types";
import { TestCaseSchema } from "@shared/schemas";

function buildUserMessage(translatedCase: TestCase, knowledgeContent: string): string {
  const lines: string[] = [
    "请将以下测试用例的复合步骤拆解为原子操作：",
    "",
    '```json',
    JSON.stringify(translatedCase, null, 2),
    '```',
  ];

  if (knowledgeContent) {
    lines.push("", "## 产品知识库（请参考以下术语和规范进行拆解）", "", knowledgeContent);
  }

  return lines.join("\n");
}

export async function decomposeTestCase(
  translatedCase: TestCase,
  knowledgeContent: string,
  llm: LlmClient,
): Promise<TestCase> {
  const systemPrompt = decomposerPrompt();
  const userMessage = buildUserMessage(translatedCase, knowledgeContent);

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

    const json = extractJson(content);

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
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
        `Decomposition failed after retry for case "${translatedCase.name}" (${translatedCase.id})`,
      );
    }
  }
}
