import { Context } from 'hono';
import { SyncService } from '../services/sync.service';
import { getDatabaseV2 } from '../db/index';
import { BaseController } from './BaseController';

/**
 * SyncController
 * Handles TanStack DB reconciliation requests.
 */
export class SyncController extends BaseController {
  /**
   * POST /sync
   * Reconcile client changes with the edge database.
   */
  static async reconcile(c: Context) {
    const body = await c.req.json();
    const dialect = c.env.D1_DB ? "d1" : (process.env.DATABASE_DIALECT || "sqlite");
    const syncService = new SyncService(c.env, dialect);
    
    try {
      const result = await syncService.reconcile(body);
      return this.sendSuccess(c, result);
    } catch (error: any) {
      return this.sendError(c, error.message);
    }
  }
}
