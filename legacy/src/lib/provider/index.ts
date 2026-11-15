/**
 * Client-safe provider module barrel.
 *
 * Pure data + Zod schemas + error classes. Safe to import in client and server
 * contexts. For server-only modules (EdApexGateway, GatewayRouter, credentials,
 * crypto, transform, visibility), import from `$lib/server/mastra/provider`.
 */
export * from './types';
export * from './spec';
export * from './errors';
export * from './catalog';
