"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Bot, Check, Loader2, Plus, ShieldAlert, Sparkles } from "lucide-react";

import { useWorkspaceContext } from "@/components/workspace/WorkspaceContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  createAgent,
  grantCatalog,
  listAgents,
  type AgentView,
  type GrantCatalog,
  type GrantOption
} from "@/lib/agents-api";
import { DEV_AUTH_BYPASS } from "@/lib/dev-preview";

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

const RISK_TONE: Record<GrantOption["risk"], string> = {
  read: "bg-success/10 text-success",
  write: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive"
};

export function AgentsSurface() {
  const { manifest, workspaceId } = useWorkspaceContext();
  const [agents, setAgents] = useState<readonly AgentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

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
          {/* A bare "Request failed (401)" tells a developer nothing. */}
          {DEV_AUTH_BYPASS ? (
            <p className="mt-1.5 pl-6 text-[12px] leading-5 text-muted-foreground">
              Dev bypass is on and there is no local agent database. Point
              NEXT_PUBLIC_API_BASE_URL at a running cowork-api to create agents here.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-4 lg:px-10">
        {loading ? (
          <p className="flex items-center gap-2 py-8 text-[13px] text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Loading agents…
          </p>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="flex size-14 items-center justify-center rounded-[var(--radius-lg)] bg-primary/15 text-primary">
              <Bot aria-hidden="true" className="size-6" />
            </span>
            <h2 className="mt-5 text-base font-semibold tracking-tight">No agents yet</h2>
            <p className="mt-2 max-w-sm text-[13px] leading-6 text-muted-foreground">
              An agent takes a narrow task you already do and does it without you. Start with one
              job, not five.
            </p>
            <Button className="mt-5" onClick={() => setCreating(true)} size="sm" variant="outline">
              <Plus aria-hidden="true" />
              Create the first one
            </Button>
          </div>
        ) : (
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
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {agent.operations.length} operation{agent.operations.length === 1 ? "" : "s"}
                  </span>
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
          <div className="mt-3 space-y-3">
            {catalog.tools.map((tool) => (
              <div
                className="rounded-[var(--radius-md)] border border-border bg-background/50 p-4"
                key={tool.id}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {tool.id}
                </p>
                <div className="mt-2 space-y-1">
                  {tool.operations.map((operation) => {
                    const active = selected.has(operation.operationId);
                    return (
                      <label
                        className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] px-2 py-2 transition-colors hover:bg-muted"
                        key={operation.operationId}
                      >
                        <input
                          checked={active}
                          className="mt-1 size-3.5 shrink-0 accent-[var(--primary)]"
                          onChange={() => toggle(operation.operationId)}
                          type="checkbox"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                            {operation.operationId}
                            <span
                              className={`rounded px-1.5 py-px text-[10px] font-semibold uppercase ${RISK_TONE[operation.risk]}`}
                            >
                              {operation.risk}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-[12px] leading-5 text-muted-foreground">
                            {operation.description}
                          </span>
                        </span>
                        {active ? (
                          <Check
                            aria-hidden="true"
                            className="mt-1 size-3.5 shrink-0 text-primary"
                          />
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
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
