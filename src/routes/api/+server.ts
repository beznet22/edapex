import { reportSchema } from "$lib/schema/report-schema";
import { resultRepo } from "$lib/server/repository/result.repo";
import { studentRepo } from "$lib/server/repository/student.repo";
import { result } from "$lib/server/service/result.service";
import { JobWorker } from "$lib/server/worker";
import { error, json, type RequestHandler } from "@sveltejs/kit";
import type { ZodError } from "zod";

type EmailMessage = {
  to: string;
  subject: string;
  html: string;
};

// Helper function to format Zod errors into a more readable format
function formatZodError(zodError: ZodError) {
  return {
    message: "Validation failed",
    issues: zodError.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
      code: issue.code,
      expected: "expected" in issue ? issue.expected : undefined,
      received: "received" in issue ? issue.received : undefined,
    })),
  };
}

export const GET: RequestHandler = async ({ locals }) => {
  const { session, user } = locals;
  try {
    // const resultData = await result.getStudentResult({ id: 20, examId: 5 });
    // if (!resultData) throw new Error("Result not found");
    // const validated = reportSchema.safeParse(resultData);
    // if (!validated.success) {
    //   const formattedError = formatZodError(validated.error);
    //   return json({
    //     success: false,
    //     message: "Failed to validate result data",
    //     error: formattedError,
    //   });
    // }

    const assignedSubjects = await resultRepo.getClassSections();

    return json(assignedSubjects); // Fixed: was returning 'data' which is undefined
  } catch (e: any) {
    console.error("Error creating job:", e);
    return error(500, e.message);
  }
};
