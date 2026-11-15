"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Bot, Loader2, Pencil, Plus, ShieldAlert, Sparkles, Trash2 } from "lucide-react";

import { Skeleton } from "@edapex/chat";

import { useWorkspaceContext } from "@/components/workspace/WorkspaceContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/workspace/EmptyState";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { GrantPicker, RISK_TONE } from "@/components/workspace/GrantPicker";
import {
  createAgent,
  deleteAgent,
  grantCatalog,
  listAgents,
  setAgentGrants,
  type AgentView,
  type GrantCatalog
} from "@/lib/agents-api";

/**
 * Agents — list, with creation in a modal.
 *
 * The picker is built from the person's own manifest, so it only offers operations they
 * can grant. Offering one the server rejects means the person discovers the ceiling
 * only after writing the whole draft.
 *
 * Grants are shown as *effective* (`agent.operations`), with policy-dropped ones listed
 * separately (`revokedByPolicy`). Hiding the dropped set makes a feature toggle look
 * like data loss.
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
      /*
       * In the dev bypass there is no cowork-api, so a 401 is the *expected* response,
       * not a failure. Showing it as a red error made a working screen look broken and
       * hid the empty state that is the actual dev experience.
       *
       * Everywhere else the error stands: a 401 in production means the session expired,
       * and pretending there are no agents would be a lie.
       */
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
   */
  /*
   * Loading and empty share one container.
   *
   * Previously loading rendered the *list* layout and then resolved to the empty layout —
   * header disappearing, content jumping from top-left to centre. That is precisely the
   * shift a skeleton exists to prevent, and it also meant the header said "Agents" while
   * the body said "Loading agents…".
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
            /*
             * The empty state's shape while loading, so nothing moves when it resolves.
             * The illustration slot is a circle of the same 72px the art occupies.
             */
            <div aria-busy="true" aria-label="Loading agents" className="flex flex-col items-center px-6 py-14">
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

function AgentComposerModal({
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

/**
 * Edit an existing agent's grants.
 *
 * Only the grant is editable. Name, purpose and model are immutable here on purpose:
 * they are what the agent *is*, and changing them mid-life would silently repurpose an
 * agent whose permissions were reviewed under the old description. Recreating is the
 * honest path for that.
 *
 * `revokedByPolicy` is shown in the picker rather than omitted, so a grant that stopped
 * resolving is visible as a fact rather than looking like it was never granted.
 */
function AgentEditorModal({
  agent,
  catalog,
  workspaceId,
  onClose,
  onSaved
}: {
  readonly agent: AgentView | null;
  readonly catalog: GrantCatalog;
  readonly workspaceId: string;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  // Seeded from the agent each time it changes: an editor opened on agent B must never
  // show agent A's ticks.
  useEffect(() => {
    if (agent === null) return;
    setSelected(new Set(agent.operations));
    setError("");
    setConfirmDelete(false);
  }, [agent]);

  const toggle = (operationId: string): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(operationId)) next.delete(operationId);
      else next.add(operationId);
      return next;
    });
  };

  const save = async (): Promise<void> => {
    if (agent === null || saving) return;
    setError("");
    if (selected.size === 0) {
      // An agent with no operations cannot do anything. The server rejects it, so say so
      // before the round trip rather than after.
      setError("An agent needs at least one operation. Delete it instead.");
      return;
    }

    setSaving(true);
    try {
      await setAgentGrants(workspaceId, agent.id, [...selected]);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the grants");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (agent === null || deleting) return;
    setError("");
    setDeleting(true);
    try {
      await deleteAgent(workspaceId, agent.id);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the agent");
    } finally {
      setDeleting(false);
    }
  };

  const changed =
    agent !== null &&
    (selected.size !== agent.operations.length ||
      agent.operations.some((operation) => !selected.has(operation)));

  return (
    <Modal
      description={
        agent === null
          ? ""
          : "Changing the grant takes effect on the next turn. It can only narrow your own ceiling."
      }
      footer={
        <>
          {confirmDelete ? (
            <>
              <span className="mr-auto text-[12px] text-destructive">Delete this agent?</span>
              <Button onClick={() => setConfirmDelete(false)} type="button" variant="ghost">
                Keep
              </Button>
              <Button
                disabled={deleting}
                onClick={() => void remove()}
                type="button"
                variant="destructive"
              >
                {deleting ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                Delete
              </Button>
            </>
          ) : (
            <>
              <Button
                className="mr-auto text-muted-foreground"
                onClick={() => setConfirmDelete(true)}
                type="button"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" />
                Delete
              </Button>
              <span className="text-[12px] text-muted-foreground">{selected.size} selected</span>
              <Button onClick={onClose} type="button" variant="ghost">
                Cancel
              </Button>
              <Button disabled={saving || !changed} onClick={() => void save()} type="button">
                {saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
                Save changes
              </Button>
            </>
          )}
        </>
      }
      onClose={onClose}
      open={agent !== null}
      title={agent === null ? "Agent" : agent.name}
      widthClassName="max-w-2xl"
    >
      <div className="space-y-5 py-2">
        {agent === null ? null : (
          <>
            <p className="text-[13px] leading-6 text-muted-foreground">{agent.purpose}</p>
            <fieldset>
              <legend className="text-[13px] font-medium">Operations</legend>
              <div className="mt-3">
                <GrantPicker
                  catalog={catalog}
                  dropped={agent.revokedByPolicy}
                  droppedFirst
                  onToggle={toggle}
                  selected={selected}
                />
              </div>
            </fieldset>
          </>
        )}

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
