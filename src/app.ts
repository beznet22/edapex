import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { routes } from './routes/index';

type Bindings = {
  NODE_VERSION: string;
  D1_DB: any; // Type 'D1Database' from @cloudflare/workers-types if available
  PREFER_OPENAI?: string;
}

export const app = new Hono<{ Bindings: Bindings }>();

// Global Middleware
app.use('*', cors());

// Base API Path
app.route('/api/v1', routes);

// Health Check
app.get('/health', (c) => c.json({ status: 'ok', environment: c.env.NODE_VERSION }));

export default app;
