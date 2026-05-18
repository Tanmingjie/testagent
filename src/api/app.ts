import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { resolve as pathResolve } from 'node:path';
import { healthRoutes } from './routes/health';
import { executionRoutes } from './routes/execution';
import testCaseRoutes from './routes/test-cases';

const app = new Hono();

app.route('/', healthRoutes);
app.route('/', executionRoutes);
app.route('/api/test-cases', testCaseRoutes);

const screenshotsDir = pathResolve(process.cwd(), 'data/screenshots');
app.get('/api/screenshots/:filename', async (c) => {
  const filename = c.req.param('filename');
  const filePath = pathResolve(screenshotsDir, filename);
  if (!filePath.startsWith(screenshotsDir)) {
    return c.text('Forbidden', 403);
  }
  try {
    const data = await readFile(filePath);
    return new Response(data, { headers: { 'Content-Type': 'image/png' } });
  } catch {
    return c.text('Not found', 404);
  }
});

export { app };
