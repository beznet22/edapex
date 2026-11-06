import { Hono } from "hono";

import { createService, ProfileService } from "../../services";
import { AuthError, NotFoundError } from "../../services/errors";
import { toSessionDto, toUserDto } from "../dto/auth";
import type { AppContext } from "../env";
import { profilePatchBody } from "../schemas/auth";
import { jsonBody } from "../validation";

export const me = new Hono<AppContext>()
  .get("/", (c) => {
    const session = c.get("session");
    if (session === null) throw new AuthError();
    c.header("Cache-Control", "no-store");
    return c.json(toSessionDto(session), 200);
  })
  .patch("/", jsonBody(profilePatchBody), async (c) => {
    const user = c.get("user");
    if (user === null) throw new AuthError();
    const patch = c.req.valid("json");
    const updated = await createService(
      ProfileService,
      c.get("baseCtx")
    ).updateProfile(user.id, patch);
    if (updated === null) throw new NotFoundError("User", user.id);
    c.header("Cache-Control", "no-store");
    return c.json(
      {
        user: toUserDto({
          ...user,
          email: updated.email,
          username: updated.username,
          fullName: updated.fullName,
          roleId: updated.roleId ?? user.roleId,
          isAdmin: updated.isAdministrator === "yes"
        })
      },
      200
    );
  });
