
import ResultEmail from "$lib/components/template/result-email.svelte";
import { tool, type InferToolInput, type InferToolOutput } from "ai";
import { render } from "svelte-email";
import { z } from "zod";

export const sendEmailTool = tool({
  description: [
    "Send an email to any recipient with the provided subject and body.",
    "The email body can contain Plain Text or HTML.",
  ].join("\n"),
  inputSchema: z.object({
    to: z.string().describe("The recipient's email address"),
    subject: z.string().describe("The subject of the email"),
    body: z.string().describe("The body of the email"),
  }),
  outputSchema: z.object({
    status: z
      .enum(["approved", "denied"])
      .describe("Operation status: 'approved' if successful, 'denied' if record not found"),
    message: z.string().optional().describe("Status details (e.g., 'Email sent', 'Email not sent')"),
  }),
  execute: async (input) => {
    try {
      const html = render({
        template: ResultEmail as any,
        props: { name: "Alex" },
      });
      
      return { status: "approved", message: "Email sent successfully" };
    } catch (error) {
      return { status: "denied", message: "Email not sent" };
    }
  },
});

export type sendEmailInput = InferToolInput<typeof sendEmailTool>;
export type sendEmailOutput = InferToolOutput<typeof sendEmailTool>;
