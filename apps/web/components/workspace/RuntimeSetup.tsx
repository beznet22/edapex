"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { LoaderCircle, Sparkles, X } from "lucide-react";

import type { NativeAgentSettings } from "@/lib/native-agent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
 * This deliberately collects no credential. The provider key lives on the server
 * and is attached by the `/api/v1/agent/chat` proxy, so a compromised browser
 * bundle or a shared device never exposes it.
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
    <div
      aria-label="Choose a model"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-background/70 p-4 backdrop-blur-md"
      role="dialog"
    >
      <form
        className="animate-spring-in relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-3xl"
        onSubmit={submit}
      >
        <button
          aria-label="Close model setup"
          className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onDismiss}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Sparkles aria-hidden="true" className="size-5" />
        </span>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">Start your workspace</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          EdApex runs the agent locally in this browser and streams from the school
          gateway. No API key is stored on this device.
        </p>
        <label className="mt-5 grid gap-1.5 text-xs font-semibold text-muted-foreground">
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
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex items-center justify-end gap-3">
          <Button disabled={connecting || model.trim().length === 0} type="submit">
            {connecting ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : null}
            {connecting ? "Loading runtime…" : "Open workspace"}
          </Button>
        </div>
        <p className="mt-4 text-[10px] leading-4 text-muted-foreground">
          Approvals are required for every action that reaches the network or your
          school records.
        </p>
      </form>
    </div>
  );
}
