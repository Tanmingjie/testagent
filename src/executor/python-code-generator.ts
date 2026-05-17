import type { TestCase, Interaction } from '@shared/types';

export function generatePythonCode(
  interactionLog: Interaction[],
  testCase: TestCase,
): string {
  const passingSteps = interactionLog
    .filter((ix) => ix.passed && ix.pythonCode)
    .sort((a, b) => a.stepOrder - b.stepOrder);

  const methodName = toSnakeCase(testCase.name);
  const lines: string[] = [
    'from playwright.sync_api import Page, expect',
    '',
    '',
    `def test_${methodName}(page: Page):`,
  ];

  for (const step of passingSteps) {
    const comment = `# Step ${step.stepOrder}`;
    const codeLines = step.pythonCode.split('\n').filter(Boolean);
    lines.push(`    ${comment}`);
    for (const codeLine of codeLines) {
      const indented = codeLine.startsWith(' ') ? codeLine : `    ${codeLine}`;
      lines.push(indented);
    }
    lines.push('');
  }

  if (passingSteps.length === 0) {
    lines.push('    # No passing steps to generate');
    lines.push('    pass');
  }

  return lines.join('\n');
}

function toSnakeCase(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff\s_-]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()
    || 'unnamed_test';
}
