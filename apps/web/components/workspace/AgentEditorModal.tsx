"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Trash2 } from "lucide-react";

import { Badge } from "@edapex/ui/components/badge";
import { Button } from "@edapex/ui/components/button";
import { Modal } from "@/components/ui/modal";
import { GrantPicker } from "@/components/workspace/GrantPicker";
import { deleteAgent, setAgentGrants, type AgentView, type GrantCatalog } from "@/lib/agents-api";

/**
 * Editing an existing agent's powers.
 *
 * Only the grant is editable. Name, purpose and model are what the agent *is*; changing
 * them mid-life silently repurposes an agent whose grants were written for the old job.
 *
 * The dropped set is shown first and loudly. `revokedByPolicy` below a full operation
 * catalog is effectively invisible — and it is the most important fact on the screen
 * ("three of your grants stopped resolving").
 */
export function AgentEditorModal({
  agent,
  catalog,
  workspaceId,
  onClose,
  onSaved
}: {
  readonly agent: AgentView | null;
  readonly catalog: GrantCatalog;
  readonly workspaceId: string;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  // Seeded from the agent each time it changes: an editor opened on agent B must never
  // show agent A's ticks.
  useEffect(() => {
    if (agent === null) return;
    setSelected(new Set(agent.operations));
    setError("");
    setConfirmDelete(false);
  }, [agent]);

  const toggle = (operationId: string): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(operationId)) next.delete(operationId);
      else next.add(operationId);
      return next;
    });
  };

  const save = async (): Promise<void> => {
    if (agent === null || saving) return;
    setError("");
    if (selected.size === 0) {
      // An agent with no operations cannot do anything. The server rejects it, so say so
      // before the round trip rather than after.
      setError("An agent needs at least one operation. Delete it instead.");
      return;
    }

    setSaving(true);
    try {
      await setAgentGrants(workspaceId, agent.id, [...selected]);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the grants");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (agent === null || deleting) return;
    setError("");
    setDeleting(true);
    try {
      await deleteAgent(workspaceId, agent.id);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the agent");
    } finally {
      setDeleting(false);
    }
  };

  const changed =
    agent !== null &&
    (selected.size !== agent.operations.length ||
      agent.operations.some((operation) => !selected.has(operation)));

  return (
    <Modal
      description={
        agent === null
          ? ""
          : "Changing the grant takes effect on the next turn. It can only narrow your own ceiling."
      }
      footer={
        <>
          {confirmDelete ? (
            <>
              <span className="mr-auto text-[12px] text-destructive">Delete this agent?</span>
              <Button onClick={() => setConfirmDelete(false)} type="button" variant="ghost">
                Keep
              </Button>
              <Button
                disabled={deleting}
                onClick={() => void remove()}
                type="button"
                variant="destructive"
              >
                {deleting ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                Delete
              </Button>
            </>
          ) : (
            <>
              <Button
                className="mr-auto text-muted-foreground"
                onClick={() => setConfirmDelete(true)}
                type="button"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" />
                Delete
              </Button>
              <span className="text-[12px] text-muted-foreground">{selected.size} selected</span>
              <Button onClick={onClose} type="button" variant="ghost">
                Cancel
              </Button>
              <Button disabled={saving || !changed} onClick={() => void save()} type="button">
                {saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                Save changes
              </Button>
            </>
          )}
        </>
      }
      onClose={onClose}
      open={agent !== null}
      title={agent === null ? "Agent" : agent.name}
      widthClassName="max-w-2xl"
    >
      <div className="space-y-5 py-2">
        {agent === null ? null : (
          <>
            <p className="text-[13px] leading-6 text-muted-foreground">{agent.purpose}</p>
            <fieldset>
              <legend className="text-[13px] font-medium">Operations</legend>
              <div className="mt-3">
                <GrantPicker
                  catalog={catalog}
                  dropped={agent.revokedByPolicy}
                  droppedFirst
                  onToggle={toggle}
                  selected={selected}
                />
              </div>
            </fieldset>
          </>
        )}

        {error.length > 0 ? (
          <p className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-destructive/10 px-3 py-2.5 text-[13px] text-destructive">
            <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
