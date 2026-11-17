import { Hono } from "hono";
import { z } from "zod";

import { pushDeviceSchema, pushEventSchema } from "@edapex/contracts/push";

import { AuthError, NotFoundError, PermissionError } from "../../services/errors";
import { PushService } from "../../services/push";
import type { AppContext } from "../env";
import { jsonBody } from "../validation";

const prefsBody = z.object({
  mutedKinds: z.array(z.string()).default([]),
  quietHours: z.boolean().default(true)
});

/**
 * A device registers itself.
 *
 * The token is the address, so it is stored per install rather than per person:
 * a teacher's phone and laptop are separate rows and either can go away without
 * touching the other.
 */
export const pushDevices = new Hono<AppContext>()
  .post("/devices", jsonBody(pushDeviceSchema), async (c) => {
    const user = c.get("user");
    if (user === null) throw new AuthError();
    const body = c.req.valid("json");
    const registered = await new PushService(c.get("ctx")).register(user.id, {
      platform: body.platform,
      token: body.token,
      installId: body.installId,
      keysJson: body.keys === undefined ? null : JSON.stringify(body.keys)
    });
    c.header("Cache-Control", "no-store");
    return c.json(registered, 201);
  })
  .delete("/devices/:id", async (c) => {
    const user = c.get("user");
    if (user === null) throw new AuthError();
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) throw new NotFoundError("Device", c.req.param("id"));
    await new PushService(c.get("ctx")).revoke(user.id, id);
    return c.body(null, 204);
  })
  .patch("/notification-prefs", jsonBody(prefsBody), async (c) => {
    const user = c.get("user");
    if (user === null) throw new AuthError();
    const result = await new PushService(c.get("ctx")).setPreferences(
      user.id,
      JSON.stringify(c.req.valid("json"))
    );
    c.header("Cache-Control", "no-store");
    return c.json(result, 200);
  });

/**
 * The producer side, called by `cowork-api` over a service binding.
 *
 * A shared secret rather than a session cookie: this is one Worker talking to
 * another, and `cowork-api` has no user session to present. The route does not
 * fan out inline — it enqueues, so a class change does not become 400 sends in
 * one request.
 */
export const internalPush = new Hono<AppContext>().post("/push", async (c) => {
  const secret = c.env.INTERNAL_PUSH_SECRET;
  if (secret === undefined || secret.length === 0) {
    return c.json({ error: { code: "not_configured", message: "Push is not configured." } }, 503);
  }
  if (c.req.header("x-edapex-internal-secret") !== secret) {
    throw new PermissionError("Invalid internal secret.");
  }

  const parsed = pushEventSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: { code: "invalid_input", message: "Push event is malformed." } },
      400
    );
  }

  const queue = c.env.PUSH_QUEUE;
  if (queue === undefined) {
    return c.json({ error: { code: "not_configured", message: "Push queue is not bound." } }, 503);
  }
  await queue.send(parsed.data);
  return c.json({ accepted: true, eventId: parsed.data.id }, 202);
});
