import { fileSchema } from "$lib/schema/chat-schema";
import { resultInputSchema } from "$lib/schema/result";
import { generateContent } from "$lib/server/helpers/chat-helper";
import { result } from "$lib/server/service/result.service";
import { error, json } from "@sveltejs/kit";

export async function POST({ request, locals }: { request: Request; locals: App.Locals }) {
  const { session, user } = locals;
  if (!user || !session) error(401, "Unauthorized");
  if (request.body === null) error(400, "Empty file received");

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return error(400, "No file uploaded");
    }

    const validatedFile = fileSchema.safeParse(file);
    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.issues.map((issue) => issue.message).join(", ");
      console.error(errorMessage);
      return error(400, errorMessage);
    }

    const mappingData = await result.getMappingData(user.staffId || 1);
    console.log("Mapping data: ", mappingData);
    const mapString = JSON.stringify(mappingData);
    const content = await generateContent(file, mapString);
    const parsedResult = JSON.parse(content.trim());
    const marks = resultInputSchema.parse(parsedResult);
    const res = await result.upsertStudentResult(marks, 1);
    if (!res.success) {
      return { success: false, message: res.message };
    }

    return json({ studentData: marks.studentData, marks });
  } catch (e) {
    console.error(e);
    return error(500, "Failed to upload file, try again");
  }
}
