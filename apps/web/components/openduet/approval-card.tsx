"use client";

import type { ApprovalPart } from "@edapex/contracts";
import { Check, ShieldAlert, X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ApprovalCardProps {
  readonly messageId: string;
  readonly approval: ApprovalPart;
  readonly onDecision: (
    messageId: string,
    approvalRequestId: string,
    decision: "allowed" | "declined"
  ) => void;
}

const RISK_LABEL: Record<ApprovalPart["risk"], string> = {
  read: "Read",
  write: "Write",
  destructive: "Destructive"
};

export function ApprovalCard({ messageId, approval, onDecision }: ApprovalCardProps) {
  const pending = approval.status === "pending";
  return (
    <section
      aria-label={pending ? "Approval required" : "Approval decision"}
      className={
        pending
          ? "rounded-xl border border-primary/35 bg-primary/5 p-3.5"
          : "rounded-xl border border-border bg-card/60 p-3"
      }
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className={
            pending
              ? "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"
              : "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
          }
        >
          {pending ? <ShieldAlert className="size-4" /> : <Check className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{approval.title}</h3>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {RISK_LABEL[approval.risk]}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{approval.description}</p>
          {pending ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                className="min-h-11"
                onClick={() => onDecision(messageId, approval.approvalRequestId, "allowed")}
                size="sm"
                type="button"
              >
                <Check aria-hidden="true" className="size-4" />
                Allow once
              </Button>
              <Button
                className="min-h-11"
                onClick={() => onDecision(messageId, approval.approvalRequestId, "declined")}
                size="sm"
                type="button"
                variant="outline"
              >
                <X aria-hidden="true" className="size-4" />
                Decline
              </Button>
            </div>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              {approval.status === "allowed" ? (
                <Check aria-hidden="true" className="size-3.5 text-emerald-400" />
              ) : (
                <X aria-hidden="true" className="size-3.5 text-destructive" />
              )}
              {approval.status === "allowed" ? "You allowed this action." : "You declined this action."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
