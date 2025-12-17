// src/lib/server/auth.ts
import { Lucia } from "lucia";
import { adapter } from "./db";
import type { User } from "./db/schema";
import { dev } from "$app/environment";

export const auth = new Lucia(adapter, {
  sessionCookie: {
    attributes: {
      secure: !dev,
    },
  },
  getUserAttributes: (attributes) => {
    return {
      id: attributes.id,
      email: attributes.email,
      username: attributes.username,
      fullName: attributes.fullName,
      usertype: attributes.usertype,
      roleId: attributes.roleId,
      schoolId: attributes.schoolId,
      activeStatus: attributes.activeStatus,
      isRegistered: attributes.isRegistered,
      isAdministrator: attributes.isAdministrator,
      verified: attributes.verified,
      walletBalance: attributes.walletBalance,
    };
  },
});

declare module "lucia" {
  interface Register {
    Lucia: typeof auth;
    UserId: number;
    DatabaseUserAttributes: User;
  }
}

export type Auth = typeof auth;
