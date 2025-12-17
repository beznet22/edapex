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
  scopes: [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
  ],
  tokenUrl: "https://oauth2.googleapis.com/token",
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
  successUrl: "https://developers.google.com/gemini-code-assist/auth_success_gemini",
  failureUrl: "https://developers.google.com/gemini-code-assist/auth_failure_gemini",
};
