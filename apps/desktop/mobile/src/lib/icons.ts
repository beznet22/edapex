import {
  Bot,
  Brain,
  Camera,
  CheckCheck,
  File,
  Image,
  Library,
  ListChecks,
  Pencil,
  Plug,
  ScanLine,
  Settings,
  UserCircle,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { IconName } from "@/lib/nav";

/** One icon set, one mapping. A second map is how two rows for the same thing drift apart. */
export const ICONS: Readonly<Record<IconName, LucideIcon>> = {
  bot: Bot,
  library: Library,
  check: CheckCheck,
  list: ListChecks,
  users: Users,
  plug: Plug,
  settings: Settings,
  user: UserCircle,
  scan: ScanLine,
  camera: Camera,
  image: Image,
  file: File,
  brain: Brain,
  pencil: Pencil
};
