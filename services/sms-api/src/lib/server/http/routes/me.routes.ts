import { Hono } from "hono";

import { createService, MyClassesService, ProfileService, StaffPhotoService } from "../../services";
import { AuthError, NotFoundError, PermissionError } from "../../services/errors";
import { toSessionDto, toUserDto } from "../dto/auth";
import type { AppContext } from "../env";
import { profilePatchBody } from "../schemas/auth";
import { staffPhotoForm } from "../schemas/staff";
import { formBody, jsonBody } from "../validation";

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
  })
  /*
   * A staff member's own photo.
   *
   * The id comes from the session, never the URL: a self-service endpoint that accepts an
   * arbitrary staff id is a privilege bug one refactor away. `requireAuth` already gates this
   * router, so the only extra check is that the caller *has* a staff record — a parent or
   * student account has no `sm_staffs` row to attach a picture to.
   */
  .put("/photo", formBody(staffPhotoForm), async (c) => {
    const user = c.get("user");
    if (user === null) throw new AuthError();
    if (user.staffId === null) {
      throw new PermissionError("A staff account is required to set a profile photo");
    }
    const { file } = c.req.valid("form");
    const photo = await createService(StaffPhotoService, c.get("ctx")).saveOwn(
      user.staffId,
      file
    );
    c.header("Cache-Control", "no-store");
    return c.json(photo, 200);
  })
  .delete("/photo", async (c) => {
    const user = c.get("user");
    if (user === null) throw new AuthError();
    if (user.staffId === null) {
      throw new PermissionError("A staff account is required to change a profile photo");
    }
    await createService(StaffPhotoService, c.get("ctx")).removeOwn(user.staffId);
    return c.body(null, 204);
  })
  /**
   * The classes this caller may open a roster for.
   *
   * Needs the tenant middleware (for the academic year) but deliberately not
   * `requireClassScope`: the whole point is to discover a class, so requiring one up front
   * would be circular.
   */
  .get("/classes", async (c) => {
    const user = c.get("user");
    if (user === null) throw new AuthError();
    const classes = await createService(MyClassesService, c.get("ctx")).list({
      isAdmin: user.isAdmin,
      staffId: user.staffId
    });
    c.header("Cache-Control", "no-store");
    return c.json({ classes }, 200);
  });
