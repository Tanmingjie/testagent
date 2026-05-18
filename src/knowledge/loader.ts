import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const KNOWLEDGE_DIR = resolve(import.meta.dir, '../../knowledge');

export interface ProductMeta {
  name: string;
  baseUrl?: string;
  content: string;
  filePath: string;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; content: string } | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) meta[kv[1]] = kv[2].trim();
  }
  return { meta, content: match[2].trim() };
}

export function loadAll(): ProductMeta[] {
  if (!existsSync(KNOWLEDGE_DIR)) {
    console.warn(`Knowledge directory not found: ${KNOWLEDGE_DIR}`);
    return [];
  }

  const files = readdirSync(KNOWLEDGE_DIR).filter(
    (f) => f.endsWith('.md') && f !== 'template.md',
  );
  const products: ProductMeta[] = [];

  for (const file of files) {
    try {
      const product = loadOne(join(KNOWLEDGE_DIR, file));
      products.push(product);
    } catch (err) {
      console.warn(`Skipping knowledge file ${file}: ${(err as Error).message}`);
    }
  }

  return products;
}

export function loadOne(filepath: string): ProductMeta {
  const raw = readFileSync(filepath, 'utf-8');
  const parsed = parseFrontmatter(raw);
  if (!parsed) {
    throw new Error(`Missing frontmatter in ${filepath}. Expected ---\nname: ...\nbaseUrl: ...\n---`);
  }
  if (!parsed.meta.name) {
    throw new Error(`Missing "name" in frontmatter of ${filepath}`);
  }
  return {
    name: parsed.meta.name,
    baseUrl: parsed.meta.baseUrl || undefined,
    content: parsed.content,
    filePath: filepath,
  };
}
