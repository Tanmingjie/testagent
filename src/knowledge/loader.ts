import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { ProductLineConfigSchema, type ProductLineConfig } from './schema';

const KNOWLEDGE_DIR = resolve(import.meta.dir, '../../knowledge');

function isJSONFile(file: string): boolean {
  return file.endsWith('.json');
}

/**
 * Load all JSON knowledge base files from the knowledge/ directory.
 * Files that fail validation are skipped with a console warning.
 */
export function loadAll(): ProductLineConfig[] {
  if (!existsSync(KNOWLEDGE_DIR)) {
    console.warn(`Knowledge directory not found: ${KNOWLEDGE_DIR}`);
    return [];
  }

  const files = readdirSync(KNOWLEDGE_DIR).filter(isJSONFile);
  const configs: ProductLineConfig[] = [];

  for (const file of files) {
    try {
      const config = loadOne(join(KNOWLEDGE_DIR, file));
      configs.push(config);
    } catch (err) {
      console.warn(`Skipping knowledge file ${file}: ${(err as Error).message}`);
    }
  }

  return configs;
}

/**
 * Load a single JSON knowledge base file and validate it against the schema.
 */
export function loadOne(filepath: string): ProductLineConfig {
  const raw = readFileSync(filepath, 'utf-8');
  const parsed = JSON.parse(raw);
  return ProductLineConfigSchema.parse(parsed);
}
