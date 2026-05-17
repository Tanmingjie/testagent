import { LlmClient } from "@shared/llm-client";
import { decomposerPrompt } from "@shared/llm-prompts";
import type { TestCase, KnowledgeBase } from "@shared/types";
import { TestCaseSchema } from "@shared/schemas";

function matchBehaviorInstructions(translatedCase: TestCase, kb: KnowledgeBase): string[] {
  const caseText = [
    translatedCase.name,
    translatedCase.precondition ?? "",
    ...translatedCase.steps.flatMap((s) => [s.actionText, s.expectedText]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return kb.behaviors
    .filter((b) => {
      const lower = b.instruction.toLowerCase();
      return caseText.split(/\s+/).some((kw) => kw.length > 1 && lower.includes(kw));
    })
    .map((b) => `[${b.priority}] ${b.instruction}`);
}

function buildUserMessage(
  translatedCase: TestCase,
  matchedBehaviors: string[],
): string {
  const lines: string[] = [
    "请分解以下测试用例中的复合步骤：",
    "",
    '```json',
    JSON.stringify(translatedCase, null, 2),
    '```',
  ];

  if (matchedBehaviors.length > 0) {
    lines.push("", "适用行为规范（请在分解步骤时遵循以下规范）：");
    matchedBehaviors.forEach((b) => lines.push(`- ${b}`));
  }

  return lines.join("\n");
}

/**
 * Decompose compound test steps into atomic step-assertion pairs using an LLM.
 *
 * Flow:
 * 1. Extract matched behavioral instructions from KB that relate to the case
 * 2. Construct prompt: decomposerPrompt + translated case + matched behaviors
 * 3. Call LLM with response_format: { type: "json_object" }
 * 4. Parse LLM response as TestCase and validate with Zod schema
 * 5. Retry once if parsing or validation fails
 * 6. Set status to "decomposed" and return the decomposed TestCase
 */
export async function decomposeTestCase(
  translatedCase: TestCase,
  kb: KnowledgeBase,
  llm: LlmClient,
): Promise<TestCase> {
  const matchedBehaviors = matchBehaviorInstructions(translatedCase, kb);
  const kbTerms = kb.vocab.map((v) => v.term);
  const systemPrompt = decomposerPrompt();
  const userMessage = buildUserMessage(translatedCase, matchedBehaviors);

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

    const result = TestCaseSchema.parse(parsed);
    result.status = "decomposed";
    return result;
  };

  try {
    return await doAttempt();
  } catch (firstErr) {
    const feedback = `上一个回复无效: ${firstErr instanceof Error ? firstErr.message : String(firstErr)}。请确保输出是有效的 JSON，并严格遵循 TestCase 结构。每个步骤必须只有一个原子操作和一个可验证的预期结果。`;

    try {
      return await doAttempt(feedback);
    } catch {
      throw new Error(
        `Decomposition failed after retry for case "${translatedCase.name}" (${translatedCase.id})`,
      );
    }
  }
}
