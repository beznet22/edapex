import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import { eq } from 'drizzle-orm';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getDatabase } from '$lib/server/db';
import { smStudents } from '$lib/server/db/sms-schema';
import { tenantWorkspace } from '$lib/server/workspace';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { STATIC_DIR } from '$lib/constants';
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import type { StreamWriterLike } from '$lib/server/mastra/agent-stream-retry';

interface UpdatePhotoContext {
  requestContext?: {
    get<T = unknown>(key: string): T | undefined;
    set?: <T = unknown>(key: string, value: T) => void;
  };
  writer?: StreamWriterLike;
  abortSignal?: AbortSignal;
}

function getTenant(ctx: UpdatePhotoContext): TenantContext {
  const tenant = ctx.requestContext?.get('tenantContext') as TenantContext | undefined;
  if (!tenant) {
    throw new Error('TENANT_CONTEXT_REQUIRED: update-photo requires tenantContext');
  }
  return tenant;
}

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
  outputSchema: z.object({
    ok: z.literal(true),
    photoUrl: z.string(),
  }),
  execute: async (input, ctx) => {
    const tenant = getTenant(ctx as UpdatePhotoContext);

    const sourceRelative = `photos/${input.contentHash}.${input.ext}`;

    const fs = await tenantWorkspace.resolveFilesystem({
      requestContext: buildWorkspaceRequestContext(tenant) as never,
    });
    if (!fs) throw new Error('WORKSPACE_UNAVAILABLE: cannot resolve tenant filesystem');

    const raw = await fs.readFile(sourceRelative);
    const sourceBuffer = Buffer.from(raw as Uint8Array);

    const destRelative = `public/uploads/students/${input.contentHash}.${input.ext}`;
    const destFullPath = join(STATIC_DIR, destRelative);
    const destDir = join(STATIC_DIR, 'public/uploads/students');
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }
    writeFileSync(destFullPath, sourceBuffer);

    const photoUrl = `/uploads/students/${input.contentHash}.${input.ext}`;

    const db = await getDatabase();
    await db
      .update(smStudents)
      .set({ studentPhoto: photoUrl })
      .where(eq(smStudents.id, input.studentId));

    return { ok: true as const, photoUrl };
  },
});
