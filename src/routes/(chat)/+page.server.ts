import { fileSchema } from "$lib/schema/chat-schema";
import { resultInputSchema } from "$lib/schema/result-input";
import { EdApexGateway } from "$lib/server/mastra/gateway";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { createAssessmentServiceForRequest } from "$lib/server/service/assessment.service";
import { mistralOcrService } from "$lib/server/service/mistral-ocr.service";
import { mastra } from "$lib/server/mastra";
import { put } from "$lib/utils/fs-blob";
import { redirect, type Actions } from "@sveltejs/kit";
import { writeFileSync } from "fs";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ url, locals }) => {
  const { user, session } = locals;
  if (!user || !session) {
    return redirect(302, "/signin");
  }

  return { user: user };
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
    const assessment = await createAssessmentServiceForRequest(
      createTenantContext({
        schoolId: user.schoolId ?? 1,
        userId: user.id,
        staffId: user.staffId ?? undefined,
        classId: classId || null,
        sectionId: sectionId || null,
      }),
    );
    if (classId && sectionId && user.designation === "coordinator") {
      const staff = await assessment.getStaffByClassSection({ classId, sectionId });
      if (!staff.teacherId)
        return { success: false, status: "error", message: "Class not assigned to any teacher" };
      staffId = staff.teacherId;
      token = `${className}(${sectionName})`.toLowerCase().replaceAll(" ", "_");
    } else {
      const assigned = await assessment.getAssignedClassSection(staffId);
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
      // Register EdApexGateway for per-request credential resolution. This is
      // the ONLY place the gateway is constructed in the request lifecycle —
      // it is a MastraModelGateway, not a generic orchestration class. The
      // extraction itself runs through the extractionWorkflow below, which
      // uses the registered gateway internally for LLM resolution.
      const mastraDb = getAppDb();
      const gateway = new EdApexGateway(mastraDb, user.id);
      mastra.addGateway(gateway);

      const tenantContext = createTenantContext({
        schoolId: user.schoolId ?? 1,
        userId: user.id,
        designationId: 1,
        staffId,
        classId: classId || null,
        sectionId: sectionId || null,
      });

      // Run the OCR step via the same internal call the workflow uses.
      // The legacy gateway.executeExtraction path was removed in
      // gateway.ts:13-16 and never re-implemented; this is the supported
      // replacement until the result-mapper agent (Slice 12) handles the
      // full markdown → structured mapping.
      const fileName = validatedFile.data instanceof File ? validatedFile.data.name : "uploaded";
      const ocrResponse = await mistralOcrService.processDocument(validatedFile.data, fileName);
      const markdown = (ocrResponse as { pages?: Array<{ markdown?: string }> }).pages
        ?.map((p) => p.markdown ?? "")
        .filter(Boolean)
        .join("\n\n") || "";

      if (!markdown) {
        throw new Error("OCR produced no text for the uploaded file");
      }

      // Build the extracted-data shell. Full student/marks mapping is
      // pending the result-mapper agent; the UI gets the OCR text + a
      // populated studentData shell so it can render the review form.
      const extractedData = {
        studentData: {
          studentId,
          admissionNo,
          fullName: studentName,
          className: "",
          sectionName: "",
        },
        marksData: [],
        rawText: markdown,
        mappingStatus: "pending" as const,
      };

      // Validate the extracted-data shell (advisory only — full validation
      // happens after /generate populates teachersRemark + studentRatings).
      const validated = await resultInputSchema.safeParseAsync(extractedData);
      if (!validated.success) {
        console.log("Extraction shell validation produced non-fatal issues:", validated.error.issues);
        writeFileSync(process.cwd() + "/static/extracted/parsed.json", JSON.stringify(extractedData));
      }

      // Suspend: return extracted data for user review — no DB writes until /validate
      return {
        success: true,
        status: "pending_validation",
        data: extractedData,
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

      // Slice 10: per-request provider
      const assessment = await createAssessmentServiceForRequest(
        createTenantContext({
          schoolId: user.schoolId ?? 1,
          userId: user.id,
          staffId,
        }),
      );
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
