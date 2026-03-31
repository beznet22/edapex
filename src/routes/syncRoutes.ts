import { Hono } from 'hono';
import { SyncController } from '../controllers/SyncController';

const syncRoutes = new Hono();

/**
 * @api {post} /sync/reconcile Reconcile client changes
 */
syncRoutes.post('/reconcile', (c) => SyncController.reconcile(c));

export { syncRoutes };
