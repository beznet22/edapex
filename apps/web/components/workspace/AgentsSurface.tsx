"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Pencil, Plus, ShieldAlert } from "lucide-react";

import { Skeleton } from "@edapex/chat";

import { useWorkspaceContext } from "@/components/workspace/WorkspaceContext";
import { Badge } from "@edapex/ui/components/badge";
import { Button } from "@edapex/ui/components/button";
import { EmptyState } from "@/components/workspace/EmptyState";
import { AgentComposerModal } from "@/components/workspace/AgentComposerModal";
import { AgentEditorModal } from "@/components/workspace/AgentEditorModal";
import { RISK_TONE } from "@/components/workspace/GrantPicker";
import { grantCatalog, listAgents, type AgentView } from "@/lib/agents-api";

/**
 * Agents — the list, with creation and editing in modals.
 *
 * The picker behind both modals is built from the person's own manifest, so it only offers
 * operations they can grant. Offering one the server rejects means the person discovers
 * the ceiling only after writing the whole draft.
 *
 * Grants are shown as *effective* (`agent.operations`), each tinted by the risk of the
 * operation, with policy-dropped ones listed separately (`revokedByPolicy`). Hiding the
 * dropped set makes a feature toggle look like data loss.
 */
export function AgentsSurface() {
  const { manifest, workspaceId } = useWorkspaceContext();
  const [agents, setAgents] = useState<readonly AgentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AgentView | null>(null);

  const catalog = useMemo(() => grantCatalog(manifest), [manifest]);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      setAgents(await listAgents(workspaceId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load agents");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /*
   * Empty until the first agent exists.
   *
   * The list and its header are for a surface that has content. Rendering "Agents" with
   * a subtitle above an empty illustration makes the screen look like a failed load, and
   * the one action available — create — competes with a New agent button that does the
   * same thing. So the empty state *is* the page, and the header arrives with the list.
   *
   * Loading and empty share one container. Previously loading rendered the *list* layout
   * and then resolved to the empty layout — header disappearing, content jumping from
   * top-left to centre. That is exactly the shift a skeleton exists to prevent.
   */
  if (loading || (error.length === 0 && agents.length === 0)) {
    return (
      <section className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/*
          A modal cannot live inside a `flex items-center justify-center` block without
          inheriting its centring; keeping the section a plain column and centring the
          empty state itself.
        */}
        <div className="flex flex-1 items-center justify-center">
          {loading ? (
            // The empty state's shape while loading, so nothing moves when it resolves.
            <div
              aria-busy="true"
              aria-label="Loading agents"
              className="flex flex-col items-center px-6 py-14"
            >
              <Skeleton className="size-[72px] rounded-full" />
              <Skeleton className="mt-5 h-4 w-36" />
              <Skeleton className="mt-3 h-3 w-64" />
              <Skeleton className="mt-2 h-3 w-52" />
              <Skeleton className="mt-5 h-9 w-40 rounded-[var(--radius-md)]" />
            </div>
          ) : (
            <EmptyState
              action={
                <Button onClick={() => setCreating(true)} size="sm" variant="outline">
                  <Plus aria-hidden="true" />
                  Create the first one
                </Button>
              }
              description="An agent takes a narrow task you already do and does it without you. Start with one job, not five."
              kind="blank"
              title="No agents yet"
            />
          )}
        </div>

        <AgentComposerModal
          catalog={catalog}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void refresh();
          }}
          open={creating}
          workspaceId={workspaceId}
        />
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex items-baseline justify-between gap-4 px-4 pb-3 pt-5 lg:px-10 lg:pt-8">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Agents</h1>
          <p className="mt-1.5 max-w-prose text-[13px] leading-6 text-muted-foreground">
            An agent can only do what you can do. It narrows your authority; it never adds to it.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} size="sm">
          <Plus aria-hidden="true" />
          New agent
        </Button>
      </header>

      {error.length > 0 ? (
        <div className="mx-4 mt-2 rounded-[var(--radius-md)] bg-destructive/10 px-4 py-3 lg:mx-10">
          <p className="flex items-center gap-2 text-[13px] text-destructive">
            <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
            {error}
          </p>
        </div>
      ) : null}

      <div className="scrollbar-auto min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-4 lg:px-10">
        <ul className="mx-auto max-w-3xl space-y-2.5">
          {agents.map((agent) => (
            <li
              className="rounded-[var(--radius-lg)] bg-card p-5 shadow-[var(--elevation-1)]"
              key={agent.id}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[15px] font-medium leading-6">
                    {agent.name}
                    {agent.kind === "remote" ? (
                      <Badge variant="outline">
                        <ShieldAlert aria-hidden="true" className="size-3" />
                        Remote
                      </Badge>
                    ) : null}
                  </p>
                  <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
                    {agent.purpose}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {agent.operations.length} operation{agent.operations.length === 1 ? "" : "s"}
                  </span>
                  <Button
                    aria-label={`Edit ${agent.name}`}
                    onClick={() => setEditing(agent)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Pencil aria-hidden="true" />
                    Edit
                  </Button>
                </div>
              </div>

              <div className="mt-3.5 flex flex-wrap gap-1.5">
                {agent.operations.map((operation) => {
                  const option = catalog.byId.get(operation);
                  return (
                    <span
                      className={`rounded-[var(--radius-xs)] px-2 py-0.5 text-[11px] font-medium ${
                        option === undefined
                          ? "bg-muted text-muted-foreground"
                          : RISK_TONE[option.risk]
                      }`}
                      key={operation}
                      title={option?.description}
                    >
                      {operation}
                    </span>
                  );
                })}
              </div>

              {agent.revokedByPolicy.length > 0 ? (
                <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-5 text-warning">
                  <AlertCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {agent.revokedByPolicy.join(", ")} no longer resolve — a feature or role
                    changed after this agent was made.
                  </span>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <AgentComposerModal
        catalog={catalog}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          void refresh();
        }}
        open={creating}
        workspaceId={workspaceId}
      />

      <AgentEditorModal
        agent={editing}
        catalog={catalog}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void refresh();
        }}
        workspaceId={workspaceId}
      />
    </section>
  );
}
