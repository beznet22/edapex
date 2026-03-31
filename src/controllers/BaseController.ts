import { Context } from 'hono';

/**
 * BaseController
 * Mandated abstraction for all Hono route handlers.
 * Ensures consistent error handling and response formatting.
 */
export abstract class BaseController {
  /**
   * Standard Success Response
   */
  protected static sendSuccess(c: Context, data: any, message = 'Success', status: number = 200) {
    return c.json({
      success: true,
      message,
      data,
    }, status as any);
  }

  /**
   * Standard Error Response
   */
  protected static sendError(c: Context, message: string, status: number = 400) {
    return c.json({
      success: false,
      message,
    }, status as any);
  }
}
