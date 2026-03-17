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

import { users, accounts, sessions } from "./domain-core";
import { chats, messages } from "./domain-ai";

// Authoritative Types
export type User = typeof users.$inferSelect;
export type Staff = typeof users.$inferSelect;
export type Student = typeof users.$inferSelect;
export type Parent = typeof users.$inferSelect;
export type DBChat = typeof chats.$inferSelect;
export type DBMessage = typeof messages.$inferSelect;

// Lucia Auth re-exports
export { sessions, accounts } from "./domain-core";

// Re-export specific metadata unions for convenience if needed, 
// though 'export *' already handles individual type exports.
