import { Hono } from "hono";

import { AuthError, createService } from "../../services";
import { CapabilityService } from "../../services/workspace";
import type { AppContext } from "../env";
import { agentWeb } from "./agent-web.routes";

export const agent = new Hono<AppContext>()
  .get("/capabilities", async (c) => {
    const user = c.get("user");
    if (user === null) throw new AuthError();
    const manifest = await createService(
      CapabilityService,
      c.get("ctx")
    ).manifestFor(user);
    c.header("Cache-Control", "private, no-store");
    return c.json(manifest, 200);
  })
  .get("/platform-capabilities", async (c) => {
    const user = c.get("user");
    if (user === null) throw new AuthError();
    const capabilities = createService(
      CapabilityService,
      c.get("ctx")
    ).serverCapabilities(user);
    c.header("Cache-Control", "private, no-store");
    return c.json(capabilities, 200);
  })
  .route("/web", agentWeb);
