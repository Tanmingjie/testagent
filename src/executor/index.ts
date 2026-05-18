import { executeTestCase } from './step-executor';
import { generatePythonCode } from './python-code-generator';
import { buildReport } from './report-builder';
import type { TestCase, ExecutionReport, StepResult } from '@shared/types';
import type { LlmClient } from '@shared/llm-client';
import type { CliCommands } from './types';
import * as cliCommandsModule from './cli-commands';

export async function runTestCase(
  testCase: TestCase,
  productLine: string,
  baseUrl: string,
  knowledgeContent: string,
  llm: LlmClient,
): Promise<{
  results: StepResult[];
  generatedPythonCode: string;
  report: ExecutionReport;
}> {
  const cli: CliCommands = {
    navigate: cliCommandsModule.navigate,
    snapshot: cliCommandsModule.snapshot,
    screenshot: cliCommandsModule.screenshot,
    click: cliCommandsModule.click,
    type: cliCommandsModule.type,
    fill: cliCommandsModule.fill,
    press: cliCommandsModule.press,
    resize: cliCommandsModule.resize,
    mousewheel: cliCommandsModule.mousewheel,
    evalPage: cliCommandsModule.evalPage,
  };

  const { results, interactionLog } = await executeTestCase(
    testCase,
    productLine,
    baseUrl,
    knowledgeContent,
    llm,
    cli,
  );

  const generatedPythonCode = generatePythonCode(interactionLog, testCase);
  const report = buildReport(testCase, interactionLog, generatedPythonCode);

  return { results, generatedPythonCode, report };
}
