import { executeTestCase } from './step-executor';
import { generatePythonCode } from './python-code-generator';
import { buildReport } from './report-builder';
import { db } from '../db';
import { testRuns } from '../db/schema';
import type { TestCase, KnowledgeBase, ExecutionReport, StepResult } from '@shared/types';
import type { LlmClient } from '@shared/llm-client';
import type { CliCommands } from './types';
import * as cliCommandsModule from './cli-commands';

/**
 * Run a test case end-to-end:
 *   1. Execute each step via the step executor
 *   2. Generate Python code from passing interactions
 *   3. Build a report (summary, fix prompt, recommendations)
 *   4. Persist the run to the database
 *
 * Execution is synchronous (blocking). Returns the run ID, step results,
 * generated Python code, and the full execution report.
 */
export async function runTestCase(
  testCase: TestCase,
  knowledgeBase: KnowledgeBase,
  llm: LlmClient,
): Promise<{
  runId: string;
  results: StepResult[];
  generatedPythonCode: string;
  report: ExecutionReport;
}> {
  const runId = crypto.randomUUID();

  const cli: CliCommands = {
    navigate: cliCommandsModule.navigate,
    snapshot: cliCommandsModule.snapshot,
    screenshot: cliCommandsModule.screenshot,
    click: cliCommandsModule.click,
    type: cliCommandsModule.type,
    fill: cliCommandsModule.fill,
    press: cliCommandsModule.press,
  };

  const { results, interactionLog } = await executeTestCase(
    testCase,
    knowledgeBase,
    llm,
    cli,
  );

  const generatedPythonCode = generatePythonCode(interactionLog, testCase);

  const report = buildReport(testCase, interactionLog, generatedPythonCode);

  await db.insert(testRuns).values({
    id: runId,
    caseId: testCase.id,
    status: report.summary.fail > 0 ? 'failed' : 'passed',
    summaryJson: JSON.stringify(report),
    generatedPythonCode,
    fixPrompt: report.fixPrompt,
  });

  return { runId, results, generatedPythonCode, report };
}
