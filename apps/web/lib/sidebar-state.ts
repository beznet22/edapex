/**
 * Sidebar collapse state, persisted in a cookie.
 *
 * Splitting note: this module is **server-safe** and is imported by the workspace layout
 * during render. The hooks live in `sidebar-state-hooks.ts`, because a `"use client"`
 * directive here would turn `readSidebarCookie` into a client reference and calling it
 * from a server component throws at render time — a failure no build step catches. The
 * theme module hit exactly this and was split for the same reason.
 *
 * # Why a cookie
 *
 * The rail width is a first-paint concern. Reading localStorage in an effect renders the
 * rail expanded and then snaps it to icon width, which is a visible layout shift on every
 * load.
 *
 * # Default
 *
 * Expanded. This is a three-destination app used twice a week by teachers: labels are the
 * faster path, and collapsing is an optimisation people opt into once they know where
 * things are.
 */

export const SIDEBAR_COOKIE = "edapex.sidebar";

export type SidebarState = "expanded" | "collapsed";

export function parseSidebarState(raw: string | null | undefined): SidebarState {
  // Unknown values fall back to the default rather than throwing: a stale or mangled
  // cookie must not stop the shell from rendering.
  return raw === "collapsed" ? "collapsed" : "expanded";
}

export function readSidebarCookie(cookieHeader: string | null | undefined): SidebarState {
  if (!cookieHeader) return "expanded";
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === SIDEBAR_COOKIE) {
      return parseSidebarState(decodeURIComponent(part.slice(index + 1).trim()));
    }
  }
  return "expanded";
}

/** One year, matching the theme cookie. */
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
