/**
 * ==========================================
 * Layer: SERVER (ENTRYPOINT)
 * Protocol: @backend-dev-guidelines
 * ==========================================
 * Purpose:
 *   The ultimate bootstrapper of the backend application.
 *   
 * Process Flow:
 *   1. Resolve Dependency Injection (instantiate exact repos based on DB dialect config).
 *   2. Instantiate Services passing the resolved repos.
 *   3. Instantiate Controllers.
 *   4. Start up the HTTP server layer binding to the defined `PORT`.
 */

// import { serve } from '@hono/node-server';
// import { app } from './app';
//
// serve({ fetch: app.fetch, port: 3000 });
