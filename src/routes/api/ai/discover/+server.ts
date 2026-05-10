import { error, json } from "@sveltejs/kit";
import { CredentialType } from "$lib/schema/chat-schema";
import { discoverModels, saveUserModelsCached } from "$lib/server/provider/discovery";
import { retrieveApiKey } from "$lib/server/provider/router";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, locals }) => {
  const { user } = locals;
  if (!user) error(401, "Unauthorized");

  const { provider } = await request.json();
  if (!provider || !Object.values(CredentialType).includes(provider)) {
    error(400, "Invalid provider");
  }

  const apiKey = await retrieveApiKey(user.id, provider);
  if (!apiKey) {
    error(404, `No API key found for ${provider}`);
  }

  try {
    const models = await discoverModels(provider, apiKey);
    if (models.length > 0) {
      saveUserModelsCached(user.id, provider, models);
      return json({ success: true, count: models.length, models });
    }
    return json({ success: true, count: 0, message: "No models found" });
  } catch (err) {
    console.error(`[api/ai/discover] Failure for ${provider}:`, err);
    error(500, "Discovery failed");
  }
};
