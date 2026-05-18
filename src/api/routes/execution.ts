import { Hono } from 'hono';
import { db } from '../../db';
import { testRuns, testCases } from '../../db/schema';
import { eq, desc } from 'drizzle-orm';
import { runTestCase } from '../../executor';
import { KnowledgeService } from '../../knowledge/knowledge-service';
import { LlmClient } from '../../shared/llm-client';
import type {
  RunResponse,
  RunStatusResponse,
  RunListResponse,
} from '../contracts/execution.api';

const executionRoutes = new Hono();

function getLlmClient(): LlmClient {
  return new LlmClient({
    apiUrl: process.env.LLM_API_URL || 'http://localhost:11434/v1',
    apiKey: process.env.LLM_API_KEY || 'not-needed',
    model: process.env.LLM_MODEL_NAME || 'qwen2.5-72b',
  });
}

executionRoutes.post('/api/execution/run/:testCaseId', async (c) => {
  try {
    const testCaseId = c.req.param('testCaseId');

    const [tc] = await db.select().from(testCases).where(eq(testCases.id, testCaseId)).limit(1);
    if (!tc) {
      return c.json({ error: 'Test case not found' }, 404);
    }

    const steps = JSON.parse(tc.stepsJson || '[]');

    const kb = new KnowledgeService();
    const baseUrl = kb.getBaseUrl(tc.productLine);
    const knowledgeContent = kb.buildContext(tc.productLine);

    if (!baseUrl) {
      return c.json({ error: `No baseUrl configured for product line: ${tc.productLine}` }, 400);
    }

    const testCase = {
      id: tc.id,
      name: tc.name,
      productLine: tc.productLine,
      source: tc.source as 'excel' | 'markdown',
      status: tc.status as 'raw' | 'translated' | 'decomposed' | 'executed',
      steps,
    };

    const runId = crypto.randomUUID();
    await db.insert(testRuns).values({
      id: runId,
      caseId: testCaseId,
      status: 'running',
      summaryJson: JSON.stringify({ total: steps.length, pass: 0, fail: 0, blocked: 0, steps: [] }),
    });

    const llm = getLlmClient();

    runTestCase(testCase, tc.productLine, baseUrl, knowledgeContent, llm)
      .then(async (result) => {
        await db.update(testRuns).set({
          status: result.report.summary.fail > 0 ? 'failed' : 'passed',
          summaryJson: JSON.stringify(result.report),
          generatedPythonCode: result.generatedPythonCode,
          fixPrompt: result.report.fixPrompt,
        }).where(eq(testRuns.id, runId));
      })
      .catch(async (err) => {
        await db.update(testRuns).set({
          status: 'error',
          summaryJson: JSON.stringify({ total: steps.length, pass: 0, fail: steps.length, blocked: 0, steps: [] }),
          fixPrompt: `Execution error: ${err instanceof Error ? err.message : String(err)}`,
        }).where(eq(testRuns.id, runId));
      });

    return c.json({ runId }, 201);
  } catch (err: any) {
    console.error('Execution failed:', err.message);
    return c.json({ error: `Execution failed: ${err.message}` }, 500);
  }
});

executionRoutes.get('/api/execution/runs', async (c) => {
  const runs = await db
    .select()
    .from(testRuns)
    .orderBy(desc(testRuns.createdAt))
    .limit(50);

  const caseIds = [...new Set(runs.map((r) => r.caseId))];
  const cases = caseIds.length > 0
    ? await db.select({ id: testCases.id, name: testCases.name }).from(testCases)
    : [];
  const caseNameMap = new Map(cases.map((tc) => [tc.id, tc.name]));

  const response: RunListResponse = {
    runs: runs.map((r) => ({
      runId: r.id,
      caseId: r.caseId,
      caseName: caseNameMap.get(r.caseId) ?? r.caseId,
      status: r.status,
      createdAt: r.createdAt,
    })),
  };
  return c.json(response);
});

executionRoutes.delete('/api/execution/runs', async (c) => {
  await db.delete(testRuns);
  return c.json({ deleted: true });
});

executionRoutes.get('/api/execution/runs/:runId', async (c) => {
  const runId = c.req.param('runId');

  const [run] = await db
    .select()
    .from(testRuns)
    .where(eq(testRuns.id, runId))
    .limit(1);

  if (!run) {
    const response: RunStatusResponse = {
      runId,
      status: 'running',
      summary: { total: 0, pass: 0, fail: 0, blocked: 0 },
      steps: [],
      generatedPythonCode: '',
      fixPrompt: '',
    };
    return c.json(response);
  }

  const [tc] = await db.select({ name: testCases.name, stepsJson: testCases.stepsJson })
    .from(testCases).where(eq(testCases.id, run.caseId)).limit(1);
  const caseSteps: Record<number, string> = {};
  if (tc) {
    const parsed = JSON.parse(tc.stepsJson);
    for (const s of parsed) {
      caseSteps[s.order ?? s.stepOrder] = s.actionText || s.action || '';
    }
  }

  const summary = JSON.parse(run.summaryJson);
  const rawSteps: any[] = summary.steps ?? [];
  const enrichedSteps = rawSteps.map((s: any) => ({
    ...s,
    stepOrder: s.stepOrder ?? s.order ?? 0,
    action: caseSteps[s.stepOrder ?? s.order] || '',
    screenshotUrl: s.screenshotPath
      ? `/api/screenshots/${s.screenshotPath.split('/').pop()}`
      : undefined,
  }));

  const response: RunStatusResponse = {
    runId: run.id,
    status: run.status,
    testCaseId: run.caseId,
    caseName: tc?.name ?? run.caseId,
    summary: {
      total: summary.total ?? 0,
      pass: summary.pass ?? 0,
      fail: summary.fail ?? 0,
      blocked: summary.blocked ?? 0,
    },
    steps: enrichedSteps,
    generatedPythonCode: run.generatedPythonCode ?? '',
    fixPrompt: run.fixPrompt ?? '',
  };
  return c.json(response);
});

export { executionRoutes };
