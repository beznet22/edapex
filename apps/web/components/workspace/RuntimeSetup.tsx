"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { KeyRound, LoaderCircle, X } from "lucide-react";

import type { OpenRouterSettings } from "@/lib/xcodex-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RuntimeSetupProps {
  readonly connecting: boolean;
  readonly error: string;
  readonly onConnect: (settings: OpenRouterSettings) => Promise<void>;
  readonly onDismiss: () => void;
}

export function RuntimeSetup({
  connecting,
  error,
  onConnect,
  onDismiss
}: RuntimeSetupProps) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (connecting || apiKey.trim().length === 0 || model.trim().length === 0) return;
    void onConnect({ apiKey: apiKey.trim(), model: model.trim() }).catch(() => undefined);
  };

  return (
    <div
      aria-label="Connect xcodex"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
    >
      <form
        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onSubmit={submit}
      >
        <button
          aria-label="Close runtime setup"
          className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onDismiss}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <KeyRound aria-hidden="true" className="size-5" />
        </span>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">Connect xcodex</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Use your own OpenRouter key. It stays in this tab&apos;s memory only and is not
          written to storage, cookies or the service worker.
        </p>
        <label className="mt-5 grid gap-1.5 text-xs font-semibold text-muted-foreground">
          OpenRouter API key
          <Input
            autoComplete="off"
            disabled={connecting}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-or-v1-…"
            type="password"
            value={apiKey}
          />
        </label>
        <label className="mt-3 grid gap-1.5 text-xs font-semibold text-muted-foreground">
          OpenRouter model
          <Input
            autoComplete="off"
            disabled={connecting}
            onChange={(event) => setModel(event.target.value)}
            placeholder="e.g. openrouter/auto"
            type="text"
            value={model}
          />
        </label>
        {error.length > 0 ? (
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex items-center justify-between gap-3">
          <a
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            href="https://openrouter.ai/keys"
            rel="noreferrer"
            target="_blank"
          >
            Get a key
          </a>
          <Button disabled={connecting || apiKey.trim().length === 0 || model.trim().length === 0} type="submit">
            {connecting ? (
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            ) : null}
            {connecting ? "Connecting…" : "Connect"}
          </Button>
        </div>
        <p className="mt-4 text-[10px] leading-4 text-muted-foreground">
          The key is sent directly to OpenRouter. EdApex never receives it.
        </p>
        <button className="sr-only" type="button" onClick={onDismiss}>
          Dismiss
        </button>
      </form>
    </div>
  );
}
