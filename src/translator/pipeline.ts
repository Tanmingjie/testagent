import type { TestCase } from "@shared/types";
import { LlmClient } from "@shared/llm-client";
import { translateTestCase } from "./translate-service";
import { decomposeTestCase } from "./decompose-service";

export async function processTestCase(
  rawCase: TestCase,
  knowledgeContent: string,
  llm: LlmClient,
): Promise<TestCase> {
  const translated = await translateTestCase(rawCase, knowledgeContent, llm);
  return decomposeTestCase(translated, knowledgeContent, llm);
}
