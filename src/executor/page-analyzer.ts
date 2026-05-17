import type { KnowledgeBase, PageElement, PageSummary, MatchedTerm } from '@shared/types';
import { execCli } from './cli-runner';

// Roles that Playwright can interact with in tests
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'combobox', 'listbox',
  'checkbox', 'radio', 'menuitem', 'tab', 'searchbox',
  'slider', 'spinbutton', 'switch', 'option',
]);

export async function analyzePage(
  navigate: (url: string) => Promise<{ success: boolean; stdout: string; stderr: string }>,
  knowledgeBase: KnowledgeBase,
): Promise<PageSummary> {
  // Navigate to base URL first, then take snapshot
  const baseUrl = knowledgeBase.baseUrl;
  if (baseUrl) {
    await navigate(baseUrl);
  }
  const snapshotResult = execCli(['--raw', 'snapshot']);
  const raw = snapshotResult.stdout || snapshotResult.stderr || '';

  const elements = parseAccessibilityTree(raw);
  const matchedTerms = matchVocabOnElements(elements, knowledgeBase);

  return {
    url: baseUrl || '',
    title: extractTitle(raw),
    elements,
    matchedTerms,
  };
}

export function parseAccessibilityTree(raw: string): PageElement[] {
  if (!raw || !raw.trim()) return [];

  try {
    const parsed = JSON.parse(raw);
    return flattenTree(parsed);
  } catch {
    // not JSON — try text formats below
  }

  const elements: PageElement[] = [];
  const lines = raw.split('\n');

  // Supports both "e1: textbox \"Email\"" and "e1 [textbox \"Email\"]"
  const linePattern = /(e\d+)\s*[:\[=]\s*["']?(\w+)["']?\s+["“](.+?)["”]/;
  const bracketPattern = /(e\d+)\s*\[\s*(\w+)\s+["“](.+?)["”]/;

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(linePattern) || trimmed.match(bracketPattern);
    if (match) {
      const [, ref, role, name] = match;
      if (INTERACTIVE_ROLES.has(role)) {
        elements.push({ ref, role, name });
      }
    }
  }

  // Fallback: YAML-style key-value (ref/role/name on consecutive lines)
  if (elements.length === 0) {
    const yamlElements = parseYamlElements(lines);
    elements.push(...yamlElements);
  }

  return elements;
}

export function matchVocabOnElements(
  elements: PageElement[],
  kb: KnowledgeBase,
): MatchedTerm[] {
  const matched: MatchedTerm[] = [];

  for (const element of elements) {
    const elementName = element.name.toLowerCase();
    for (const entry of kb.vocab) {
      const term = entry.term.toLowerCase();
      if (elementName.includes(term)) {
        matched.push({
          term: entry.term,
          locator: entry.locator || element.ref,
          elementRef: element.ref,
        });
        element.matchedTerm = entry.term;
        element.pythonLocator = entry.locator;
        break;
      }
    }
  }

  return matched;
}

function flattenTree(node: Record<string, unknown>, refCounter = { count: 0 }): PageElement[] {
  const elements: PageElement[] = [];

  const role = String(node.role || '');
  const name = String(node.name || '');

  if (INTERACTIVE_ROLES.has(role)) {
    refCounter.count++;
    const ref = `e${refCounter.count}`;
    elements.push({ ref, role, name });
  }

  const children = node.children as Record<string, unknown>[] | undefined;
  if (children) {
    for (const child of children) {
      elements.push(...flattenTree(child, refCounter));
    }
  }

  return elements;
}

function extractTitle(raw: string): string {
  // Try to extract from YAML: title: "..." or name: "..."
  const titleMatch = raw.match(/(?:title|name)\s*:\s*["“](.+?)["”]/i);
  if (titleMatch) return titleMatch[1];

  // Fallback: first quoted string in the first few lines
  const firstQuoted = raw.match(/["“](.+?)["”]/);
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

    const roleMatch = trimmed.match(/role\s*:\s*["“]?(\w+)["”]?/i);
    if (roleMatch) current.role = roleMatch[1];

    const nameMatch = trimmed.match(/name\s*:\s*["“](.+?)["”]/i);
    if (nameMatch) current.name = nameMatch[1];
  }

  // Push last element
  if (inElement && current.ref && current.role) {
    elements.push(current as PageElement);
  }

  return elements.filter(
    (el) => INTERACTIVE_ROLES.has(el.role) && el.name,
  );
}
