import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { users } from "../../src/lib/server/db/schema";
import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import { ProfileService } from "../../src/lib/server/services/auth";
import { ValidationError } from "../../src/lib/server/services/errors";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let school: SeededSchool;
let service: ProfileService;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  service = createService(
    ProfileService,
    createServiceContext({ DB: env.DB }, null)
  );
});

describe("profile service", () => {
  it("updates only the whitelisted profile fields", async () => {
    const updated = await service.updateProfile(school.userId, {
      fullName: "Updated User",
      phoneNumber: "0700000099",
      styleId: 2
    });
    expect(updated).toMatchObject({
      fullName: "Updated User",
      phoneNumber: "0700000099",
      styleId: 2
    });

    const rows = await db
      .select()
      .from(users)
      .where(eq(users.id, school.userId));
    expect(rows[0]?.fullName).toBe("Updated User");
  });

  it("rejects unknown fields and invalid user ids", async () => {
    await expect(
      service.updateProfile(school.userId, { fullName: "X", password: "nope" })
    ).rejects.toBeInstanceOf(ValidationError);

    await expect(service.updateProfile(0, { fullName: "X" })).rejects.toBeInstanceOf(
      ValidationError
    );
  });
});
