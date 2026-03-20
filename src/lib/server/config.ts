import type { ProviderConfig } from "$lib/schema/chat-schema";

// Qwen OAuth configuration
export const qwenConfig: ProviderConfig = {
  clientId: "f0304373b74a44d2b584a3fb70ca9e56",
  scopes: ["openid", "profile", "email", "model.completion"],
  tokenUrl: "https://chat.qwen.ai/api/v1/oauth2/token",
  deviceCodeUrl: "https://chat.qwen.ai/api/v1/oauth2/device/code",
  authUrl: "https://chat.qwen.ai",
  baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  grantType: "urn:ietf:params:oauth:grant-type:device_code",
};

// Google OAuth configuration
export const googleConfig: ProviderConfig = {
  clientId: "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com",
  clientSecret: "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",
  redirectUri: "https://codeassist.google.com/authcode",
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
  scopes: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ],
};

// OpenRouter OAuth configuration
export const openRouterConfig: ProviderConfig = {
  clientId: "openrouter", // Placeholder as OpenRouter uses callback_url as identifier
  scopes: [],
  tokenUrl: "https://openrouter.ai/api/v1/auth/keys",
  authUrl: "https://openrouter.ai/auth",
  baseUrl: "https://openrouter.ai/api/v1",
  redirectUri: undefined,
};

