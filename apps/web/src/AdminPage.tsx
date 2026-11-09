import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { DirectoryTable } from "./DirectoryTable";
import { LoginPanel } from "./LoginPanel";

import {
  apiBase,
  createClaimLink,
  getSession,
  loadDirectory,
  requestMagicLink,
  revokeClaimLink
} from "./api";
import type {
  ClaimDirectoryItem,
  ClaimDirectoryPage,
  CreatedClaimLink,
  DirectoryFilters,
  SessionView
} from "./api";

type SessionState = "loading" | "anonymous" | "authenticated";
type AuthMode = "google" | "email";

const defaultFilters: DirectoryFilters = {
  persona: "all",
  status: "all",
  search: "",
  page: 1,
  pageSize: 50
};



export function AdminPage() {
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [session, setSession] = useState<SessionView | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("google");
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authSending, setAuthSending] = useState(false);
  const [academicId, setAcademicId] = useState(
    Number(window.localStorage.getItem("edapex.academicId") ?? "5")
  );
  const [filters, setFilters] = useState(defaultFilters);
  const [page, setPage] = useState<ClaimDirectoryPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ item: ClaimDirectoryItem; link: CreatedClaimLink } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const current = await getSession();
        if (cancelled) return;
        setSession(current);
        setSessionState(current === null ? "anonymous" : "authenticated");
      } catch (cause) {
        if (cancelled) return;
        setSessionState("anonymous");
        setError(cause instanceof Error ? cause.message : "Session check failed");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (sessionState !== "authenticated" || !Number.isInteger(academicId)) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    loadDirectory(academicId, filters)
      .then((result) => {
        if (!cancelled) setPage(result);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load directory");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [academicId, filters, sessionState]);

  const updateAcademic = (event: ChangeEvent<HTMLInputElement>): void => {
    const next = Number(event.target.value);
    setAcademicId(next);
    window.localStorage.setItem("edapex.academicId", String(next));
    setFilters((current) => ({ ...current, page: 1 }));
  };

  const updateSearch = (event: ChangeEvent<HTMLInputElement>): void => {
    setFilters((current) => ({ ...current, search: event.target.value, page: 1 }));
  };

  const requestLink = async (item: ClaimDirectoryItem): Promise<void> => {
    try {
      const link = await createClaimLink(academicId, item);
      setCreated({ item, link });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create claim link");
    }
  };

  const revoke = async (item: ClaimDirectoryItem): Promise<void> => {
    if (item.linkId === null) return;
    try {
      await revokeClaimLink(academicId, item.linkId);
      setPage((current) =>
        current === null
          ? current
          : {
              ...current,
              items: current.items.map((row) =>
                row.subjectId === item.subjectId && row.persona === item.persona
                  ? { ...row, linkStatus: "revoked" as const, linkId: null }
                  : row
              )
            }
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not revoke claim link");
    }
  };

  const sendMagicLink = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (authSending) return;
    setAuthMessage("");
    if (email.trim().length === 0) {
      setAuthMessage("Enter your school email address.");
      return;
    }
    setAuthSending(true);
    try {
      await requestMagicLink(email.trim());
      setAuthMessage("Check your email for a sign-in link. You can close this message after signing in.");
    } catch (cause) {
      setAuthMessage(cause instanceof Error ? cause.message : "Could not send the sign-in link");
    } finally {
      setAuthSending(false);
    }
  };

  if (sessionState === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <section className="w-full max-w-xl rounded-xl border border-border bg-card p-8 shadow-2xl">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-primary">EdApex</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Checking your session…</h1>
        </section>
      </main>
    );
  }

  if (sessionState === "anonymous") {
    return (
      <LoginPanel
        authMessage={authMessage}
        authMode={authMode}
        email={email}
        error={error}
        onEmailChange={setEmail}
        onGoogle={() => window.location.assign(`${apiBase()}/api/v1/auth/google/start`)}
        onMagicLink={(event) => void sendMagicLink(event)}
        onModeChange={setAuthMode}
        sending={authSending}
      />
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-[92rem] px-4 py-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-primary">EdApex administration</div>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Claim links</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Signed in as {session?.user.fullName ?? session?.user.email ?? "administrator"}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-muted-foreground" htmlFor="academicId">
              Academic ID
            </label>
            <Input
              className="w-24"
              id="academicId"
              min={1}
              onChange={updateAcademic}
              type="number"
              value={Number.isFinite(academicId) ? academicId : ""}
            />
          </div>
        </header>

        {error.length > 0 ? <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

        {created !== null ? (
          <section className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <strong className="text-sm">
              Link generated for {created.item.fullName ?? created.item.email ?? "record"}
            </strong>
            <p className="mt-1 text-sm text-muted-foreground">
              Copy it now. The raw token is not stored and cannot be shown again.
            </p>
            <code className="mt-3 block break-all rounded-lg border border-border bg-background p-3 text-xs text-foreground">
              {created.link.url}
            </code>
            <div className="mt-3 flex gap-2">
              <Button onClick={() => void navigator.clipboard.writeText(created.link.url)} type="button">
                Copy link
              </Button>
              <Button onClick={() => setCreated(null)} type="button" variant="outline">
                Dismiss
              </Button>
            </div>
          </section>
        ) : null}

        <section className="mb-4 grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
            Search
            <Input
              onChange={updateSearch}
              placeholder="Name, email or phone"
              type="search"
              value={filters.search}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
            Persona
            <Select
              onValueChange={(value) => {
                if (value === "all" || value === "staff" || value === "parent") {
                  setFilters((current) => ({ ...current, persona: value, page: 1 }));
                }
              }}
              value={filters.persona}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="parent">Parents</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
            Status
            <Select
              onValueChange={(value) => setFilters((current) => ({ ...current, status: value, page: 1 }))}
              value={filters.status}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  ["all", "All"],
                  ["unclaimed", "Unclaimed"],
                  ["claimed", "Claimed"],
                  ["flagged", "Flagged"],
                  ["no_user", "No user"],
                  ["no_email", "No email"],
                  ["non_gmail", "Non-Gmail"],
                  ["duplicate", "Duplicate email"],
                  ["link_active", "Link active"],
                  ["link_revoked", "Link revoked"]
                ].map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </section>

        <DirectoryTable
          loading={loading}
          onNext={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}
          onPrevious={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}
          onRequest={(item) => void requestLink(item)}
          onRevoke={(item) => void revoke(item)}
          page={page}
          pageNumber={filters.page}
          pageSize={filters.pageSize}
        />
      </div>
    </main>
  );
}
