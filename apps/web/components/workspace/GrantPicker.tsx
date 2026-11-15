"use client";

import { Check } from "lucide-react";

import type { GrantCatalog, GrantOption } from "@/lib/agents-api";

/**
 * The operation picker, shared by create and edit.
 *
 * Extracted rather than duplicated: the two screens differ only in what they do with the
 * selection, and a grant picker that drifts between "make an agent" and "change an
 * agent's powers" is exactly the inconsistency the narrowing invariant exists to prevent.
 */

const RISK_TONE: Record<GrantOption["risk"], string> = {
  read: "bg-success/10 text-success",
  write: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive"
};

export interface GrantPickerProps {
  readonly catalog: GrantCatalog;
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (operationId: string) => void;
  /**
   * Operations that were granted and no longer resolve.
   *
   * Shown, disabled, and labelled: silently omitting them makes a role change look like
   * the permission was never granted, and the person cannot tell whether re-selecting it
   * would work.
   */
  readonly dropped?: readonly string[];
  /**
   * Place the dropped notice above the catalog.
   *
   * In the editor it is the most important fact on the screen — a grant that stopped
   * resolving — and at the bottom it sat below twenty operations, effectively invisible.
   * In the create dialog there is nothing dropped, so the flag is irrelevant there.
   */
  readonly droppedFirst?: boolean;
}

export function GrantPicker({
  catalog,
  selected,
  onToggle,
  dropped = [],
  droppedFirst = false
}: GrantPickerProps) {
  return (
    <div className="space-y-3">
      {droppedFirst && dropped.length > 0 ? <DroppedNotice dropped={dropped} /> : null}

      {catalog.tools.map((tool) => (
        <div
          className="rounded-[var(--radius-md)] border border-border bg-background/50 p-4"
          key={tool.id}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {tool.id}
          </p>
          <div className="mt-2 space-y-1">
            {tool.operations.map((operation) => {
              const active = selected.has(operation.operationId);
              return (
                <label
                  className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] px-2 py-2 transition-colors hover:bg-muted"
                  key={operation.operationId}
                >
                  <input
                    checked={active}
                    className="mt-1 size-3.5 shrink-0 accent-[var(--primary)]"
                    onChange={() => onToggle(operation.operationId)}
                    type="checkbox"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                      {operation.operationId}
                      <span
                        className={`rounded px-1.5 py-px text-[10px] font-semibold uppercase ${RISK_TONE[operation.risk]}`}
                      >
                        {operation.risk}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-5 text-muted-foreground">
                      {operation.description}
                    </span>
                  </span>
                  {active ? (
                    <Check aria-hidden="true" className="mt-1 size-3.5 shrink-0 text-primary" />
                  ) : null}
                </label>
              );
            })}
          </div>
        </div>
      ))}

      {!droppedFirst && dropped.length > 0 ? <DroppedNotice dropped={dropped} /> : null}
    </div>
  );
}

/**
 * Grants that stopped resolving.
 *
 * Not re-selectable from here: they fell outside the ceiling, so checking one again
 * would produce a rejection. The explanation matters more than the control.
 */
function DroppedNotice({ dropped }: { readonly dropped: readonly string[] }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-warning/30 bg-warning/10 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-warning">
        No longer permitted
      </p>
      <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
        These were granted when the agent was made, but a role or feature change removed
        them. They cannot be re-granted until the ceiling widens.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {dropped.map((operation) => (
          <span
            className="rounded-[var(--radius-xs)] bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground line-through"
            key={operation}
          >
            {operation}
          </span>
        ))}
      </div>
    </div>
  );
}

export { RISK_TONE };
