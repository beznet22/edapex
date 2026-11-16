import { clsx } from "clsx";
import type { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * The one class-merge helper.
 *
 * shadcn components import `@edapex/ui/lib/utils`, and `apps/web/lib/utils.ts` re-exports
 * this so an existing `@/lib/utils` import keeps working. One definition, one
 * `tailwind-merge` instance — two would disagree about which class wins.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
