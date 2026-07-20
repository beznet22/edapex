import { z } from 'zod';
import { createTool, type ToolExecutionContext } from '@mastra/core/tools';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { tenantWorkspace } from '$lib/server/workspace';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { STATIC_DIR } from '$lib/constants';
import { StudentRepository } from '../../../../repository/student.repo';
import {
  validateRoleWhitelist,
  type MastraToolContext,
} from '../../../tenant-context';
import { bridgeToolContext } from '../../internal/bridge';

export const updatePhotoTool = createTool({
  id: 'update-photo',
  description:
    'Move a workspace photo to static student uploads and update the student record. ' +
    'Called when the teacher types /update photo @<studentName>.',
  inputSchema: z.object({
    studentId: z.number().int().positive(),
    contentHash: z.string().min(1),
    ext: z.string().min(1).max(10),
    reason: z.string().describe('Human-readable action summary for user approval.'),
  }),
  requireApproval: true,
  outputSchema: z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), photoUrl: z.string() }),
    z.object({ ok: z.literal(false), error: z.string() }),
  ]),
  execute: async (input, context: ToolExecutionContext) => {
    const ctx = await bridgeToolContext(context) as ToolExecutionContext & MastraToolContext;
    const { tenantContext, getRepo } = ctx;

    validateRoleWhitelist(tenantContext, [1, 5, 8]);

    const sourceRelative = `photos/${input.contentHash}.${input.ext}`;

    const fs = await tenantWorkspace.resolveFilesystem({
      requestContext: buildWorkspaceRequestContext(tenantContext) as never,
    });
    if (!fs) {
      return { ok: false as const, error: 'WORKSPACE_UNAVAILABLE: cannot resolve tenant filesystem' };
    }

    let sourceBuffer: Uint8Array;
    try {
      const raw = await fs.readFile(sourceRelative);
      sourceBuffer = Buffer.from(raw as Uint8Array);
    } catch {
      return { ok: false as const, error: `PHOTO_NOT_FOUND: ${sourceRelative} not found in workspace` };
    }

    const destRelative = `public/uploads/students/${input.contentHash}.${input.ext}`;
    const destFullPath = join(STATIC_DIR, destRelative);
    const destDir = join(STATIC_DIR, 'public/uploads/students');
    if (!existsSync(destDir)) {
      await mkdir(destDir, { recursive: true });
    }
    await writeFile(destFullPath, sourceBuffer);

    const photoUrl = `/uploads/students/${input.contentHash}.${input.ext}`;

    const studentRepo = getRepo(StudentRepository);
    const updated = await studentRepo.updateStudentPhoto(input.studentId, photoUrl);
    if (!updated) {
      return { ok: false as const, error: `STUDENT_NOT_FOUND: student ${input.studentId} not found` };
    }

    return { ok: true as const, photoUrl };
  },
});
