import { result } from "$lib/server/service/result.service";
import { error, json, type RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ url }) => {
  try {
    const resultData = await result.getStudentResult({ id: 20, examId: 5 });

    return json(resultData);
  } catch (e: any) {
    console.error("Error creating job:", e);
    return error(500, e.message);
  }
};
