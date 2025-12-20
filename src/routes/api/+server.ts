import { studentRepo } from "$lib/server/repository/student.repo";
import { result } from "$lib/server/service/result.service";
import { error, json, type RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ locals }) => {
  const { user, session } = locals;
  if (!user || !session) {
    error(401, "Unauthorized");
  }
  try {
    const students = await studentRepo.getStudentsByUserId(user?.id);
    const mappingData = await result.getMappingData(user.staffId || 1);
    return json({ staffId: user.staffId, mappingData });
  } catch (e: any) {
    console.error("Error creating job:", e);
    return error(500, e.message);
  }
};
