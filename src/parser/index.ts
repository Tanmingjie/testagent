import path from 'node:path';
import { parseExcel } from './excel-parser';
import { parseMarkdown } from './markdown-parser';
import type { TestCase } from '../shared/types';

/**
 * Detect file type by extension and delegate to the appropriate parser.
 *
 * Supported: .xlsx, .md
 */
export async function parseFile(
  filepath: string,
  productLine?: string,
): Promise<TestCase[]> {
  const ext = path.extname(filepath).toLowerCase();

  if (ext === '.xlsx') {
    return parseExcel(filepath, productLine);
  }

  if (ext === '.md') {
    return parseMarkdown(filepath, productLine);
  }

  throw new Error(
    `Unsupported file type "${ext}". Only .xlsx and .md are supported.`,
  );
}

export { parseExcel } from './excel-parser';
export { parseMarkdown } from './markdown-parser';
