import { Hono } from 'hono';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { KnowledgeService } from '../../knowledge/knowledge-service';
import type { KnowledgeBase } from '@shared/types';
import type {
  ProductLineResponse,
  KnowledgeResponse,
} from '../contracts/knowledge.api';

const KNOWLEDGE_DIR = resolve(import.meta.dir, '../../../knowledge');

const knowledgeService = new KnowledgeService();
const knowledgeRoutes = new Hono();

knowledgeRoutes.get('/api/product-lines', async (c) => {
  const names = await knowledgeService.getProductLines();
  const lines: ProductLineResponse[] = names.map((name) => ({ id: name, name }));
  return c.json(lines);
});

knowledgeRoutes.post('/api/product-lines', async (c) => {
  return c.json({ message: 'Product lines reloaded from knowledge directory' });
});

knowledgeRoutes.get('/api/knowledge/:productLineId', async (c) => {
  const productLine = c.req.param('productLineId');
  const kb = await knowledgeService.getKnowledgeBase(productLine);
  if (!kb) {
    return c.json({ error: `Product line "${productLine}" not found` }, 404);
  }
  return c.json(toKnowledgeResponse(kb));
});

knowledgeRoutes.put('/api/knowledge/:productLineId', async (c) => {
  const productLine = c.req.param('productLineId');
  const kb = await knowledgeService.getKnowledgeBase(productLine);
  if (!kb) {
    return c.json({ error: `Product line "${productLine}" not found` }, 404);
  }

  const updates = await c.req.json();

  const updated: KnowledgeBase = {
    ...kb,
    ...(updates.vocab ? { vocab: updates.vocab } : {}),
    ...(updates.testData ? { testData: updates.testData } : {}),
    ...(updates.behaviors ? { behaviors: updates.behaviors } : {}),
    ...(updates.preconditions ? { preconditions: updates.preconditions } : {}),
  };

  const filePath = findKnowledgeFile(productLine);
  if (!filePath) {
    return c.json({ error: 'Knowledge file not found on disk' }, 500);
  }

  const config = {
    name: updated.productLine,
    baseUrl: updated.baseUrl,
    vocab: updated.vocab.map((v) => ({
      term: v.term,
      locator: v.locator,
      description: v.description,
    })),
    testData: updated.testData.map((td) => ({
      key: td.key,
      value: td.value,
      environment: td.environment,
    })),
    behaviors: updated.behaviors.map((b) => ({
      instruction: b.instruction,
      priority: b.priority,
    })),
    preconditions: updated.preconditions.map((p) => ({
      name: p.name,
      description: p.description,
      steps: p.steps,
    })),
  };

  writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
  await knowledgeService.cacheToDb(productLine);

  return c.json(toKnowledgeResponse(updated));
});

function toKnowledgeResponse(kb: KnowledgeBase): KnowledgeResponse {
  return {
    vocab: kb.vocab.map((v) => ({ term: v.term, locator: v.locator })),
    testData: kb.testData.map((td) => ({ key: td.key, value: td.value })),
    behaviors: kb.behaviors.map((b) => ({
      instruction: b.instruction,
      priority: b.priority,
    })),
    preconditions: kb.preconditions.map((p) => ({
      name: p.name,
      steps: p.steps,
    })),
  };
}

function findKnowledgeFile(productLine: string): string | null {
  if (!existsSync(KNOWLEDGE_DIR)) return null;
  const entries = readdirSync(KNOWLEDGE_DIR);
  for (const file of entries) {
    if (file.endsWith('.json')) {
      const filePath = join(KNOWLEDGE_DIR, file);
      try {
        const content = readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed.name === productLine) return filePath;
      } catch {
        continue;
      }
    }
  }
  return null;
}

export { knowledgeRoutes };
