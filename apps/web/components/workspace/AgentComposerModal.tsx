"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";

import { Button } from "@edapex/ui/components/button";
import { Input } from "@edapex/ui/components/input";
import { Modal } from "@/components/ui/modal";
import { GrantPicker } from "@/components/workspace/GrantPicker";
import { createAgent, type GrantCatalog } from "@/lib/agents-api";

/**
 * Creating an agent, in a modal over the list.
 *
 * The picker is built from the person's own manifest, so it only offers operations they
 * can grant. Offering one the server will reject means the person discovers the ceiling
 * only after writing the whole draft.
 */
export function AgentComposerModal({
  open,
  catalog,
  workspaceId,
  onClose,
  onCreated
}: {
  readonly open: boolean;
  readonly catalog: GrantCatalog;
  readonly workspaceId: string;
  readonly onClose: () => void;
  readonly onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [model, setModel] = useState("claude-sonnet-4");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // A reopened dialog must not carry the previous draft: silently editing the last
  // attempt is worse than starting clean, because the person cannot tell which one
  // they are looking at.
  useEffect(() => {
    if (!open) return;
    setName("");
    setPurpose("");
    setSelected(new Set());
    setError("");
  }, [open]);

  const toggle = (operationId: string): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(operationId)) next.delete(operationId);
      else next.add(operationId);
      return next;
    });
  };

  const submit = async (): Promise<void> => {
    if (saving) return;
    setError("");

    if (name.trim().length === 0) {
      setError("Give the agent a name.");
      return;
    }
    if (selected.size === 0) {
      setError("Pick at least one operation.");
      return;
    }

    setSaving(true);
    try {
      await createAgent(workspaceId, {
        name: name.trim(),
        purpose: purpose.trim(),
        model: model.trim(),
        kind: "local",
        operationIds: [...selected]
      });
      onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the agent");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      description="Only operations you can perform are listed. An agent cannot hold more than its creator."
      footer={
        <>
          <span className="mr-auto text-[12px] text-muted-foreground">
            {selected.size} selected
          </span>
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void submit()} type="button">
            {saving ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Sparkles aria-hidden="true" />
            )}
            Create agent
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title="New agent"
      widthClassName="max-w-2xl"
    >
      <div className="space-y-6 py-2">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[13px] font-medium">Name</span>
            <Input
              className="mt-2"
              onChange={(event) => setName(event.target.value)}
              placeholder="Homework Helper"
              value={name}
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-medium">Model</span>
            <Input
              className="mt-2"
              onChange={(event) => setModel(event.target.value)}
              value={model}
            />
          </label>
        </div>

        <label className="block">
          <span className="text-[13px] font-medium">What it does</span>
          <Input
            className="mt-2"
            onChange={(event) => setPurpose(event.target.value)}
            placeholder="Drafts feedback on marked homework for my class."
            value={purpose}
          />
        </label>

        <fieldset>
          <legend className="text-[13px] font-medium">Operations</legend>
          <div className="mt-3">
            <GrantPicker catalog={catalog} onToggle={toggle} selected={selected} />
          </div>
        </fieldset>

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
