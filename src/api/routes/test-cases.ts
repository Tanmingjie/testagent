import { Hono } from "hono";
import { eq, like, and } from "drizzle-orm";
import { writeFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";

import { db } from "../../db";
import { testCases } from "../../db/schema";
import { parseFile } from "../../parser";
import { translateTestCase } from "../../translator/translate-service";
import { decomposeTestCase } from "../../translator/decompose-service";
import { translatorPrompt, decomposerPrompt } from "../../shared/llm-prompts";
import { TestCaseSchema } from "../../shared/schemas";
import { KnowledgeService } from "../../knowledge/knowledge-service";
import { LlmClient } from "../../shared/llm-client";
import type { TestCase, TestStep } from "../../shared/types";

const router = new Hono();

const CASES_DIR = path.resolve(process.cwd(), "data/cases");

const knowledgeService = new KnowledgeService();

function getLlmClient(): LlmClient {
  return new LlmClient({
    apiUrl: process.env.LLM_API_URL || "http://localhost:11434/v1",
    apiKey: process.env.LLM_API_KEY || "not-needed",
    model: process.env.LLM_MODEL_NAME || "qwen2.5-72b",
  });
}

async function findCaseOr404(id: string) {
  const [row] = await db
    .select()
    .from(testCases)
    .where(eq(testCases.id, id))
    .limit(1);
  return row ?? null;
}

function rowToTestCase(row: NonNullable<Awaited<ReturnType<typeof findCaseOr404>>>): TestCase {
  return {
    id: row.id,
    name: row.name,
    productLine: row.productLine,
    source: row.source,
    steps: JSON.parse(row.stepsJson) as TestStep[],
    status: row.status,
  };
}

router.post("/import", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"] as File | undefined;
  const productLineId = body["productLineId"] as string | undefined;

  if (!file || !productLineId) {
    c.status(400);
    return c.json({ error: "Missing required fields: file, productLineId", status: 400 });
  }

  if (!file.name.endsWith(".xlsx") && !file.name.endsWith(".md")) {
    c.status(400);
    return c.json({ error: "Unsupported file type. Only .xlsx and .md are supported.", status: 400 });
  }

  const tempDir = path.resolve(process.cwd(), "data/temp");
  await mkdir(tempDir, { recursive: true });
  const ext = file.name.endsWith(".xlsx") ? ".xlsx" : ".md";
  const tempPath = path.join(tempDir, `${crypto.randomUUID()}${ext}`);

  try {
    const buffer = await file.arrayBuffer();
    await writeFile(tempPath, new Uint8Array(buffer));

    await mkdir(CASES_DIR, { recursive: true });

    const parsed = await parseFile(tempPath, productLineId);

    const imported: Array<{ id: string; name: string; status: string }> = [];
    for (const tc of parsed) {
      await db.insert(testCases).values({
        id: tc.id,
        name: tc.name,
        productLine: tc.productLine,
        stepsJson: JSON.stringify(tc.steps),
        originalStepsJson: JSON.stringify(tc.steps),
        source: tc.source,
        status: tc.status,
      });
      imported.push({ id: tc.id, name: tc.name, status: tc.status });
    }

    return c.json({ cases: imported });
  } finally {
    await rm(tempPath, { force: true }).catch(() => {});
  }
});

router.get("/", async (c) => {
  const productLine = c.req.query("productLine");
  const status = c.req.query("status");
  const search = c.req.query("search");

  const filters = [];
  if (productLine) filters.push(eq(testCases.productLine, productLine));
  if (status) filters.push(eq(testCases.status, status as typeof testCases.status._.data));
  if (search) filters.push(like(testCases.name, `%${search}%`));

  const query = db.select().from(testCases);
  const rows = filters.length > 0
    ? await query.where(and(...filters))
    : await query;

  return c.json({
    cases: rows.map((r) => ({
      id: r.id,
      name: r.name,
      productLine: r.productLine,
      status: r.status,
    })),
  });
});

router.get("/tree", async (c) => {
  const rows = await db.select().from(testCases);
  const withSteps = c.req.query("withSteps") === "true";

  const groupMap = new Map<string, Array<any>>();
  for (const r of rows) {
    const key = r.productLine;
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    const entry: any = {
      id: r.id,
      name: r.name,
      status: r.status,
    };
    if (withSteps) {
      const stepsJson = r.originalStepsJson || r.stepsJson;
      const steps = JSON.parse(stepsJson);
      entry.steps = steps.map((s: any) => ({
        order: s.order,
        actionText: s.actionText,
        expectedText: s.expectedText,
      }));
    }
    groupMap.get(key)!.push(entry);
  }

  const modules = Array.from(groupMap.entries()).map(([name, cases]) => ({
    name,
    cases,
  }));

  return c.json({ modules });
});

router.delete("/batch", async (c) => {
  const productLine = c.req.query("productLine");
  if (productLine) {
    await db.delete(testCases).where(eq(testCases.productLine, productLine));
  } else {
    await db.delete(testCases);
  }
  return c.json({ deleted: true });
});

router.get("/product-lines", (c) => {
  const lines = knowledgeService.getProductLines();
  return c.json({ productLines: lines.map((p) => ({ id: p.name, name: p.name, baseUrl: p.baseUrl })) });
});

router.get("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await findCaseOr404(id);

  if (!row) {
    c.status(404);
    return c.json({ error: "Test case not found", status: 404 });
  }

  const steps = JSON.parse(row.stepsJson) as TestStep[];

  return c.json({
    id: row.id,
    name: row.name,
    productLine: row.productLine,
    steps: steps.map((s) => ({
      order: s.order,
      actionText: s.actionText,
      expectedText: s.expectedText,
    })),
    status: row.status,
  });
});

router.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const row = await findCaseOr404(id);

  if (!row) {
    c.status(404);
    return c.json({ error: "Test case not found", status: 404 });
  }

  await db.delete(testCases).where(eq(testCases.id, id));

  const filePath = path.join(CASES_DIR, `${id}.json`);
  await rm(filePath, { force: true }).catch(() => {});

  return c.json({ deleted: true });
});

router.post("/:id/translate", async (c) => {
  const id = c.req.param("id");
  const row = await findCaseOr404(id);

  if (!row) {
    c.status(404);
    return c.json({ error: "Test case not found", status: 404 });
  }

  const knowledgeService = new KnowledgeService();
  const knowledgeContent = knowledgeService.buildContext(row.productLine);

  const llm = getLlmClient();
  const testCase = rowToTestCase(row);

  try {
    const translated = await translateTestCase(testCase, knowledgeContent, llm);

    await db
      .update(testCases)
      .set({
        stepsJson: JSON.stringify(translated.steps),
        status: "translated",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(testCases.id, id));

    const filePath = path.join(CASES_DIR, `${id}.json`);
    await writeFile(filePath, JSON.stringify(translated, null, 2), "utf-8").catch(() => {});

    c.status(202);
    return c.json({
      status: "translated",
      steps: translated.steps.map((s) => ({
        order: s.order,
        actionText: s.actionText,
        expectedText: s.expectedText,
      })),
    });
  } catch (err) {
    c.status(500);
    return c.json({
      error: `Translation failed: ${err instanceof Error ? err.message : String(err)}`,
      status: 500,
    });
  }
});

router.post("/:id/decompose", async (c) => {
  const id = c.req.param("id");
  const row = await findCaseOr404(id);

  if (!row) {
    c.status(404);
    return c.json({ error: "Test case not found", status: 404 });
  }

  const knowledgeService = new KnowledgeService();
  const knowledgeContent = knowledgeService.buildContext(row.productLine);

  const llm = getLlmClient();
  const testCase = rowToTestCase(row);

  try {
    const decomposed = await decomposeTestCase(testCase, knowledgeContent, llm);

    await db
      .update(testCases)
      .set({
        stepsJson: JSON.stringify(decomposed.steps),
        status: "decomposed",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(testCases.id, id));

    const filePath = path.join(CASES_DIR, `${id}.json`);
    await writeFile(filePath, JSON.stringify(decomposed, null, 2), "utf-8").catch(() => {});

    c.status(202);
    return c.json({
      status: "decomposed",
      steps: decomposed.steps.map((s) => ({
        order: s.order,
        actionText: s.actionText,
        expectedText: s.expectedText,
      })),
    });
  } catch (err) {
    c.status(500);
    return c.json({
      error: `Decomposition failed: ${err instanceof Error ? err.message : String(err)}`,
      status: 500,
    });
  }
});

router.post("/:id/translate/stream", async (c) => {
  const id = c.req.param("id");
  const row = await findCaseOr404(id);
  if (!row) return c.json({ error: "Not found" }, 404);

  const ks = new KnowledgeService();
  const knowledgeContent = ks.buildContext(row.productLine);
  const llm = getLlmClient();
  const testCase = rowToTestCase(row);

  const messages = [
    { role: "system", content: translatorPrompt() },
    { role: "user", content: `请标准化以下原始测试用例：\n\`\`\`json\n${JSON.stringify(testCase, null, 2)}\n\`\`\`\n\n${knowledgeContent ? `## 产品知识库\n${knowledgeContent}` : ""}` },
  ];

  const stream = new ReadableStream({
    async start(controller) {
      let full = "";
      try {
        for await (const chunk of llm.chatCompletionStream(messages, { responseFormat: { type: "json_object" } })) {
          full += chunk;
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ chunk })}\n\n`));
        }
        const parsed = JSON.parse(full);
        const translated = TestCaseSchema.parse(parsed);
        await db.update(testCases).set({ stepsJson: JSON.stringify(translated.steps), status: "translated", updatedAt: new Date().toISOString() }).where(eq(testCases.id, id));
        const steps = translated.steps.map((s: any) => ({ order: s.order, actionText: s.actionText, expectedText: s.expectedText }));
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ status: "done", steps })}\n\n`));
      } catch (err: any) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ status: "error", error: err.message })}\n\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
});

router.post("/:id/decompose/stream", async (c) => {
  const id = c.req.param("id");
  const row = await findCaseOr404(id);
  if (!row) return c.json({ error: "Not found" }, 404);

  const ks = new KnowledgeService();
  const knowledgeContent = ks.buildContext(row.productLine);
  const llm = getLlmClient();
  const testCase = rowToTestCase(row);

  const messages = [
    { role: "system", content: decomposerPrompt() },
    { role: "user", content: `请将以下测试用例的复合步骤拆解为原子操作：\n\`\`\`json\n${JSON.stringify(testCase, null, 2)}\n\`\`\`\n\n${knowledgeContent ? `## 产品知识库\n${knowledgeContent}` : ""}` },
  ];

  const stream = new ReadableStream({
    async start(controller) {
      let full = "";
      try {
        for await (const chunk of llm.chatCompletionStream(messages, { responseFormat: { type: "json_object" } })) {
          full += chunk;
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ chunk })}\n\n`));
        }
        const parsed = JSON.parse(full);
        const decomposed = TestCaseSchema.parse(parsed);
        await db.update(testCases).set({ stepsJson: JSON.stringify(decomposed.steps), status: "decomposed", updatedAt: new Date().toISOString() }).where(eq(testCases.id, id));
        const steps = decomposed.steps.map((s: any) => ({ order: s.order, actionText: s.actionText, expectedText: s.expectedText }));
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ status: "done", steps })}\n\n`));
      } catch (err: any) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ status: "error", error: err.message })}\n\n`));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
});

export default router;
