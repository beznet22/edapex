"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";

import type { NativeAgentSettings } from "@/lib/native-agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

interface RuntimeSetupProps {
  readonly workspaceId: string;
  readonly connecting: boolean;
  readonly error: string;
  readonly onConnect: (settings: NativeAgentSettings) => Promise<void>;
  readonly onDismiss: () => void;
}

/**
 * Model selection for the workspace.
 *
 * This deliberately collects no credential. The provider key lives on the server and is
 * attached by the `/api/v1/agent/chat` proxy, so a compromised browser bundle or a
 * shared device never exposes it.
 *
 * It now renders through `Modal` rather than its own overlay. The overlay here was the
 * pattern the shared component was extracted from, and leaving both would mean two
 * dialogs that drift on focus handling, Escape, and scroll-locking — the exact
 * duplication this codebase keeps re-learning.
 */
export function RuntimeSetup({
  workspaceId,
  connecting,
  error,
  onConnect,
  onDismiss
}: RuntimeSetupProps) {
  const [model, setModel] = useState("openrouter/auto");

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (connecting || model.trim().length === 0) return;
    void onConnect({
      workspaceId,
      model: model.trim(),
      mobileSafeTools: true
    }).catch(() => undefined);
  };

  return (
    <Modal
      description="EDAPEX runs the agent locally in this browser and streams from the school gateway. No API key is stored on this device."
      footer={
        <>
          <p className="mr-auto max-w-[28ch] text-[10px] leading-4 text-muted-foreground">
            Approvals are required for every action that reaches the network or your school
            records.
          </p>
          <Button disabled={connecting || model.trim().length === 0} form="runtime-setup" type="submit">
            {connecting ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : null}
            {connecting ? "Loading runtime…" : "Open workspace"}
          </Button>
        </>
      }
      onClose={onDismiss}
      open
      title="Start your workspace"
    >
      <form className="pb-2" id="runtime-setup" onSubmit={submit}>
        <span className="flex size-11 items-center justify-center rounded-[var(--radius-md)] bg-primary/15 text-primary">
          <Sparkles aria-hidden="true" className="size-5" />
        </span>
        <label className="mt-5 grid gap-2 text-[13px] font-medium text-muted-foreground">
          Model
          <Input
            autoComplete="off"
            disabled={connecting}
            onChange={(event) => setModel(event.target.value)}
            placeholder="openrouter/auto"
            type="text"
            value={model}
          />
        </label>
        {error.length > 0 ? (
          <p className="mt-4 rounded-[var(--radius-sm)] border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[12px] leading-5 text-destructive">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
