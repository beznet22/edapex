import type { Provider } from "ai";
import { z } from "zod";

export const chatVisibilitySchema = z.enum(["private", "public"]);
export type ChatVisibility = z.infer<typeof chatVisibilitySchema>;

export const chatTypeSchema = z.enum(["chat", "voice", "image", "video"]);
export type ChatType = z.infer<typeof chatTypeSchema>;

export const fileSchema = z
  .instanceof(Blob)
  .refine((file) => file.size <= 5 * 1024 * 1024, {
    message: "File size should be less than 5MB",
  })
  // Update the file type based on the kind of files you want to accept
  .refine((file) => ["image/jpeg", "image/png"].includes(file.type), {
    message: "File type should be JPEG or PNG",
  });

export enum CredentialType {
  QWEN_CODE = "qwen_code",
  GOOGLE_OAUTH = "google_oauth",
  OPENROUTER = "openrouter",
  API_TOKEN = "api_token",
}

export const CREDENTIAL_LABELS: Record<CredentialType, string> = {
  [CredentialType.QWEN_CODE]: "Qwen Code",
  [CredentialType.GOOGLE_OAUTH]: "Google OAuth",
  [CredentialType.OPENROUTER]: "OpenRouter",
  [CredentialType.API_TOKEN]: "API Credential",
};

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  interval: number;
  expires_in: number;
  authUrl?: string;
}

export const deviceAuth = z.object({
  authUrl: z.string(),
  device_code: z.string(),
  interval: z.number(),
  expires_in: z.number(),
});

export type DeviceAuth = z.infer<typeof deviceAuth>;

export const providerConfigSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string().optional(),
  scopes: z.array(z.string()),
  tokenUrl: z.string(),
  deviceCodeUrl: z.string().optional(),
  authUrl: z.string().optional(),
  redirectUri: z.string().optional(),
  userInfoUrl: z.string().optional(),
  successUrl: z.string().optional(),
  failureUrl: z.string().optional(),
  baseUrl: z.string().optional(),
  grantType: z.string().optional(),
});
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

export const credentialSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  id_token: z.string().optional(),
  expires_in: z.number(),
  token_type: z.string(),
  resource_url: z.string().optional(),
  scope: z.string().optional(),
  obtained_at: z.number().optional(),
});

export type Credential = z.infer<typeof credentialSchema>;
export interface JwtPayload extends Partial<Credential> {
  sub: string; // required user id
  type: "OAuth2" | "ApiKey";
  provider: CredentialType;
}

export const webLogin = z.object({
  authUrl: z.string(),
  loginCompletePromise: z.promise(z.void()),
});

export type ClientEvent = "client-ready" | "tokens-expired" | "tokens-updated";

export interface OAuth2Client {
  readonly type: CredentialType;
  readonly config: ProviderConfig;

  on(event: ClientEvent, callback: (tokens: Credential) => void): void;
  getAccessToken(): Promise<{ accessToken: string; endpoint: string } | null>;
  getToken(code: string, verifier: string): Promise<Credential | { status: string; slowDown?: boolean }>;
  geModelProvider(): Promise<Provider | null>;
  getTokenInfo(credential: string): Promise<any>;
  generateAuthUrl(): Promise<DeviceAuth | null>;
}
