import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { TestCase, TestStep } from '../shared/types';

const CASES_DIR = path.resolve(process.cwd(), 'data/cases');

interface RawSection {
  name: string;
  precondition: string;
  body: string;
}

/**
 * Parse a structured .md file and return TestCase[].
 *
 * Supports:
 * - Sections starting with `## 用例名称：` heading
 * - `**预置条件**：` for preconditions
 * - Steps in table format (| 测试步骤 | 预期结果 |)
 * - Steps in bullet or numbered list format (separated by ->, →, -, ：)
 *
 * Each parsed case is persisted to data/cases/{id}.json.
 */
export async function parseMarkdown(
  filepath: string,
  productLine: string = 'default',
): Promise<TestCase[]> {
  const content = await readFile(filepath, 'utf-8');
  const sections = extractSections(content);
  const results: TestCase[] = [];

  for (const section of sections) {
    const steps = parseSteps(section.body);
    if (steps.length === 0) continue;

    const id = crypto.randomUUID();
    const testCase: TestCase = {
      id,
      name: section.name,
      productLine,
      precondition: section.precondition || undefined,
      source: 'markdown',
      steps,
      status: 'raw',
    };
    results.push(testCase);

    await writeFile(
      path.join(CASES_DIR, `${id}.json`),
      JSON.stringify(testCase, null, 2),
      'utf-8',
    );
  }

  return results;
}

function extractSections(content: string): RawSection[] {
  const sections: RawSection[] = [];
  const lines = content.split('\n');
  let current: RawSection | null = null;
  let bodyStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^##\s+用例名称[：:]\s*(.+)$/);

    if (headingMatch) {
      if (current) {
        current.body = lines.slice(bodyStart, i).join('\n').trim();
        sections.push(current);
      }
      current = {
        name: headingMatch[1].trim(),
        precondition: '',
        body: '',
      };
      bodyStart = i + 1;
      continue;
    }

    if (current) {
      const precondMatch = line.match(/^\*\*预置条件\*\*[：:]\s*(.*)$/);
      if (precondMatch) {
        current.precondition = precondMatch[1].trim();
        bodyStart = i + 1;
      }
    }
  }

  if (current) {
    current.body = lines.slice(bodyStart).join('\n').trim();
    sections.push(current);
  }

  return sections;
}

function parseSteps(body: string): TestStep[] {
  if (!body.trim()) return [];

  const lines = body.split('\n').filter((l) => l.trim());

  const tableLines = lines.filter((l) => l.trimStart().startsWith('|'));
  if (tableLines.length >= 2) {
    const steps = parseTableSteps(tableLines);
    if (steps.length > 0) return steps;
  }

  return parseListSteps(lines);
}

function parseTableSteps(lines: string[]): TestStep[] {
  const headers = parseTableRow(lines[0]);

  const actionIdx = headers.findIndex(
    (h) =>
      h === '测试步骤' ||
      h === '步骤' ||
      h === '操作步骤' ||
      (h.toLowerCase().includes('step') && !h.startsWith('#')),
  );
  const expectedIdx = headers.findIndex(
    (h) =>
      h === '预期结果' ||
      h === '预期' ||
      h === '结果' ||
      h.toLowerCase().includes('expected'),
  );

  if (actionIdx === -1 && expectedIdx === -1) return [];

  const steps: TestStep[] = [];
  let order = 1;

  const dataLines = lines.slice(1).filter((l) => !/^\|[\s\-:]+\|/.test(l));

  for (const line of dataLines) {
    const cells = parseTableRow(line);
    const actionText =
      actionIdx >= 0 && actionIdx < cells.length ? cells[actionIdx].trim() : '';
    const expectedText =
      expectedIdx >= 0 && expectedIdx < cells.length
        ? cells[expectedIdx].trim()
        : '';

    if (actionText || expectedText) {
      steps.push({ order, actionText, expectedText });
      order++;
    }
  }

  return steps;
}

function parseTableRow(line: string): string[] {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function parseListSteps(lines: string[]): TestStep[] {
  const stepLines = lines.filter((l) => {
    const trimmed = l.trim();
    return (
      trimmed.startsWith('-') ||
      trimmed.startsWith('*') ||
      /^\d+[.、]/.test(trimmed)
    );
  });

  const steps: TestStep[] = [];
  let order = 1;

  for (const line of stepLines) {
    const cleaned = line
      .replace(/^[\s]*[-*]\s+/, '')
      .replace(/^\s*\d+[.、]\s+/, '')
      .trim();

    if (!cleaned) continue;

    const separators = [' -> ', ' → ', ' - ', '：', '\t'];
    let splitIdx = -1;
    let usedSep = '';

    for (const sep of separators) {
      const idx = cleaned.indexOf(sep);
      if (idx > 0) {
        if (splitIdx === -1 || idx < splitIdx) {
          splitIdx = idx;
          usedSep = sep;
        }
      }
    }

    const actionText =
      splitIdx > 0 ? cleaned.slice(0, splitIdx).trim() : cleaned;
    const expectedText =
      splitIdx > 0 ? cleaned.slice(splitIdx + usedSep.length).trim() : '';

    steps.push({ order, actionText, expectedText });
    order++;
  }

  return steps;
}
