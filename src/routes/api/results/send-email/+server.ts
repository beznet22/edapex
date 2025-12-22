import { JobWorker, type Payload } from "$lib/server/worker";
import type { RequestHandler } from "@sveltejs/kit";
import { error, json } from "@sveltejs/kit";

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export const POST: RequestHandler = async ({ url, params, request, locals }) => {
  const { session, user } = locals;
  if (!user || !session) error(401, "Unauthorized");
  if (request.body === null) error(400, "Empty file received");

  try {
    const data = (await request.json()) as EmailMessage;
    if (!data || !data.to || !data.subject || !data.html) {
      return error(400, "Missing required email data (to, subject, html)");
    }

    const result = await JobWorker.runTask({ type: "send-email", data: [data] });
    if (result.status === "success") {
      console.log(`Email sent successfully: ${result.result?.messageId}`);
    } else {
      console.error(`Failed to send email: ${result.error}`);
    }

    return json({
      success: true,
      jobId: result.jobId,
      result,
    });
  } catch (e) {
    console.error("Error in send-email endpoint:", e);
    return error(500, "Failed to send email");
  }
};
