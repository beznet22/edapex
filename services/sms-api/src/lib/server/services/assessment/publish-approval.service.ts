import { requireScopedContext, type ServiceContext } from "../context";
import { NotFoundError, PermissionError } from "../errors";
import { AssessmentPublishService } from "./publish.service";

/**
 * A teacher asks; an admin decides.
 *
 * Approving calls `AssessmentPublishService.publishResults` — the same method the
 * direct route calls. There is one implementation of "publish", so the gated path
 * cannot drift from the ungated one.
 */
export class PublishApprovalService {
  constructor(private readonly ctx: ServiceContext) {}

  async request(input: {
    readonly examId: number;
    readonly studentIds: readonly number[];
    readonly note: string | null;
  }): Promise<{ id: number }> {
    const user = this.ctx.tenant?.userId ?? null;
    if (user === null) throw new PermissionError("A publish request needs a person.");
    const id = await this.ctx.repos.academics.createApproval(
      requireScopedContext(this.ctx.repos.ctx),
      { ...input, requestedBy: user },
      this.now()
    );
    return { id };
  }

  async pending() {
    return this.ctx.repos.academics.listPending(requireScopedContext(this.ctx.repos.ctx));
  }

  async decide(input: {
    readonly id: number;
    readonly decision: "approved" | "denied";
    readonly note: string | null;
  }): Promise<{ published: number; requestedBy: number | null; decision: "approved" | "denied" }> {
    const adminUserId = this.ctx.tenant?.userId ?? null;
    if (adminUserId === null) throw new PermissionError("A decision needs a person.");

    const decided = await this.ctx.repos.academics.decide(
      requireScopedContext(this.ctx.repos.ctx),
      input.id,
      adminUserId,
      input.decision,
      input.note,
      this.now()
    );
    if (decided === null) {
      throw new NotFoundError("Publish approval", input.id);
    }
    if (decided.status !== "approved") {
      return { published: 0, requestedBy: decided.requestedBy, decision: "denied" };
    }

    const result = await new AssessmentPublishService(this.ctx).publishResults({
      examId: decided.examId,
      studentIds: JSON.parse(decided.studentIdsJson) as number[]
    });
    return { published: result.sent, requestedBy: decided.requestedBy, decision: "approved" };
  }

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }
}
