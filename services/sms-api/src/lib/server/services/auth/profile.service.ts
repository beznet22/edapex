import { z } from "zod";

import type { ServiceContext } from "../context";
import { requireUnscopedContext } from "../context";
import { ValidationError } from "../errors";
import { parseOrThrow } from "../validation";

const patchSchema = z
  .object({
    fullName: z.string().min(1).nullable().optional(),
    username: z.string().min(1).nullable().optional(),
    phoneNumber: z.string().nullable().optional(),
    language: z.string().nullable().optional(),
    styleId: z.number().int().nullable().optional(),
    rtlLtl: z.number().int().nullable().optional(),
    deviceToken: z.string().nullable().optional()
  })
  .strict();

export class ProfileService {
  constructor(private readonly ctx: ServiceContext) {}

  async updateProfile(
    userId: number,
    patch: Readonly<Record<string, unknown>>
  ): Promise<Awaited<ReturnType<ServiceContext["repos"]["accounts"]["findUserById"]>>> {
    if (userId <= 0) {
      throw new ValidationError("A positive user id is required", "userId");
    }
    const parsed = await parseOrThrow(
      () => patchSchema.parseAsync(patch),
      "Profile validation failed"
    );
    const unscoped = requireUnscopedContext(this.ctx.repos.ctx);
    if (Object.keys(parsed).length > 0) {
      await this.ctx.repos.accounts.updateUser(unscoped, userId, {
        ...(parsed.fullName === undefined ? {} : { fullName: parsed.fullName }),
        ...(parsed.username === undefined ? {} : { username: parsed.username }),
        ...(parsed.phoneNumber === undefined ? {} : { phoneNumber: parsed.phoneNumber }),
        ...(parsed.language === undefined ? {} : { language: parsed.language }),
        ...(parsed.styleId === undefined ? {} : { styleId: parsed.styleId }),
        ...(parsed.rtlLtl === undefined ? {} : { rtlLtl: parsed.rtlLtl }),
        ...(parsed.deviceToken === undefined ? {} : { deviceToken: parsed.deviceToken })
      });
    }
    return this.ctx.repos.accounts.findUserById(unscoped, userId);
  }
}
