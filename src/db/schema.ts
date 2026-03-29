export * from "./domain-core";
export * from "./domain-academic";
export * from "./domain-ai";
export * from "./domain-assessment";
export * from "./domain-attendance";
export * from "./domain-cms";
export * from "./domain-communication";
export * from "./domain-documents";
export * from "./domain-events";
export * from "./domain-facilities";
export * from "./domain-finance";
export * from "./domain-hr";
export * from "./domain-library";
export * from "./domain-pbac";
export * from "./domain-settings";
export * from "./domain-lms";

import { users, accounts, sessions, authAccounts, authVerifications } from "./domain-core";
import { aiChats, aiMessages } from "./domain-ai";

// Authoritative Types
export type User = typeof users.$inferSelect;
export type Staff = typeof users.$inferSelect;
export type Student = typeof users.$inferSelect;
export type Parent = typeof users.$inferSelect;
export type AIChat = typeof aiChats.$inferSelect;
export type AIMessage = typeof aiMessages.$inferSelect;

// Better-Auth Core exports & Database Types
export { sessions, accounts, authAccounts, authVerifications } from "./domain-core";

// Auth Types (Better-Auth canonical models)
export type AuthUser = typeof accounts.$inferSelect;
export type AuthSession = typeof sessions.$inferSelect;
export type AuthAccount = typeof authAccounts.$inferSelect;
export type AuthVerification = typeof authVerifications.$inferSelect;

// Re-export specific metadata unions for convenience if needed, 
// though 'export *' already handles individual type exports.
