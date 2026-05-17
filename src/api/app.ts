import { Hono } from 'hono';
import { healthRoutes } from './routes/health';
import { knowledgeRoutes } from './routes/knowledge';
import { executionRoutes } from './routes/execution';
import testCaseRoutes from './routes/test-cases';

const app = new Hono();

app.route('/', healthRoutes);
app.route('/', knowledgeRoutes);
app.route('/', executionRoutes);
app.route('/api/test-cases', testCaseRoutes);

export { app };
