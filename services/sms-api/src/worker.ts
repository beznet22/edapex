import { app } from "./lib/server/http/app";
import type { AppEnv } from "./lib/server/http/env";

export default app satisfies ExportedHandler<AppEnv>;
