import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LoginPanelProps {
  readonly authMode: "google" | "email";
  readonly email: string;
  readonly authMessage: string;
  readonly error: string;
  readonly onModeChange: (mode: "google" | "email") => void;
  readonly onEmailChange: (email: string) => void;
  readonly onMagicLink: (event: FormEvent<HTMLFormElement>) => void;
  readonly onGoogle: () => void;
  readonly sending: boolean;
}

export function LoginPanel({
  authMode,
  email,
  authMessage,
  error,
  onModeChange,
  onEmailChange,
  onMagicLink,
  onGoogle,
  sending
}: LoginPanelProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-16 text-foreground">
      <section className="w-full max-w-xl rounded-xl border border-border bg-card p-8 shadow-2xl">
        <div className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
          EdApex administration
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sign in to continue</h1>
        <p className="mb-5 mt-2 text-sm leading-6 text-muted-foreground">
          This page is for school administrators. Use the Google account linked to your staff
          account or a magic link sent to your school email.
        </p>

        <div className="mb-4 flex gap-2">
          {(["google", "email"] as const).map((mode) => (
            <Button
              key={mode}
              onClick={() => onModeChange(mode)}
              size="sm"
              type="button"
              variant={authMode === mode ? "default" : "outline"}
            >
              {mode === "google" ? "Google" : "Magic link"}
            </Button>
          ))}
        </div>

        {authMode === "google" ? (
          <Button className="w-full" onClick={onGoogle} type="button">
            Continue with Google
          </Button>
        ) : (
          <form className="grid gap-3" onSubmit={onMagicLink}>
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="email">
              School email
            </label>
            <Input
              disabled={sending}
              id="email"
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="you@school.example"
              type="email"
              value={email}
            />
            <Button disabled={sending} type="submit">
              {sending ? "Sending…" : "Send magic link"}
            </Button>
          </form>
        )}
        {authMessage.length > 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{authMessage}</p>
        ) : null}
        {error.length > 0 ? (
          <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
