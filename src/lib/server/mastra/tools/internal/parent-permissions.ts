export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ParentContext {
  parentId = 0;
  userId = 0;
  schoolId = 0;
  childIds: number[] = [];
  telegramChatId?: string;
  phoneNumber?: string;
  verifiedAt?: string;
  schoolName?: string;
  schoolPhone?: string;
  schoolEmail?: string;
}

export function assertParent(parentContext: ParentContext | null | undefined): void {
  if (parentContext === null || parentContext === undefined) {
    throw new ForbiddenError("PARENT_CONTEXT_REQUIRED: no authenticated parent on this request");
  }
  if (typeof parentContext.parentId !== "number" || parentContext.parentId <= 0) {
    throw new ForbiddenError("PARENT_CONTEXT_INVALID: missing or invalid parentId");
  }
}

export function assertParentOwnsStudent(parentContext: ParentContext | null | undefined, studentId: number): void {
  assertParent(parentContext);
  const ctx = parentContext as ParentContext;
  if (!Array.isArray(ctx.childIds) || !ctx.childIds.includes(studentId)) {
    throw new ForbiddenError(
      `STUDENT_NOT_OWNED: studentId=${studentId} is not registered under parentId=${ctx.parentId}`,
    );
  }
}
