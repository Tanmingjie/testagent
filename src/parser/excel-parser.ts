import * as XLSX from 'xlsx';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { TestCase, TestStep } from '../shared/types';

const COLUMN_MAP: Record<string, string> = {
  '用例名称': 'name',
  '用例名': 'name',
  '测试用例': 'name',
  'case name': 'name',
  'casename': 'name',
  '预置条件': 'precondition',
  '前置条件': 'precondition',
  '条件': 'precondition',
  'precondition': 'precondition',
  '测试步骤': 'actionText',
  '步骤': 'actionText',
  '操作步骤': 'actionText',
  'test step': 'actionText',
  'teststep': 'actionText',
  'step description': 'actionText',
  '预期结果': 'expectedText',
  '预期': 'expectedText',
  '结果': 'expectedText',
  'expected result': 'expectedText',
  'expectedresult': 'expectedText',
  '所属模块': 'module',
  '模块': 'module',
  '模块名称': 'module',
  'module': 'module',
};

const CASES_DIR = path.resolve(process.cwd(), 'data/cases');

function findHeaderRow(
  rows: string[][],
): { index: number; colMap: Record<number, string> } | null {
  for (let i = 0; i < rows.length; i++) {
    const mapping: Record<number, string> = {};
    let matched = 0;

    for (let j = 0; j < rows[i].length; j++) {
      const val = rows[i][j].toLowerCase();
      const field = COLUMN_MAP[val];
      if (field) {
        mapping[j] = field;
        matched++;
      }
    }

    if (matched >= 2) {
      return { index: i, colMap: mapping };
    }
  }
  return null;
}

function normalizeRows(raw: unknown[][]): string[][] {
  return raw.map((row) =>
    row.map((cell) => {
      if (cell == null) return '';
      return String(cell).trim();
    }),
  );
}

/**
 * Parse an .xlsx file and return TestCase[].
 *
 * Each worksheet is a module. Rows sharing the same 用例名称 are grouped
 * into one TestCase with multiple steps. Merged cells are forward-filled.
 * Each parsed case is persisted to data/cases/{id}.json.
 */
export async function parseExcel(
  filepath: string,
  productLine: string = 'default',
): Promise<TestCase[]> {
  const workbook = XLSX.readFile(filepath);
  const allCases: TestCase[] = [];

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (raw.length === 0) continue;

    const rows = normalizeRows(raw);
    const header = findHeaderRow(rows);
    if (!header) continue;

    const { index: headerRowIdx, colMap } = header;

    const nameColIdx = keyIdx(colMap, 'name');
    const actionColIdx = keyIdx(colMap, 'actionText');
    const expectedColIdx = keyIdx(colMap, 'expectedText');
    const preconditionColIdx = keyIdx(colMap, 'precondition');
    const moduleColIdx = keyIdx(colMap, 'module');

    let lastName = '';
    let lastPrecondition = '';
    let lastModule = moduleColIdx !== undefined ? '' : sheetName;

    const caseMap = new Map<
      string,
      { name: string; precondition: string; module: string; steps: TestStep[] }
    >();

    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (row.every((cell) => cell.length === 0)) continue;

      const rawName = nameColIdx !== undefined ? row[nameColIdx] : '';
      const actionText = actionColIdx !== undefined ? row[actionColIdx] : '';
      const expectedText =
        expectedColIdx !== undefined ? row[expectedColIdx] : '';
      const rawPrecondition =
        preconditionColIdx !== undefined ? row[preconditionColIdx] : '';
      const rawModule = moduleColIdx !== undefined ? row[moduleColIdx] : '';

      if (rawName) lastName = rawName;
      if (rawPrecondition) lastPrecondition = rawPrecondition;
      if (moduleColIdx !== undefined && rawModule) lastModule = rawModule;

      const caseName = lastName || `Sheet-${sheetName}-Row-${r}`;
      const moduleName = lastModule || sheetName;

      if (!caseMap.has(caseName)) {
        caseMap.set(caseName, {
          name: caseName,
          precondition: lastPrecondition,
          module: moduleName,
          steps: [],
        });
      }

      const testCase = caseMap.get(caseName)!;

      if (actionText || expectedText) {
        testCase.steps.push({
          order: testCase.steps.length + 1,
          actionText,
          expectedText,
        });
      }
    }

    for (const [, tc] of caseMap) {
      if (tc.steps.length === 0) continue;

      const id = crypto.randomUUID();
      const testCase: TestCase = {
        id,
        name: tc.name,
        productLine,
        precondition: tc.precondition || undefined,
        source: 'excel',
        steps: tc.steps,
        status: 'raw',
      };
      allCases.push(testCase);

      await writeFile(
        path.join(CASES_DIR, `${id}.json`),
        JSON.stringify(testCase, null, 2),
        'utf-8',
      );
    }
  }

  return allCases;
}

function keyIdx(
  map: Record<number, string>,
  field: string,
): number | undefined {
  for (const [k, v] of Object.entries(map)) {
    if (v === field) return Number(k);
  }
  return undefined;
}
