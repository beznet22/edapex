/**
 * ==========================================
 * Layer: DOMAIN INTERFACES (Anti-Corruption Layer)
 * Protocol: @database-architect, @backend-architect
 * ==========================================
 * Purpose:
 *   Abstract definitions that describe the generic boundaries of data access.
 *   Services depend STRICTLY on these Interfaces—never on concrete implementations.
 *   This ensures seamless DB switching without requiring any business logic changes.
 * 
 * Pattern Rules:
 *   - Filename convention: `camelCase.interface.ts`.
 *   - Define `Promises` containing structured domain data types.
 *   - No implementation or framework-specific imports allowed here.
 */

export * from './core.interface.js';
export * from './pbac.interface.js';
export * from './settings.interface.js';
export * from './ai.interface.js';
export * from './academic.interface.js';
export * from './hr.interface.js';
export * from './lms.interface.js';
export * from './attendance.interface.js';
export * from './assessment.interface.js';
export * from './finance.interface.js';
export * from './facilities.interface.js';
export * from './library.interface.js';
export * from './communication.interface.js';
export * from './events.interface.js';
export * from './cms.interface.js';
export * from './documents.interface.js';
export * from './finance.interface.js';
export * from './facilities.interface.js';
export * from './library.interface.js';
