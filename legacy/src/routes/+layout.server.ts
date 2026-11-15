import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals }) => {
  const user = locals.user;
  if (!user) {
    return { user: null };
  }

  // Derive a UI-facing `role` from the auth/identity fields already on AuthUser.
  // Order of precedence matches the PlatformTab gating contract in Phase 2:
  // `isAdministrator === true` wins, then `designation === "it"`, else pass
  // through whatever designation the user has (e.g. "principal", "class_teacher"),
  // and fall back to null for unrecognised identities.
  const role: string | null = user.isAdministrator
    ? "admin"
    : user.designation === "it"
      ? "it"
      : user.designation ?? null;

  return {
    user: {
      ...user,
      role
    }
  };
};
