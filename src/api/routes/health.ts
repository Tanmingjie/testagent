import { Hono } from 'hono';
import type { HealthResponse } from '../contracts/health.api';

const healthRoutes = new Hono();

healthRoutes.get('/api/health', (c) => {
  const response: HealthResponse = { status: 'ok' };
  return c.json(response);
});

export { healthRoutes };
