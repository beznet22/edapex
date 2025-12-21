import { JobWorker } from "$lib/server/worker";
import type { RequestHandler } from "@sveltejs/kit";
import { error, json } from "@sveltejs/kit";

export const POST: RequestHandler = async ({ url, params, request, locals }) => {
  const { session, user } = locals;
  if (!user || !session) error(401, "Unauthorized");
  if (request.body === null) error(400, "Empty file received");

  try {
    // Parse the request body
    const requestData = await request.json();
    const { emailData } = requestData;

    // Validate required fields
    if (!emailData || !emailData.to || !emailData.subject || !emailData.html) {
      return error(400, "Missing required email data (to, subject, html)");
    }

    // Run the email task in a worker that auto-terminates
    const result = await JobWorker.runTask({ data: emailData, type: "send-email" });

    // Log the result
    if (result.status === "success") {
      console.log(`Email sent successfully: ${result.result?.messageId}`);
    } else {
      console.error(`Failed to send email: ${result.error}`);
    }

    return json({
      success: true,
      taskId: result.jobId,
      result,
    });
  } catch (e) {
    console.error("Error in send-email endpoint:", e);
    return error(500, "Failed to send email");
  }
};
