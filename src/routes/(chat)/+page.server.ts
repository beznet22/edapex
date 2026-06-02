import { fileSchema } from "$lib/schema/chat-schema";
import { resultInputSchema } from "$lib/schema/result-input";
import { EdApexGateway } from "$lib/server/mastra/gateway";
import { createMastraDb } from "$lib/server/mastra/db";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { env } from "$env/dynamic/private";
import { resultRepo, staffRepo } from "$lib/server/repository";
import { assessment } from "$lib/server/service/assessment.service";
import { put } from "$lib/utils/fs-blob";
import { redirect, type Actions } from "@sveltejs/kit";
import { writeFileSync } from "fs";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, locals }) => {
  const { user, session } = locals;
  if (!user || !session) {
    return redirect(302, "/signin");
  }

  return { user };
};

export const actions: Actions = {
  default: async ({ request, locals }) => {
    const { user, session } = locals;
    if (!user || !session) {
      return redirect(302, "/signin");
    }
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];
    const className = formData.get("className") as string;
    const sectionName = formData.get("sectionName") as string;
    const classId = Number(formData.get("classId"));
    const sectionId = Number(formData.get("sectionId"));
    const studentId = Number(formData.get("studentId"));
    const admissionNo = Number(formData.get("admissionNo"));
    const studentName = formData.get("studentName") as string;

    let staffId: number = user.staffId || 1;
    let token = "";
    if (classId && sectionId && user.designation === "coordinator") {
      const staff = await staffRepo.getStaffByClassSection({ classId, sectionId });
      if (!staff.teacherId)
        return { success: false, status: "error", message: "Class not assigned to any teacher" };
      staffId = staff.teacherId;
      token = `${className}(${sectionName})`.toLowerCase().replaceAll(" ", "_");
    } else {
      const assigned = await resultRepo.getAssignedClassSection(staffId);
      if (!assigned || !assigned.className || !assigned.sectionName)
        return { success: false, status: "error", message: "You have not been assigned a class" };
    }

    const file = files[0];
    const validatedFile = fileSchema.safeParse(file);
    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.issues.map((issue) => issue.message).join(", ");
      return { success: false, status: "error", message: errorMessage };
    }

    try {
      // Delegate extraction to EdApexGateway
      const mastraDb = createMastraDb();
      const encryptionKey = env.TOKEN_ENCRYPTION_KEY || "edapex-default-encryption-key-32ch";
      const envKeys = env as Record<string, string | undefined>;

      const tenantContext = createTenantContext({
        schoolId: user.schoolId ?? 1,
        userId: user.id,
        designationId: 1,
        staffId,
        classId: classId || null,
        sectionId: sectionId || null,
      });

      const gateway = new EdApexGateway(mastraDb, user.id, encryptionKey, envKeys);
      const result = await gateway.executeExtraction(validatedFile.data, tenantContext, {
        staffId,
        classId: classId || undefined,
        sectionId: sectionId || undefined,
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      // Overlay student identity from form data
      const extractedData = result.data;
      extractedData.studentData.studentId = studentId;
      extractedData.studentData.admissionNo = admissionNo;
      extractedData.studentData.fullName = studentName;

      // Validate the structured extraction output (schema check only — no DB write)
      const validated = await resultInputSchema.safeParseAsync(extractedData);
      if (!validated.success) {
        const error = validated.error.issues.filter((issue) => issue.code === "custom");
        writeFileSync(process.cwd() + "/static/extracted/parsed.json", JSON.stringify(extractedData));
        console.log("Failed to validate extraction", validated.error.issues);
        return { success: false, status: "error", message: error.map((issue) => issue.message).join("\n") };
      }

      // Suspend: return extracted data for user review — no DB writes until /validate
      return {
        success: true,
        status: "pending_validation",
        data: validated.data,
        staffId,
        filenames: [file.name],
        message: "Extraction complete — review and validate to save",
      };
    } catch (e) {
      console.error("Extraction error:", e);
      // Fallback: store file via blob storage when extraction fails
      try {
        const buff = await file.arrayBuffer();
        const data = await put(file.name, buff, {
          token,
          access: "private",
          contentType: file.type,
        });

        const filename = data.pathname.split("/").pop();
        return {
          success: true,
          status: "pending",
          data,
          filename,
          message: "File saved but pending extraction",
        };
      } catch (e) {
        console.error("Failed to save file:", e);
        return {
          success: false,
          status: "error",
          message: e instanceof Error ? e.message : "Failed to upload file, try again",
        };
      }
    }
  },

  validate: async ({ request, locals }) => {
    const { user, session } = locals;
    if (!user || !session) {
      return redirect(302, "/signin");
    }

    const formData = await request.formData();
    const rawData = formData.get("data") as string;
    const staffId = Number(formData.get("staffId"));

    if (!rawData || !staffId) {
      return { success: false, status: "error", message: "Missing extraction data or staffId" };
    }

    try {
      const parsed = JSON.parse(rawData);
      const validated = await resultInputSchema.safeParseAsync(parsed);
      if (!validated.success) {
        return { success: false, status: "error", message: validated.error.issues.map(i => i.message).join("\n") };
      }

      const res = await assessment.upsertStudentResult(validated.data, staffId);
      return {
        success: true,
        status: "done",
        data: res,
        message: "Results saved successfully",
      };
    } catch (e) {
      console.error("Validation/save error:", e);
      return {
        success: false,
        status: "error",
        message: e instanceof Error ? e.message : "Failed to save results",
      };
    }
  },
};
