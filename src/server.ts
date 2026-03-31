import { app } from './app';

/**
 * Cloudflare Workers Entrypoint
 */
export default {
  fetch: app.fetch,
};
