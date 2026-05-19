import type { PageElement, PageSummary } from '@shared/types';
import { execCli } from './cli-runner';

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'combobox', 'listbox',
  'checkbox', 'radio', 'menuitem', 'tab', 'searchbox',
  'slider', 'spinbutton', 'switch', 'option',
]);

export async function analyzePage(
  navigate: (url: string) => Promise<{ success: boolean; stdout: string; stderr: string }>,
  baseUrl: string,
): Promise<PageSummary> {
  execCli(['mousewheel', '0', '10000']);
  await new Promise((r) => setTimeout(r, 800));
  execCli(['mousewheel', '0', '-10000']);

  const snapshotResult = execCli(['snapshot', '--boxes']);
  const raw = snapshotResult.stdout || snapshotResult.stderr || '';

  const elements = parseAccessibilityTree(raw);

  return {
    url: baseUrl,
    title: extractTitle(raw),
    elements,
    matchedTerms: [],
  };
}

export function parseAccessibilityTree(raw: string): PageElement[] {
  if (!raw || !raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw);
    return flattenTree(parsed);
  } catch {
  }

  const elements: PageElement[] = [];
  const lines = raw.split('\n');

  const linePattern = /(e\d+)\s*[:\[=]\s*["']?(\w+)["']?\s+[""](.+?)[""]/;
  const bracketPattern = /(e\d+)\s*\[\s*(\w+)\s+[""](.+?)[""]/;
  const refPattern = /(\w+)\s+[""](.+?)[""]\s+\[ref=(e\d+)\]/;

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(linePattern) || trimmed.match(bracketPattern);
    if (match) {
      const [, ref, role, name] = match;
      if (INTERACTIVE_ROLES.has(role)) {
        elements.push({ ref, role, name });
      }
      continue;
    }
    const refMatch = trimmed.match(refPattern);
    if (refMatch) {
      const [, role, name, ref] = refMatch;
      if (INTERACTIVE_ROLES.has(role)) {
        elements.push({ ref, role, name });
      }
    }
  }

  if (elements.length === 0) {
    elements.push(...parseYamlElements(lines));
  }

  return elements;
}

function flattenTree(node: Record<string, unknown>): PageElement[] {
  const elements: PageElement[] = [];
  const role = String(node.role || '');
  const name = String(node.name || '');
  const ref = String(node.ref || '');

  if (INTERACTIVE_ROLES.has(role) && ref) {
    elements.push({ ref, role, name });
  }

  const children = node.children as Record<string, unknown>[] | undefined;
  if (children) {
    for (const child of children) {
      elements.push(...flattenTree(child));
    }
  }

  return elements;
}

function extractTitle(raw: string): string {
  const titleMatch = raw.match(/(?:title|name)\s*:\s*[""](.+?)[""]/i);
  if (titleMatch) return titleMatch[1];
  const firstQuoted = raw.match(/[""](.+?)[""]/);
  return firstQuoted ? firstQuoted[1] : '';
}

function parseYamlElements(lines: string[]): PageElement[] {
  const elements: PageElement[] = [];
  let current: Partial<PageElement> = {};
  let inElement = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^-\s/.test(trimmed) || /^\w+\s*:/.test(trimmed)) {
      if (inElement && current.ref && current.role) {
        elements.push(current as PageElement);
      }
      current = {};
      inElement = true;
    }

    if (!inElement) continue;

    const refMatch = trimmed.match(/ref\s*:\s*(e\d+)/i);
    if (refMatch) current.ref = refMatch[1];
    const roleMatch = trimmed.match(/role\s*:\s*[""]?(\w+)[""]?/i);
    if (roleMatch) current.role = roleMatch[1];
    const nameMatch = trimmed.match(/name\s*:\s*[""](.+?)[""]/i);
    if (nameMatch) current.name = nameMatch[1];
  }

  if (inElement && current.ref && current.role) {
    elements.push(current as PageElement);
  }

  return elements.filter((el) => INTERACTIVE_ROLES.has(el.role) && el.name);
}
