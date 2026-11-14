"use client";

import { useEffect, useState } from "react";

import { apiBase } from "@/lib/api";

type ClaimState = "working" | "error" | "missing";

export function ClaimPage() {
  const [state, setState] = useState<ClaimState>("working");
  const [message, setMessage] = useState("Validating your claim link…");

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
    if (token === null || token.length === 0) {
      setState("missing");
      setMessage("This claim link is missing its token. Ask your school administrator for a new link.");
      return;
    }

    let cancelled = false;
    const run = async (): Promise<void> => {
      try {
        const response = await fetch(`${apiBase()}/api/v1/auth/claim-link/exchange`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token })
        });
        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null);
          const detail =
            typeof body === "object" &&
            body !== null &&
            "message" in body &&
            typeof body.message === "string"
              ? body.message
              : "This claim link is invalid, expired, or already used.";
          if (!cancelled) {
            setState("error");
            setMessage(detail);
          }
          return;
        }
        window.location.assign(`${apiBase()}/api/v1/auth/google/start`);
      } catch {
        if (!cancelled) {
          setState("error");
          setMessage("We could not reach sign-in. Check your connection and try again.");
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-16 text-foreground">
      <section className="w-full max-w-xl rounded-xl border border-border bg-card p-8 shadow-2xl">
        <div className="text-xs font-bold uppercase tracking-[0.16em] text-primary">EdApex</div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Claim your account</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
        {state === "error" ? (
          <p className="mt-4 text-sm text-muted-foreground">
            If the link expired, ask your school administrator to generate a new one.
          </p>
        ) : null}
      </section>
    </main>
  );
}
