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
  .refine((file) => ["image/jpeg", "image/png"].includes(file.type), {
    message: "File type should be JPEG or PNG",
  });

export enum CredentialType {
  DEEPSEEK = "deepseek",
  NVIDIA_NIM = "nvidia_nim",
  GROQ = "groq",
  MISTRAL = "mistral",
  OPENCODE = "opencode",
}

export const CREDENTIAL_LABELS: Record<CredentialType, string> = {
  [CredentialType.DEEPSEEK]: "DeepSeek",
  [CredentialType.NVIDIA_NIM]: "NVIDIA NIM",
  [CredentialType.GROQ]: "Groq",
  [CredentialType.MISTRAL]: "Mistral",
  [CredentialType.OPENCODE]: "OpenCode",
};

export type OpenAICompatibleCompletionModelId = string;

export const openaiCompatibleCompletionProviderOptions = z.object({
  echo: z.boolean().optional(),
  logitBias: z.record(z.string(), z.number()).optional(),
  suffix: z.string().optional(),
  user: z.string().optional(),
});

export type OpenAICompatibleCompletionProviderOptions = z.infer<
  typeof openaiCompatibleCompletionProviderOptions
>;

const usageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
});

const openaiCompatibleCompletionResponseSchema = z.object({
  id: z.string().nullish(),
  created: z.number().nullish(),
  model: z.string().nullish(),
  choices: z.array(
    z.object({
      text: z.string(),
      finish_reason: z.string(),
    }),
  ),
  usage: usageSchema.nullish(),
});
