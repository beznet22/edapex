import { env } from "$env/dynamic/public";

export const allowAnonymousChats = env.PUBLIC_ALLOW_ANONYMOUS_CHATS === "true";