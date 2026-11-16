/**
 * Claim endpoint — move a photo from `<yearRoot>/shared/photos/<hash>.<ext>`
 * to `static/uploads/students/<hash>.<ext>` and persist the URL to
 * `sm_students.studentPhoto`.
 *
 * Authorization: any authenticated staff whose `TenantContext.classId` and
 * `sectionId` match the student's record. The student must already be in
 * the active class roster (`StudentRepository.getStudentsByClassSection`)
 * so a teacher can only claim photos for their own students.
 *
 * Failure semantics: if the DB update fails, the copied file is removed
 * so we never leave a `static/uploads/students/<hash>` file without a
 * matching `sm_students.studentPhoto` row pointing at it.
 */
import { json, error, type RequestHandler } from '@sveltejs/kit';
import path from 'node:path';
import { resolveTenantWorkspace, sharedPhotosDir } from '$lib/server/workspace';
import { ALLOWED_DESIGNATIONS } from '$lib/types/sms-types';
import { getDatabase } from '$lib/server/db';
import { StudentRepository } from '$lib/server/repository/student.repo';
import { STATIC_DIR } from '$lib/constants';

type ClaimBody = {
  url?: unknown;
  studentId?: unknown;
};

const PHOTO_URL_RE = /^\/api\/file\/shared\/photos\/([a-f0-9]{16,128})\.([a-z0-9]+)$/i;

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const body = (await request.json().catch(() => ({}))) as ClaimBody;
  const url = typeof body.url === 'string' ? body.url : '';
  const studentId = typeof body.studentId === 'number' ? body.studentId : NaN;
  if (!url || !Number.isFinite(studentId) || studentId <= 0) {
    throw error(400, 'url and studentId are required');
  }

  const match = url.match(PHOTO_URL_RE);
  if (!match) {
    throw error(400, 'url must look like /api/file/shared/photos/<hash>.<ext>');
  }
  const [, contentHash, ext] = match;
  const safeExt = ext.toLowerCase();

  const { tenant } = await resolveTenantWorkspace({
    schoolId: locals.user.schoolId ?? 1,
    userId: locals.user.id ?? 1,
    staffId: (locals.user as { staffId?: number })?.staffId,
    designationId: (locals.user as { designationId?: number })?.designationId ?? ALLOWED_DESIGNATIONS.IT,
    selectedClassCookie: cookies.get('selected-class'),
  });

  if (!tenant.staffId || !tenant.classId || !tenant.sectionId) {
    throw error(403, 'Only staff assigned to a class can claim photos');
  }

  // 1. Verify source exists at the year root
  const fsModule = await import('node:fs/promises');
  const sourceDir = sharedPhotosDir(tenant);
  const sourcePath = path.join(sourceDir, `${contentHash}.${safeExt}`);
  try {
    await fsModule.access(sourcePath);
  } catch {
    throw error(404, 'Source photo not found in shared/photos/');
  }

  // 2. Verify the student is in the teacher's active class roster
  const db = await getDatabase();
  const studentRepo = new StudentRepository(db, tenant);
  const roster = await studentRepo.getStudentsByClassSection({
    classId: tenant.classId,
    sectionId: tenant.sectionId,
  });
  if (!roster?.some((s) => s.id === studentId)) {
    throw error(403, 'Student is not in your class roster');
  }

  // 3. Copy the photo to static/uploads/students/
  const destDir = path.join(STATIC_DIR, 'uploads', 'students');
  await fsModule.mkdir(destDir, { recursive: true } as Parameters<typeof fsModule.mkdir>[1]);
  const destPath = path.join(destDir, `${contentHash}.${safeExt}`);
  await fsModule.copyFile(sourcePath, destPath);

  // 4. Update sm_students.studentPhoto
  const photoUrl = `/uploads/students/${contentHash}.${safeExt}`;
  try {
    await studentRepo.updateStudentPhoto(studentId, photoUrl);
  } catch (err) {
    // Rollback: delete the copy so it doesn't dangle
    await fsModule.unlink(destPath).catch(() => {});
    throw err;
  }

  // 5. Remove source + sidecar from the shared pool
  await fsModule.unlink(sourcePath).catch(() => {});
  const sidecarPath = path.join(sourceDir, `${contentHash}.json`);
  await fsModule.unlink(sidecarPath).catch(() => {});

  return json({ success: true, photoUrl });
};
