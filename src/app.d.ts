// See https://svelte.dev/docs/kit/types#app.d.ts

import type { AuthUser, Session } from "$lib/types/auth-types";

// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      user: AuthUser | null;
      session: Session | null;
    }
    // interface PageData {}
    interface PageState {
      settings?: any;
      showModal?: boolean;
      showPreview?: boolean;
    }
  }
}

export {};
