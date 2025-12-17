import { BookOpenCheck } from "@lucide/svelte";
import { Megaphone } from "@lucide/svelte";
import { FileText } from "@lucide/svelte";
import { Library } from "@lucide/svelte";
// Add others as needed

export const iconRegistry = {
  BookOpenCheck,
  Megaphone,
  FileText,
  Library,
} as const;

export type IconName = keyof typeof iconRegistry;
