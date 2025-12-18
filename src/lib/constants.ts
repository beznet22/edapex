import { env } from "$env/dynamic/public";
import { join } from "path";

export const STORAGE_DIR = join(process.cwd(), "storage");
export const UPLOADS_DIR = join(STORAGE_DIR, "uploads");
export const CACHE_DIR = join(STORAGE_DIR, "cache");

export const allowAnonymousChats = env.PUBLIC_ALLOW_ANONYMOUS_CHATS === "true";

