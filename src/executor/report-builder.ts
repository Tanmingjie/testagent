import type { TestCase, Interaction, ExecutionReport, StepResult } from '@shared/types';
import { classifyFailure } from './step-executor';

/**
 * Build a complete execution report from the interaction log.
 * Aggregates pass/fail/blocked counts, per-step results, fix prompt, and recommendations.
 */
export function buildReport(
  testCase: TestCase,
  interactionLog: Interaction[],
  generatedPythonCode: string,
): ExecutionReport {
  const steps: StepResult[] = interactionLog.map((ix) => {
    const status = ix.passed ? 'PASS' : classifyFailure(ix.error || '');
    return {
      stepOrder: ix.stepOrder,
      status,
      error: ix.error,
      pythonCode: ix.pythonCode,
    };
  });

  const pass = steps.filter((s) => s.status === 'PASS').length;
  const fail = steps.filter((s) => s.status === 'FAIL').length;
  const blocked = steps.filter((s) => s.status === 'BLOCK').length;

  const summary = { total: steps.length, pass, fail, blocked, steps };
  const fixPrompt = generateFixPrompt(testCase, interactionLog);
  const recommendations = generateRecommendations(interactionLog);

  return {
    summary,
    steps,
    generatedPythonCode,
    fixPrompt,
    recommendations,
  };
}

/**
 * Generate actionable fix instructions for failed steps.
 * Returns an empty string if all steps passed.
 *
 * Output format (mirrors TestSprite-style):
 *   I ran automated tests. Here are the issues:
 *
 *   ## `{stepName}`
 *   - What happened: {error}
 *   - What was expected: {expected}
 *   - Classification: {FAIL|BLOCK}
 *   - Suggested fix: {specific suggestion}
 */
export function generateFixPrompt(
  testCase: TestCase,
  interactionLog: Interaction[],
): string {
  const failedSteps = interactionLog.filter((ix) => !ix.passed);
  if (failedSteps.length === 0) return '';

  const lines: string[] = [
    'I ran automated tests. Here are the issues:',
    '',
  ];

  const stepMap = new Map(testCase.steps.map((s) => [s.order, s]));

  for (const ix of failedSteps) {
    const step = stepMap.get(ix.stepOrder);
    const status = classifyFailure(ix.error || '');
    const stepName = step?.actionText || `Step ${ix.stepOrder}`;

    lines.push(`## \`${stepName}\``);
    lines.push(`- What happened: ${ix.error || 'Unknown error'}`);
    lines.push(`- What was expected: ${step?.expectedText || 'N/A'}`);
    lines.push(`- Classification: ${status}`);
    lines.push(`- Suggested fix: ${suggestFix(ix, step ?? undefined)}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function generateRecommendations(interactionLog: Interaction[]): string[] {
  const recommendations: string[] = [];
  const failedSteps = interactionLog.filter((ix) => !ix.passed);

  if (failedSteps.length === 0) {
    recommendations.push('All steps passed. No recommendations needed.');
    return recommendations;
  }

  const blockCount = failedSteps.filter(
    (ix) => classifyFailure(ix.error || '') === 'BLOCK',
  ).length;

  if (blockCount > 0) {
    recommendations.push(
      'Address blocking issues (timeouts, CAPTCHAs, network errors) before retrying.',
    );
  }

  recommendations.push(
    'Review LLM-generated element selectors — failures may be due to incorrect locators.',
  );
  recommendations.push(
    'Verify the target application is in the expected state before test execution.',
  );

  return recommendations;
}

function suggestFix(
  ix: Interaction,
  step?: { actionText: string; expectedText: string },
): string {
  const error = ix.error?.toLowerCase() || '';

  if (error.includes('timeout') || error.includes('timeouterror')) {
    return 'Increase wait time or ensure the page/element is loaded before interacting.';
  }
  if (
    error.includes('not found') ||
    error.includes('no such element') ||
    error.includes('unable to locate')
  ) {
    return 'Verify the element locator — the target may have a different ref, role, or name.';
  }
  if (
    error.includes('navigation') ||
    error.includes('net::err') ||
    error.includes('enetunreach')
  ) {
    return 'Check the base URL and network connectivity.';
  }

  return 'Review the LLM-generated command and element selection. Consider retrying with a different approach.';
}
