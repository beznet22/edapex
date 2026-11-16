"use client";

import { useCallback, useState } from "react";
import type { FormEvent } from "react";

import { IDLE, noticeFromError, type LoginNotice } from "@/lib/auth-notice";
import { requestMagicLink } from "@/lib/api";

/**
 * Email sign-in state.
 *
 * Both consumers of the login screen — the workspace layout and the admin page — carried the
 * same eighteen lines of state and the same handler, differing only in their copy. That is
 * the kind of duplication that drifts: one gets a fix, the other keeps the bug.
 *
 * The notice is a single value rather than a message plus an error, so the screen can never
 * show "check your inbox" underneath "session check failed".
 */
export interface EmailSignIn {
  readonly email: string;
  readonly notice: LoginNotice;
  readonly sending: boolean;
  readonly setEmail: (value: string) => void;
  readonly submit: (event: FormEvent<HTMLFormElement>) => void;
  readonly reset: () => void;
  readonly fail: (message: string, status?: number) => void;
}

export function useEmailSignIn(initial: LoginNotice = IDLE): EmailSignIn {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<LoginNotice>(initial);
  const [sending, setSending] = useState(false);

  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      event.preventDefault();
      if (sending) return;

      const trimmed = email.trim();
      if (trimmed.length === 0) {
        setNotice({ kind: "failed", message: "Enter your school email address." });
        return;
      }

      setSending(true);
      void (async () => {
        try {
          const { devLink } = await requestMagicLink(trimmed);
          /*
           * The API answers 202 for a known and an unknown address alike, so this cannot
           * distinguish "sent" from "no such account" — by design, so the screen does not
           * reveal who has an account. The confirmation therefore states what was
           * *requested*, not what was delivered.
           */
          setNotice({ kind: "sent", email: trimmed, devLink });
        } catch (cause) {
          setNotice(
            noticeFromError(
              cause instanceof Error ? cause.message : "Could not send the sign-in link"
            )
          );
        } finally {
          setSending(false);
        }
      })();
    },
    [email, sending]
  );

  const reset = useCallback((): void => {
    setNotice(IDLE);
  }, []);

  const fail = useCallback((message: string, status?: number): void => {
    setNotice(noticeFromError(message, status));
  }, []);

  return { email, notice, sending, setEmail, submit, reset, fail };
}
