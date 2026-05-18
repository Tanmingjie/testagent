import type { LlmClient } from '@shared/llm-client';
import type { TestCase, PageElement } from '@shared/types';
import type { CliResult } from './cli-runner';

export type { PageElement, CliResult };

// Interface matching cli-commands shape — indirection enables testing
// and avoids circular imports from cli-commands.ts.
export interface CliCommands {
  navigate(url: string): Promise<CliResult>;
  snapshot(depth?: number): Promise<CliResult>;
  screenshot(filename?: string): Promise<CliResult>;
  click(ref: string): Promise<CliResult>;
  type(text: string): Promise<CliResult>;
  fill(ref: string, text: string): Promise<CliResult>;
  press(key: string): Promise<CliResult>;
  resize(width: number, height: number): Promise<CliResult>;
  mousewheel(dx: number, dy: number): Promise<CliResult>;
  evalPage(func: string): Promise<CliResult>;
}

export interface ExecutionContext {
  cli: CliCommands;
  llm: LlmClient;
  productLine: string;
  baseUrl: string;
  knowledgeContent: string;
  testCase: TestCase;
}

export interface LLMCodeGenOutput {
  cliCommand: string;
  pythonCode: string;
  targetElement?: PageElement;
  reasoning: string;
}
