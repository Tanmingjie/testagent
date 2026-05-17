import { type KnowledgeBase } from '@shared/types';
import { loadAll } from './loader';
import { db } from '../db';
import { knowledge } from '../db/schema';
import type { ProductLineConfig } from './schema';

export class KnowledgeService {
  private configs: ProductLineConfig[];

  constructor() {
    this.configs = loadAll() as ProductLineConfig[];
  }

  /**
   * Get all available product line names.
   */
  async getProductLines(): Promise<string[]> {
    return this.configs.map(c => c.name);
  }

  /**
   * Get the full knowledge base for a product line.
   * Returns null if the product line is not found.
   */
  async getKnowledgeBase(productLine: string): Promise<KnowledgeBase | null> {
    const config = this.configs.find(c => c.name === productLine);
    if (!config) return null;
    return this.toKnowledgeBase(config);
  }

  /**
   * Find vocabulary terms from the knowledge base that appear in the given text.
   * Matching is case-insensitive for English terms.
   */
  matchTerms(
    text: string,
    kb: KnowledgeBase,
  ): Array<{ term: string; locator?: string }> {
    const matched: Array<{ term: string; locator?: string }> = [];
    const lowerText = text.toLowerCase();

    for (const entry of kb.vocab) {
      if (lowerText.includes(entry.term.toLowerCase())) {
        matched.push({ term: entry.term, locator: entry.locator });
      }
    }

    return matched;
  }

  /**
   * Build an LLM context string from the knowledge base, including
   * matched vocabulary terms, test data, and behaviors.
   */
  buildContext(text: string, kb: KnowledgeBase): string {
    const matchedTerms = this.matchTerms(text, kb);
    const parts: string[] = [];

    if (matchedTerms.length > 0) {
      parts.push('### Matched Vocabulary Terms');
      for (const m of matchedTerms) {
        const loc = m.locator ? ` (locator: ${m.locator})` : '';
        parts.push(`- ${m.term}${loc}`);
      }
      parts.push('');
    }

    if (kb.testData.length > 0) {
      parts.push('### Test Data');
      for (const td of kb.testData) {
        const env = td.environment ? ` [env: ${td.environment}]` : '';
        parts.push(`- ${td.key}: ${td.value}${env}`);
      }
      parts.push('');
    }

    if (kb.behaviors.length > 0) {
      const sorted = [...kb.behaviors].sort(
        (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
      );
      parts.push('### Behaviors');
      for (const b of sorted) {
        parts.push(`- [${b.priority}] ${b.instruction}`);
      }
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * Get test data entries, optionally filtered by environment.
   */
  getTestData(
    kb: KnowledgeBase,
    environment?: string,
  ): Array<{ key: string; value: string }> {
    let entries = kb.testData;
    if (environment) {
      entries = entries.filter(
        e => !e.environment || e.environment === environment,
      );
    }
    return entries.map(e => ({ key: e.key, value: e.value }));
  }

  /**
   * Get behaviors sorted by priority (high → medium → low).
   */
  getBehaviors(
    kb: KnowledgeBase,
  ): Array<{ instruction: string; priority: string }> {
    return [...kb.behaviors]
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
      .map(b => ({ instruction: b.instruction, priority: b.priority }));
  }

  /**
   * Look up a precondition by name.
   * Returns null if not found.
   */
  getPrecondition(
    kb: KnowledgeBase,
    name: string,
  ): { name: string; steps: string[] } | null {
    const entry = kb.preconditions.find(p => p.name === name);
    if (!entry) return null;
    return { name: entry.name, steps: entry.steps };
  }

  /**
   * Cache a product line's knowledge base to the database (upsert).
   * Knowledge files remain the source of truth; the DB is a read-through cache.
   */
  async cacheToDb(productLine: string): Promise<void> {
    const kb = await this.getKnowledgeBase(productLine);
    if (!kb) {
      throw new Error(`Knowledge base not found: ${productLine}`);
    }

    const configJson = JSON.stringify(kb);

    await db
      .insert(knowledge)
      .values({
        productLine: kb.productLine,
        configYaml: configJson,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: knowledge.productLine,
        set: {
          configYaml: configJson,
          updatedAt: new Date().toISOString(),
        },
      });
  }

  /**
   * Convert a ProductLineConfig (from loader) to a KnowledgeBase (shared type).
   */
  private toKnowledgeBase(config: ProductLineConfig): KnowledgeBase {
    return {
      productLine: config.name,
      baseUrl: config.baseUrl,
      vocab: config.vocab.map(v => ({
        term: v.term,
        locator: v.locator,
        description: v.description,
      })),
      testData: config.testData.map(td => ({
        key: td.key,
        value: td.value,
        environment: td.environment,
      })),
      behaviors: config.behaviors.map(b => ({
        instruction: b.instruction,
        priority: b.priority,
      })),
      preconditions: config.preconditions.map(p => ({
        name: p.name,
        description: p.description,
        steps: p.steps,
      })),
    };
  }
}

const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};
