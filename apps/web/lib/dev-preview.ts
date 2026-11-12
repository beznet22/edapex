import { buildCapabilityManifest } from "@edapex/contracts";

import type { SessionView } from "@/lib/api";

/**
 * Visual development harness only. Next inlines NODE_ENV, so production builds
 * never enable this path. It does not call the API and carries no school data.
 */
export const DEV_AUTH_BYPASS =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS !== "0";

export const DEV_PREVIEW_SESSION: SessionView = {
  user: {
    id: 0,
    fullName: "Dev Admin",
    email: "dev@localhost"
  },
  sessionId: "dev-preview",
  expiresAt: Math.floor(Date.now() / 1000) + 3600
};

export const DEV_PREVIEW_MANIFEST = buildCapabilityManifest("admin");
