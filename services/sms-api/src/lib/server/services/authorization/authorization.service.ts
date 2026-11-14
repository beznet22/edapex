import type { ServiceContext } from "../context";
import { requireUnscopedContext } from "../context";
import { ValidationError } from "../errors";

export class AuthorizationService {
  constructor(private readonly ctx: ServiceContext) {}

  async isAdmin(userId: number): Promise<boolean> {
    if (userId <= 0) {
      throw new ValidationError("A positive user id is required", "userId");
    }
    const unscoped = requireUnscopedContext(this.ctx.repos.ctx);
    const user = await this.ctx.repos.accounts.findUserById(unscoped, userId);
    return user?.isAdministrator === "yes";
  }
}
