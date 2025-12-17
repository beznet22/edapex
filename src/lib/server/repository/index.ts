export * from "./base.repo";
// Re-export as a unified repo object for convenience
import { resultRepo } from "./result.repo";
import { chat } from "./chat.repo";
import { base } from "./base.repo";
export * from "./job.repo";

export const repo = { result: resultRepo, chat, base };
