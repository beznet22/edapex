import { command, getRequestEvent } from "$app/server";
import { allowAnonymousChats } from "$lib/constants";
import { CredentialType } from "$lib/schema/chat-schema";
import { useAgent } from "$lib/server/service/agent.service";
import z from "zod";

export const addProvder = command(
  z.object({
    provider: z.enum(CredentialType),
  }),
  async ({ provider }) => {
    const { locals } = getRequestEvent();
    if (!locals.user && !allowAnonymousChats) {
      console.log("allowAnonymousChats: ", allowAnonymousChats);
      return { success: false, message: "Unauthorized" };
    }

    try {
      const deviceAuth = await useAgent().use(provider).generateAuthUrl();
      if (!deviceAuth) {
        return { success: false, message: "Failed to authorize device" };
      }

      return { success: true, message: "Device authorization successful", deviceAuth, provider };
    } catch (error) {
      console.error("Device authorization error:", error);
      return { success: false, message: "Failed to authorize device" };
    }
  }
);

export const addToken = command(
  z.object({
    device_code: z.string(),
    provider: z.enum(CredentialType),
    manual_code: z.string().optional(),
  }),
  async ({ device_code, provider, manual_code }) => {
    const { cookies, locals } = getRequestEvent();
    if ((!locals.user || !provider) && !allowAnonymousChats) {
      return { success: false, message: "User not authenticated or provider not specified" };
    }

    const device_verifier = cookies.get(`v_${provider}`);
    if (!device_verifier) {
      console.log("❌ No device verifier cookie found (expired)");
      return { success: false, message: "Device code expired" };
    }

    const { code, verifier } = JSON.parse(device_verifier) as {
      code: string;
      verifier: string;
    };
    if (!code || !verifier) {
      console.log("❌ No device verifier cookie found (expired)");
      return { success: false, message: "Device code expired" };
    }

    if (code !== device_code) {
      console.log(`❌ Invalid or mismatched device code: ${device_code}`);
      return { success: false, message: "Invalid device code" };
    }

    // For Gemini (Google OAuth), we need the manual_code if it's not polling
    const result = await useAgent().use(provider).getToken(manual_code || device_code, verifier);
    
    if ("status" in result && result.status === "pending") {
      console.log(`[addToken] Token still pending for ${provider}`);
      return { ...result };
    }

    if ("status" in result && result.status === "error") {
      return { success: false, message: "Authorization failed" };
    }

    console.log(`[addToken] Successfully added token for ${provider}`);
    return { success: true, status: "complete" };
  }
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
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return { success: true, message: `Default provider set to ${provider}` };
  }
);
