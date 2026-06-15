import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { OcrWorkspaceStore } from '$lib/server/mastra/storage/ocr/ocr-workspace-store';
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import { createTenantContext, resolveExamTypeId } from '$lib/server/mastra/tenant-context';
import { HTTPValidationError, SDKError } from '@mistralai/mistralai/models/errors';

export const POST: RequestHandler = async ({ request, locals }) => {
  const { user } = locals;

  if (!user) {
    error(401, 'Unauthorized');
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as Blob | null;
    const fileName = formData.get('filename') as string | null;
    const mimeType = (formData.get('mimeType') as string | null) ?? undefined;

    if (!file || !fileName) {
      error(400, 'Missing file or filename in form data');
    }

    const examTypeId = await resolveExamTypeId(user.schoolId ?? 1, null);

    const tenant = createTenantContext({
      schoolId: user.schoolId ?? 1,
      userId: user.id,
      designationId: (user as { designationId?: number }).designationId ?? ALLOWED_DESIGNATIONS.IT,
      staffId: (user as { staffId?: number }).staffId ?? 1,
      classId: (user as { classId?: number | null }).classId ?? null,
      sectionId: (user as { sectionId?: number | null }).sectionId ?? null,
      examTypeId,
      examId: null,
      academicId: null
    });

    const entry = await OcrWorkspaceStore.getOrCreate({
      tenant,
      file,
      fileName,
      mimeType
    });

    return json({
      success: true,
      fileId: entry.mistralFileId,
      contentHash: entry.contentHash,
      markdown: entry.markdown,
      pagesProcessed: entry.pagesProcessed,
      cached: true
    });
  } catch (err: any) {
    console.error('[InstantOCR] Failed to process document:', err);
    if (err instanceof HTTPValidationError) {
      error(422, 'Mistral validation error: ' + JSON.stringify(err.data$));
    }
    if (err instanceof SDKError) {
      const status = (err as any).httpMeta?.response?.status || 500;
      error(status, err.message);
    }
    error(500, 'Internal server error processing OCR');
  }
};
