export * from "./domain-core.js";
export * from "./domain-academic.js";
export * from "./domain-ai.js";
export * from "./domain-assessment.js";
export * from "./domain-attendance.js";
export * from "./domain-cms.js";
export * from "./domain-communication.js";
export * from "./domain-documents.js";
export * from "./domain-events.js";
export * from "./domain-facilities.js";
export * from "./domain-finance.js";
export * from "./domain-hr.js";
export * from "./domain-library.js";
export * from "./domain-pbac.js";
export * from "./domain-settings.js";
export * from "./domain-lms.js";

import { users, accounts, sessions, authAccounts, authVerifications } from "./domain-core.js";
import { aiChats, aiMessages } from "./domain-ai.js";

// Authoritative Types
export type User = typeof users.$inferSelect;
export type Staff = typeof users.$inferSelect;
export type Student = typeof users.$inferSelect;
export type Parent = typeof users.$inferSelect;
export type AIChat = typeof aiChats.$inferSelect;
export type AIMessage = typeof aiMessages.$inferSelect;

// Better-Auth Core exports & Database Types
export { sessions, accounts, authAccounts, authVerifications } from "./domain-core.js";

// Auth Types (Better-Auth canonical models)
export type AuthUser = typeof accounts.$inferSelect;
export type AuthSession = typeof sessions.$inferSelect;
export type AuthAccount = typeof authAccounts.$inferSelect;
export type AuthVerification = typeof authVerifications.$inferSelect;
