import { command, getRequestEvent } from "$app/server";
import { allowAnonymousChats } from "$lib/constants";
import { CredentialType } from "$lib/schema/chat-schema";
import {
  storeApiKey,
  deleteApiKey,
  getUserProviderKeys,
} from "$lib/server/provider/router";
import { discoverModels, saveUserModelsCached } from "$lib/server/provider/discovery";
import z from "zod";

export const addProvider = command(
  z.object({
    provider: z.enum(CredentialType),
    apiKey: z.string().min(1),
  }),
  async ({ provider, apiKey }) => {
    const { locals } = getRequestEvent();
    if (!locals.user && !allowAnonymousChats) {
      return { success: false, message: "Unauthorized" };
    }

    if (!locals.user) {
      return { success: false, message: "User session required to store API keys" };
    }

    try {
      await storeApiKey(locals.user.id, provider, apiKey);

      // Trigger dynamic model discovery in the background
      try {
        const models = await discoverModels(provider, apiKey);
        if (models.length > 0) {
          saveUserModelsCached(locals.user.id, provider, models);
        }
      } catch (discoveryError) {
        console.error(`[addProvider:${provider}] Model discovery failed:`, discoveryError);
      }

      return { success: true, message: `${provider} API key saved and models discovered` };
    } catch (error) {
      console.error(`[addProvider:${provider}] Failed to store API key:`, error);
      return { success: false, message: "Failed to save API key" };
    }
  },
);

export const removeProvider = command(
  z.object({
    provider: z.enum(CredentialType),
  }),
  async ({ provider }) => {
    const { locals } = getRequestEvent();
    if (!locals.user && !allowAnonymousChats) {
      return { success: false, message: "Unauthorized" };
    }

    if (!locals.user) {
      return { success: false, message: "User session required" };
    }

    try {
      const deleted = await deleteApiKey(locals.user.id, provider);
      if (!deleted) {
        return { success: false, message: `No API key found for ${provider}` };
      }
      return { success: true, message: `${provider} API key removed` };
    } catch (error) {
      console.error(`[removeProvider:${provider}] Failed to remove API key:`, error);
      return { success: false, message: "Failed to remove API key" };
    }
  },
);

export const getProviders = command(
  z.object({}),
  async () => {
    const { locals } = getRequestEvent();
    if (!locals.user && !allowAnonymousChats) {
      return { success: false, message: "Unauthorized", providers: [] };
    }

    if (!locals.user) {
      return { success: true, message: "No user session", providers: [] };
    }

    try {
      const providers = await getUserProviderKeys(locals.user.id);
      return { success: true, providers };
    } catch (error) {
      console.error("[getProviders] Failed to fetch providers:", error);
      return { success: false, message: "Failed to fetch providers", providers: [] };
    }
  },
);

export const setDefaultProvider = command(
  z.object({
    provider: z.enum(CredentialType),
  }),
  async ({ provider }) => {
    const { cookies, locals } = getRequestEvent();
    if (!locals.user && !allowAnonymousChats) {
      return { success: false, message: "Unauthorized" };
    }

    cookies.set("default-provider", provider, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    });

    return { success: true, message: `Default provider set to ${provider}` };
  },
);
