import { Hono } from 'hono';
import { db } from '../../db';
import { testRuns } from '../../db/schema';
import { eq, desc } from 'drizzle-orm';
import type {
  RunResponse,
  RunStatusResponse,
  RunListResponse,
} from '../contracts/execution.api';

const executionRoutes = new Hono();

executionRoutes.post('/api/execution/run/:testCaseId', async (c) => {
  const runId = crypto.randomUUID();
  const response: RunResponse = { runId };
  return c.json(response, 201);
});

executionRoutes.get('/api/execution/runs', async (c) => {
  const runs = await db
    .select()
    .from(testRuns)
    .orderBy(desc(testRuns.createdAt))
    .limit(50);

  const response: RunListResponse = {
    runs: runs.map((r) => ({
      runId: r.id,
      caseId: r.caseId,
      status: r.status,
      createdAt: r.createdAt,
    })),
  };
  return c.json(response);
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

  const summary = JSON.parse(run.summaryJson);
  const response: RunStatusResponse = {
    runId: run.id,
    status: run.status,
    summary: {
      total: summary.total ?? 0,
      pass: summary.pass ?? 0,
      fail: summary.fail ?? 0,
      blocked: summary.blocked ?? 0,
    },
    steps: summary.steps ?? [],
    generatedPythonCode: run.generatedPythonCode ?? '',
    fixPrompt: run.fixPrompt ?? '',
  };
  return c.json(response);
});

export { executionRoutes };
