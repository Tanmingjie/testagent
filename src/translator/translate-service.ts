import { LlmClient } from "@shared/llm-client";
import { translatorPrompt } from "@shared/llm-prompts";
import type { TestCase, KnowledgeBase } from "@shared/types";
import { TestCaseSchema } from "@shared/schemas";

function matchVocabulary(rawCase: TestCase, kb: KnowledgeBase): string[] {
  const caseText = [
    rawCase.name,
    rawCase.precondition ?? "",
    ...rawCase.steps.flatMap((s) => [s.actionText, s.expectedText]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return kb.vocab
    .filter((v) => caseText.includes(v.term.toLowerCase()))
    .map((v) => (v.locator ? `${v.term} (${v.locator})` : v.term));
}

function buildUserMessage(
  rawCase: TestCase,
  matchedTerms: string[],
): string {
  const lines: string[] = [
    "请标准化以下原始测试用例：",
    "",
    '```json',
    JSON.stringify(rawCase, null, 2),
    '```',
  ];

  if (matchedTerms.length > 0) {
    lines.push("", "匹配的术语表（请使用这些术语标准化步骤）：");
    matchedTerms.forEach((t) => lines.push(`- ${t}`));
  } else {
    lines.push("", "（无匹配的词汇表术语）");
  }

  return lines.join("\n");
}

/**
 * Translate/standardize a raw test case using an LLM and knowledge base context.
 *
 * Flow:
 * 1. Extract matched vocabulary terms from KB that appear in the case text
 * 2. Construct prompt: translatorPrompt + raw case text + matched vocabulary
 * 3. Call LLM with response_format: { type: "json_object" }
 * 4. Parse LLM response as TestCase and validate with Zod schema
 * 5. Retry once if parsing or validation fails
 * 6. Return translated TestCase
 */
export async function translateTestCase(
  rawCase: TestCase,
  kb: KnowledgeBase,
  llm: LlmClient,
): Promise<TestCase> {
  const matchedTerms = matchVocabulary(rawCase, kb);
  const systemPrompt = translatorPrompt();
  const userMessage = buildUserMessage(rawCase, matchedTerms);

  const doAttempt = async (retryFeedback?: string): Promise<TestCase> => {
    const messages: { role: string; content: string }[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];

    if (retryFeedback) {
      messages.push({
        role: "user",
        content: retryFeedback,
      });
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
