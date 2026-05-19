import { error, json } from "@sveltejs/kit";
import { CredentialType } from "$lib/schema/chat-schema";
import { discoverModels, saveUserModelsCached } from "$lib/server/provider/discovery";
import { getProviderCredentialWithFallback, decrypt } from "$lib/server/mastra/provider-config";
import { createMastraDb } from "$lib/server/mastra/db";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request, locals }) => {
  const { user } = locals;
  if (!user) error(401, "Unauthorized");

  const { provider } = await request.json();
  if (!provider || !Object.values(CredentialType).includes(provider)) {
    error(400, "Invalid provider");
  }

  const { env } = await import('$env/dynamic/private');
  const db = createMastraDb();
  const envKeys = env as Record<string, string | undefined>;
  const config = await getProviderCredentialWithFallback(db, user.id, provider, envKeys);

  let apiKey: string | null = null;
  if (config) {
    if (config.source === 'env') {
      apiKey = envKeys[`${provider.toUpperCase()}_API_KEY`] || null;
    } else if (config.apiKeyEncrypted) {
      const encryptionKey = env.TOKEN_ENCRYPTION_KEY || "edapex-default-encryption-key-32ch";
      apiKey = decrypt(config.apiKeyEncrypted, encryptionKey);
    }
  }

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
