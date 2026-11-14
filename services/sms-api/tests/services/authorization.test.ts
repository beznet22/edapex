import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { users } from "../../src/lib/server/db/schema";
import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import { AuthorizationService } from "../../src/lib/server/services/authorization";
import { ValidationError } from "../../src/lib/server/services/errors";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let school: SeededSchool;
let service: AuthorizationService;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  service = createService(
    AuthorizationService,
    createServiceContext({ DB: env.DB }, null)
  );
});

describe("authorization service", () => {
  it("reads the administrator flag from the user row", async () => {
    await expect(service.isAdmin(school.userId)).resolves.toBe(false);

    await db
      .update(users)
      .set({ isAdministrator: "yes" })
      .where(eq(users.id, school.userId));

    await expect(service.isAdmin(school.userId)).resolves.toBe(true);
  });

  it("returns false for an unknown user and rejects an invalid id", async () => {
    await expect(service.isAdmin(999999)).resolves.toBe(false);
    await expect(service.isAdmin(0)).rejects.toBeInstanceOf(ValidationError);
  });
});
