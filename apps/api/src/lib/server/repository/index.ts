/**
 * Root repository barrel (`R8`): consumers import from here or from a folder
 * barrel, never from a deep file path. Every aggregate folder is re-exported.
 */
export * from "./base";
export * from "./accounts";
export * from "./profiles";
export * from "./queries";
export * from "./academics";
export * from "./assessments";
export * from "./attendance";
export * from "./communications";
export * from "./school";
export * from "./reference";
