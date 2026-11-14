import {
  buildCapabilityManifest,
  type CapabilityManifest,
  type CapabilityRole
} from "@edapex/contracts";
import type { ServerCapabilities } from "@edapex/contracts/platform";

import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import type { AuthUser } from "../auth/types";

/**
 * Resolves the workspace role from the authenticated EdApex identity. The
 * manifest is a view of server-owned capabilities, never a client claim.
 */
export class CapabilityService {
  constructor(private readonly ctx: ServiceContext) {}

  async manifestFor(user: AuthUser): Promise<CapabilityManifest> {
    return buildCapabilityManifest(await this.resolveRole(user));
  }

  serverCapabilities(user: AuthUser): ServerCapabilities {
    const staff = user.isAdmin || user.staffId !== null;
    return {
      webSearch: staff && this.ctx.ports.webSearch.configured,
      webFetch: staff && this.ctx.ports.webFetch.configured,
      cloudOcr: true
    };
  }

  private async resolveRole(user: AuthUser): Promise<CapabilityRole> {
    if (user.isAdmin) return "admin";
    if (user.staffId !== null) return "teacher";
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const parent = await this.ctx.repos.profiles.findParentByUserId(scoped, user.id);
    if (parent !== null) return "parent";
    return "student";
  }
}
