import type { TestCase, KnowledgeBase } from "@shared/types";
import { LlmClient } from "@shared/llm-client";
import { translateTestCase } from "./translate-service";
import { decomposeTestCase } from "./decompose-service";

/**
 * Process a raw test case through the full pipeline:
 * 1. Translate/standardize the raw case using LLM + KB vocabulary
 * 2. Decompose compound steps into atomic step-assertion pairs
 *
 * Returns a fully decomposed TestCase ready for code generation.
 */
export async function processTestCase(
  rawCase: TestCase,
  kb: KnowledgeBase,
  llm: LlmClient,
): Promise<TestCase> {
  const translated = await translateTestCase(rawCase, kb, llm);
  return decomposeTestCase(translated, kb, llm);
}
