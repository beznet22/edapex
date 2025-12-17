import { command, getRequestEvent } from "$app/server";
import { allowAnonymousChats } from "$lib/utils/constants";
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
  }),
  async ({ device_code, provider }) => {
    const { cookies, locals } = getRequestEvent();
    if ((!locals.user || !provider) && !allowAnonymousChats) {
      return { success: false, message: "User not authenticated or provider not specified" };
    }

    const device_verifier = cookies.get(provider);
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

    if (code !== device_code || !verifier) {
      console.log(`❌ Invalid or mismatched device code: ${device_code}`);
      return { success: false, message: "Invalid device code" };
    }

    const result = await useAgent().use(provider).getToken(code, verifier);
    if ("status" in result && result.status === "pending") {
      return { ...result };
    }

    return { success: true, status: "complete" };
  }
);
