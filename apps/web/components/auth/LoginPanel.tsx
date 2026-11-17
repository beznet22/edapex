"use client";

import Link from "next/link";
import type { FormEvent } from "react";

import { GoogleMark } from "@/components/auth/GoogleMark";
import { BrandMark } from "@/components/workspace/BrandMark";
import { Button } from "@edapex/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator
} from "@edapex/ui/components/field";
import { Input } from "@edapex/ui/components/input";
import { noticeMessage, type LoginNotice } from "@/lib/auth-notice";

/**
 * The sign-in screen.
 *
 * Layout follows the shadcn split template: one column holding the brand and the form, and a
 * full-height panel to the right above `lg`. That panel carries the product's own statement
 * and the mark's geometry rather than a stock photograph — decorative imagery on a school
 * login ships kilobytes and says nothing.
 *
 * The form follows the reference: Google first for the people who have it, a hairline "or",
 * then email. Email is the method that always works, so it is never hidden behind a tab, but
 * making it the only option would turn the common case into two steps.
 *
 * Every state is a *replacement*, never an addition. The previous screen drew its error
 * callout and its success notice at the same time, so "check your inbox" appeared underneath
 * "session check failed" and the person could not tell which was current.
 */
export function LoginPanel({
  notice,
  email,
  sending,
  googleAvailable = true,
  onEmailChange,
  onSubmit,
  onGoogle,
  onReset
}: {
  readonly notice: LoginNotice;
  readonly email: string;
  readonly sending: boolean;
  /**
   * Whether the API has Google credentials.
   *
   * Defaults to `true`: an unconfigured Google button is a visible failure the person can
   * report, while a missing one looks like the feature was never built. The server's 404 on
   * `google/start` surfaces as the `unconfigured` notice.
   */
  readonly googleAvailable?: boolean;
  readonly onEmailChange: (value: string) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onGoogle: () => void;
  readonly onReset: () => void;
}) {
  const message = noticeMessage(notice);

  return (
    <div className="grid min-h-dvh bg-background text-foreground lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex items-center gap-2">
          <BrandMark size={26} />
          <span className="text-[15px] font-semibold uppercase tracking-[0.08em]">EDAPEX</span>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-[340px]">
            {notice.kind === "sent" ? (
              <SentState
                devLink={notice.devLink ?? null}
                email={notice.email}
                onReset={onReset}
              />
            ) : (
              <form className="flex flex-col gap-6" onSubmit={onSubmit}>
                <FieldGroup>
                  <div className="flex flex-col gap-1.5">
                    <h1 className="text-[26px] font-semibold leading-tight tracking-tight">
                      Sign in to EDAPEX
                    </h1>
                    <p className="text-[13px] leading-6 text-muted-foreground">
                      Use the Google account linked to your school, or get a link by email.
                    </p>
                  </div>

                  {message === null ? null : (
                    <p
                      className="rounded-[var(--radius-sm)] bg-destructive/10 px-3 py-2.5 text-[13px] leading-5 text-[var(--destructive-ink)]"
                      role="alert"
                    >
                      {message}
                    </p>
                  )}

                  {googleAvailable ? (
                    <>
                      <Field>
                        <Button
                          className="h-10 w-full"
                          disabled={sending}
                          onClick={onGoogle}
                          type="button"
                          variant="outline"
                        >
                          <GoogleMark />
                          Continue with Google
                        </Button>
                      </Field>
                      <FieldSeparator>Or</FieldSeparator>
                    </>
                  ) : null}

                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                      autoComplete="email"
                      className="h-10"
                      disabled={sending}
                      id="email"
                      inputMode="email"
                      onChange={(event) => onEmailChange(event.target.value)}
                      placeholder="you@school.example"
                      required
                      type="email"
                      value={email}
                    />
                  </Field>

                  <Field>
                    <Button className="h-10 w-full" disabled={sending} type="submit">
                      {sending ? "Sending…" : "Continue with email"}
                    </Button>
                    <FieldDescription className="text-center">
                      We&apos;ll email a link that works once and expires in 15 minutes.
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-[12px] leading-5 text-muted-foreground lg:text-left">
          By continuing you agree to your school&apos;s acceptable-use policy.{" "}
          <Link className="underline underline-offset-4 hover:text-foreground" href="/">
            Privacy
          </Link>
        </p>
      </div>

      {/*
        The right panel: a tinted field in the mark's own colours rather than a photograph.
        The gradient is `aria-hidden` — a screen reader has no use for it, and the blockquote
        carries the only real content.
      */}
      <div className="relative hidden overflow-hidden border-l border-border bg-muted lg:block">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "radial-gradient(circle at 30% 25%, color-mix(in oklch, var(--primary) 18%, transparent), transparent 55%), radial-gradient(circle at 72% 68%, color-mix(in oklch, var(--accent) 60%, transparent), transparent 52%)"
          }}
        />
        <div className="relative flex h-full flex-col justify-end p-10">
          <div className="max-w-[42ch]">
            <p className="text-[26px] font-semibold leading-[1.2] tracking-tight">
              Everything connected.
              <br />
              Everyone empowered.
            </p>
            <p className="mt-4 text-[14px] leading-6 text-muted-foreground">
              From classrooms to administration, bring your entire school community into one
              seamless workspace.
            </p>
            <p className="mt-6 text-[13px] font-medium tracking-[0.01em] text-foreground">
              EDAPEX — schoolwork, reimagined.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The confirmation state.
 *
 * It replaces the form rather than sitting beneath it. After submitting, the only useful
 * actions are "open your mail" and "I used the wrong address"; leaving a live form under a
 * confirmation invites a duplicate send.
 */
function SentState({
  email,
  devLink,
  onReset
}: {
  readonly email: string;
  /**
   * Present only under the local console transport, where no email is actually sent.
   *
   * Offering the button beats "check your inbox" for a message that is sitting in the API
   * terminal. The field is null in production, so this cannot become a way to bypass email.
   */
  readonly devLink: string | null;
  readonly onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
        <svg
          aria-hidden="true"
          className="size-6 text-primary"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
          viewBox="0 0 24 24"
        >
          <rect height="16" rx="2" width="20" x="2" y="4" />
          <path d="m2 7 10 6 10-6" />
        </svg>
      </div>
      <div>
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight">
          Check your inbox
        </h1>
        <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">
          We sent a sign-in link to{" "}
          <span className="font-medium text-foreground">{email}</span>. It works once and
          expires in 15 minutes.
        </p>
      </div>
      {devLink === null ? null : (
        <div className="w-full rounded-[var(--radius-md)] border border-dashed border-border bg-muted/40 p-3 text-left">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Local development
          </p>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            No email is sent here. Open the link directly:
          </p>
          <a
            className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-[var(--radius-md)] bg-primary text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            href={devLink}
          >
            Sign in now
          </a>
        </div>
      )}
      <Button className="w-full" onClick={onReset} type="button" variant="outline">
        Use a different email
      </Button>
    </div>
  );
}
