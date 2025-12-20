import { studentRepo } from "$lib/server/repository/student.repo";
import { error, json, type RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ locals }) => {
  const { user, session } = locals;
  if (!user || !session) {
    error(401, "Unauthorized");
  }
  try {
    const students = await studentRepo.getStudentsByUserId(user?.id);

    return json({len: students?.length, students});
  } catch (e: any) {
    console.error("Error creating job:", e);
    return error(500, e.message);
  }
};
