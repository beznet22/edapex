import type { FileReference } from "$lib/context/file-context.svelte";
import { getDatabase } from "$lib/server/db";
import { buildRequestContext, resolveWorkspaceContext } from "$lib/server/helpers/chat-helper";
import { resolveActiveClassScope } from "$lib/server/helpers/class-scope";
import { TenantContextCache } from "$lib/server/mastra/context-cache";
import { warmUpFileReferences } from "$lib/server/mastra/file-reference-warmup";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { processMentions, type MentionTag } from "$lib/server/mastra/mention-processor";
import { resolveExamTypeId, withAcademicId, withExamTypeId, WorkspaceMismatchError } from "$lib/server/mastra/tenant-context";
import { BaseRepository } from "$lib/server/repository";
import { mastra } from "$lib/server/mastra";
import type { AuthUser, Session } from "$lib/types/auth-types";
import type { xUIMessage, xUIMessagePart } from "$lib/types/chat-types";
import type { ClassSection } from "$lib/types/result-types";
import { isToolUIPart } from "ai";
import type { ToolUIPart, DynamicToolUIPart } from "ai";
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { toAISdkStream } from "@mastra/ai-sdk";
import type { RequestContext } from "@mastra/core/request-context";
import { error } from "@sveltejs/kit";
import { randomUUID } from "crypto";

export type ChatWorkflowParams = {
    runId: string;
    inputData?: Record<string, any>;
    resumeData?: Record<string, any>;
    requestContext: RequestContext<unknown>;
    abortSignal?: AbortSignal;
};

const tenantContextCache = new TenantContextCache();

const APPROVAL_ID_SEPARATOR = '::';

export type ApprovalResponseInfo = {
    id: string;
    runId: string;
    toolCallId: string;
    approved: boolean;
    reason?: string;
};

type ApprovalRespondedToolPart = Extract<ToolUIPart | DynamicToolUIPart, { state: 'approval-responded' }>;

function isApprovalRespondedPart(part: xUIMessagePart): part is ApprovalRespondedToolPart {
    return isToolUIPart(part) && part.state === 'approval-responded';
}

export function findToolApprovalResponse(messages: xUIMessage[]): ApprovalResponseInfo | null {
    const lastMessage = messages.at(-1);
    if (!lastMessage || lastMessage.role !== 'assistant') return null;
    for (const part of lastMessage.parts ?? []) {
        if (!isApprovalRespondedPart(part)) continue;
        const approvalId = part.approval.id;
        const sepIdx = approvalId.lastIndexOf(APPROVAL_ID_SEPARATOR);
        if (sepIdx === -1) continue;
        return {
            id: approvalId,
            runId: approvalId.slice(0, sepIdx),
            toolCallId: part.toolCallId,
            approved: part.approval.approved,
            reason: part.approval.reason
        };
    }
    return null;
}

export const buildWorkflowParams = async (
    user: AuthUser,
    session: Session | null,
    paylaod: any,
    cookies: { get: (key: string) => string | undefined },
): Promise<ChatWorkflowParams> => {
    let { threadId, messages, selectedClass: bodySelectedClass, fileReferences, mentions }: {
        threadId: string;
        messages: xUIMessage[];
        selectedClass?: ClassSection;
        fileReferences?: FileReference[];
        mentions?: MentionTag[];
    } = paylaod;

    const cookieClass = cookies.get("selected-class");
    const selectedChatModel = cookies.get("selected-model") ?? "";

    let selectedClass: ClassSection | undefined = bodySelectedClass;
    if (cookieClass) {
        try {
            const parsed = JSON.parse(cookieClass) as {
                id?: number;
                classId?: number;
                sectionId?: number;
                className?: string;
                sectionName?: string;
            };
            const effectiveClassId = parsed.classId ?? parsed.id;
            if (typeof effectiveClassId === "number") {
                selectedClass = {
                    id: parsed.id ?? effectiveClassId,
                    classId: parsed.classId,  // KEEP classId — without this the
                    //                          chat route falls back to .id (= 100)
                    sectionId: typeof parsed.sectionId === "number" ? parsed.sectionId : 0,
                    className: parsed.className ?? bodySelectedClass?.className ?? "",
                    sectionName: parsed.sectionName ?? bodySelectedClass?.sectionName ?? ""
                } as ClassSection;
            }
        } catch {
            // ignore parse error, fall back to body
        }
    }

    if (selectedChatModel === 'auto' || selectedChatModel === 'deep-reasoning') {
        error(400, "Invalid model selection");
    }
    // Empty cookie is OK — chat-helper will auto-pick from platform defaults.

    const resourceId = `user-${user.id}`;
    const { tenant: tenantContext } = await resolveWorkspaceContext(cookies, {
        id: user.id,
        schoolId: user.schoolId ?? null,
        staffId: (user as any).staffId ?? null,
        designationId: (user as any).designationId ?? null,
        roleId: (user as any).roleId ?? null
    });
    if (tenantContext.classId === null && selectedClass) {
        (tenantContext as { classId: number | null }).classId =
            (selectedClass as { classId?: number } | undefined)?.classId
            ?? (selectedClass as { id?: number } | undefined)?.id ?? null;
    }
    if (tenantContext.sectionId === null && selectedClass) {
        (tenantContext as { sectionId: number | null }).sectionId =
            selectedClass?.sectionId ?? null;
    }

    let activeContext = tenantContext;
    if (mentions && mentions.length > 0) {
        try {
            const sessionId = session?.id ?? `anon-${user.id}`;
            const designationId = (user as any).designationId ?? ALLOWED_DESIGNATIONS.IT;
            activeContext = await processMentions(
                mentions,
                tenantContext,
                tenantContextCache,
                sessionId,
                designationId
            );
        } catch (e) { throw e }
    }

    const lastMessage = messages[messages.length - 1];
    const promptText = lastMessage.parts?.find((p) => p.type === "text")?.text || "";
    const isSlashCommand = promptText.trim().startsWith('/');

    if (activeContext.examTypeId === null) {
        const resolved = await resolveExamTypeId(activeContext.schoolId, null);
        activeContext = withExamTypeId(activeContext, resolved);
    }

    if (activeContext.academicId === null) {
        const db = await getDatabase();
        const baseRepo = await BaseRepository.build(db, activeContext);
        const academicId = await baseRepo.getAcademicId();
        activeContext = withAcademicId(activeContext, academicId);
    }

    if (
        activeContext.classId === null &&
        activeContext.sectionId === null &&
        (user as { staffId?: number }).staffId
    ) {
        const resolved = await resolveActiveClassScope({
            schoolId: activeContext.schoolId,
            staffId: (user as { staffId?: number }).staffId
        });
        if (resolved) {
            activeContext = Object.freeze({
                ...activeContext,
                classId: resolved.classId,
                sectionId: resolved.sectionId
            });
        }
    }

    if (mentions && mentions.length > 0) {
        // Fold any `file` mentions into the fileReferences list. The
        // workspace key on the mention id matches the format used by
        // `searchFile()` (the workspace-relative path). Once merged,
        // the existing `warmUpFileReferences` call below OCR-warms the
        // file and `resolveAgentContextStep` includes it in the
        // `fileManifest` for the assistant's system prompt. Dedupe by
        // `key` against the already-attached `fileReferences` so the
        // same file mentioned + uploaded collapses to one entry.
        const fileMentions = mentions.filter((m) => m.category === 'file');
        if (fileMentions.length > 0) {
            const seen = new Set(
                (fileReferences ?? [])
                    .map((r) => r.key)
                    .filter((k): k is string => typeof k === 'string' && k.length > 0)
            );
            const newRefs: FileReference[] = [];
            for (const m of fileMentions) {
                if (typeof m.id !== 'string' || m.id.length === 0) continue;
                if (seen.has(m.id)) continue;
                newRefs.push({
                    key: m.id,
                    name: m.name,
                    type: 'file' as const,
                });
                seen.add(m.id);
            }
            if (newRefs.length > 0) {
                fileReferences = [...(fileReferences ?? []), ...newRefs];
            }
        }
    }

    if (fileReferences && fileReferences.length > 0) {
        try {
            fileReferences = await warmUpFileReferences(activeContext, fileReferences, getAppDb());
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[api/chat] File reference warm-up failed: ${msg}`);
        }
    }

    const requestContext = await buildRequestContext({
        context: activeContext,
        userId: user.id,
        modelId: selectedChatModel,
        isSlashCommand,
        lastMessage: promptText
    });

    // Surface resolved @mentions into the system prompt. ChatComposer
    // already forwards `selectedMentions` via `body.mentions`; we forward
    // them here so `buildAssistantInstructions` can render the
    // `RESOLVED @MENTIONS` block (and any focus student derived from it).
    if (mentions && mentions.length > 0) {
        requestContext.set('resolvedMentions', mentions as never);
    }

    const runId = randomUUID();
    const params: ChatWorkflowParams = {
        runId,
        inputData: {
            threadId,
            resourceId,
            promptText,
            fileReferences: fileReferences ?? []
        },
        requestContext: requestContext as RequestContext<unknown>,
        abortSignal: paylaod.signal
    };

    return params
}

/**
 * Builds the minimal tenant-scoped RequestContext needed to resume an
 * agent tool approval (Approve / Decline). Mirrors the tenant resolution
 * in `buildWorkflowParams` but skips prompt/file/mention processing — the
 * agent snapshot already contains the conversation state; we only need
 * the active tenant so any downstream tool calls (and `approveToolCall`/
 * `declineToolCall`) run inside the right workspace.
 */
export const buildApprovalContext = async (
    user: AuthUser,
    cookies: { get: (key: string) => string | undefined }
): Promise<{ resourceId: string; requestContext: RequestContext<unknown> }> => {
    const selectedChatModel = cookies.get("selected-model") ?? "";
    if (selectedChatModel === 'auto' || selectedChatModel === 'deep-reasoning') {
        error(400, "Invalid model selection");
    }

    const resourceId = `user-${user.id}`;
    const { tenant: tenantContext } = await resolveWorkspaceContext(cookies, {
        id: user.id,
        schoolId: user.schoolId ?? null,
        staffId: (user as any).staffId ?? null,
        designationId: (user as any).designationId ?? null,
        roleId: (user as any).roleId ?? null
    });

    const cookieClass = cookies.get("selected-class");
    let selectedClass: ClassSection | undefined;
    if (cookieClass) {
        try {
            const parsed = JSON.parse(cookieClass) as {
                id?: number;
                classId?: number;
                sectionId?: number;
                className?: string;
                sectionName?: string;
            };
            const effectiveClassId = parsed.classId ?? parsed.id;
            if (typeof effectiveClassId === "number") {
                selectedClass = {
                    id: parsed.id ?? effectiveClassId,
                    classId: parsed.classId,
                    sectionId: typeof parsed.sectionId === "number" ? parsed.sectionId : 0,
                    className: parsed.className ?? "",
                    sectionName: parsed.sectionName ?? ""
                } as ClassSection;
            }
        } catch {
            // ignore parse error
        }
    }

    if (tenantContext.classId === null && selectedClass) {
        (tenantContext as { classId: number | null }).classId =
            (selectedClass as { classId?: number } | undefined)?.classId
            ?? (selectedClass as { id?: number } | undefined)?.id ?? null;
    }
    if (tenantContext.sectionId === null && selectedClass) {
        (tenantContext as { sectionId: number | null }).sectionId =
            selectedClass?.sectionId ?? null;
    }

    let activeContext = tenantContext;

    if (activeContext.examTypeId === null) {
        const resolved = await resolveExamTypeId(activeContext.schoolId, null);
        activeContext = withExamTypeId(activeContext, resolved);
    }

    if (activeContext.academicId === null) {
        const db = await getDatabase();
        const baseRepo = await BaseRepository.build(db, activeContext);
        const academicId = await baseRepo.getAcademicId();
        activeContext = withAcademicId(activeContext, academicId);
    }

    if (
        activeContext.classId === null &&
        activeContext.sectionId === null &&
        (user as { staffId?: number }).staffId
    ) {
        const resolved = await resolveActiveClassScope({
            schoolId: activeContext.schoolId,
            staffId: (user as { staffId?: number }).staffId
        });
        if (resolved) {
            activeContext = Object.freeze({
                ...activeContext,
                classId: resolved.classId,
                sectionId: resolved.sectionId
            });
        }
    }

    const requestContext = await buildRequestContext({
        context: activeContext,
        userId: user.id,
        modelId: selectedChatModel,
        isSlashCommand: false,
        lastMessage: ''
    });

    return { resourceId, requestContext: requestContext as RequestContext<unknown> };
}

/**
 * Resumes a paused agent turn after the user responded to a tool approval
 * request (Approve / Decline). Returns an AI SDK v6 UI message stream that
 * continues the assistant's turn.
 */
export async function resumeAgentToolCall({
    approval,
    requestContext,
    abortSignal
}: {
    approval: ApprovalResponseInfo;
    requestContext: RequestContext<unknown>;
    abortSignal?: AbortSignal;
}) {
    console.log('[api/chat] resuming agent tool approval', {
        runId: approval.runId,
        toolCallId: approval.toolCallId,
        approved: approval.approved
    });

    const agent = mastra.getAgent('assistant');
    if (!agent) {
        throw new Error('Assistant agent not registered on Mastra instance');
    }

    const resumed = approval.approved
        ? await agent.approveToolCall({
            runId: approval.runId,
            toolCallId: approval.toolCallId,
            requestContext,
            abortSignal
        })
        : await agent.declineToolCall({
            runId: approval.runId,
            toolCallId: approval.toolCallId,
            requestContext,
            abortSignal
        });

    return toAISdkStream(resumed, {
        from: 'agent',
        version: 'v6'
    })
}