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
      previewToken?: string;
    }
  }
}

export { };

declare module 'gray-matter' {
  interface GrayMatterFile {
    data: Record<string, unknown>;
    content: string;
    excerpt?: string;
    orig: string;
    isEmpty: boolean;
  }

  function matter(input: string, options?: Record<string, unknown>): GrayMatterFile;

  export = matter;
}

declare module 'chokidar' {
  interface WatchOptions {
    persistent?: boolean;
    ignoreInitial?: boolean;
    awaitWriteFinish?: boolean | { stabilityThreshold?: number; pollInterval?: number };
  }

  interface FSWatcher {
    on(event: string, callback: (...args: unknown[]) => void): FSWatcher;
    close(): Promise<void>;
  }

  function watch(paths: string | string[], options?: WatchOptions): FSWatcher;

  export { watch, type FSWatcher, type WatchOptions };
}
