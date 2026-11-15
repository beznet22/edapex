import { z } from "zod/v4";
import { createLibrary, defineComponent } from "@openuidev/react-lang";

const TextContent = defineComponent({
  name: "TextContent",
  description: "A short paragraph of readable text.",
  props: z.object({
    text: z.string().min(1).max(2_000)
  }),
  component: ({ props }) => (
    <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{props.text}</p>
  )
});

const Badge = defineComponent({
  name: "Badge",
  description: "A compact status label.",
  props: z.object({
    label: z.string().min(1).max(80),
    tone: z.enum(["neutral", "primary", "success", "warning", "danger"]).optional()
  }),
  component: ({ props }) => {
    const tone = props.tone ?? "neutral";
    const classes =
      tone === "primary"
        ? "border-primary/40 bg-primary/10 text-primary"
        : tone === "success"
          ? "border-success/30 bg-success/10 text-success"
          : tone === "warning"
            ? "border-warning/30 bg-warning/10 text-warning"
            : tone === "danger"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-border bg-muted/50 text-muted-foreground";
    return (
      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${classes}`}>
        {props.label}
      </span>
    );
  }
});

const Metric = defineComponent({
  name: "Metric",
  description: "A labelled number or short value.",
  props: z.object({
    label: z.string().min(1).max(80),
    value: z.string().min(1).max(80),
    note: z.string().max(200).optional()
  }),
  component: ({ props }) => (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{props.label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{props.value}</div>
      {props.note !== undefined ? (
        <div className="mt-1 text-xs text-muted-foreground">{props.note}</div>
      ) : null}
    </div>
  )
});

const Callout = defineComponent({
  name: "Callout",
  description: "A short highlighted note or warning.",
  props: z.object({
    title: z.string().min(1).max(120),
    text: z.string().min(1).max(1_000),
    tone: z.enum(["neutral", "warning", "danger"]).optional()
  }),
  component: ({ props }) => {
    const tone = props.tone ?? "neutral";
    const classes =
      tone === "danger"
        ? "border-destructive/30 bg-destructive/10"
        : tone === "warning"
          ? "border-warning/30 bg-warning/10"
          : "border-border bg-card";
    return (
      <section className={`rounded-lg border p-3 ${classes}`}>
        <h3 className="text-sm font-semibold">{props.title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{props.text}</p>
      </section>
    );
  }
});

const Table = defineComponent({
  name: "Table",
  description: "A small read-only table. Maximum 20 rows.",
  props: z.object({
    columns: z.array(z.string().min(1).max(80)).min(1).max(8),
    rows: z.array(z.array(z.string().max(200))).max(20)
  }),
  component: ({ props }) => (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              {props.columns.map((column) => (
                <th className="px-3 py-2 font-medium" key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {props.rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td className="px-3 py-2 text-foreground" key={`cell-${rowIndex}-${cellIndex}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
});

/**
 * An agent's granted operations, grouped by whether they still resolve.
 *
 * Two facts matter on this surface and they are not symmetrical: what the agent can do,
 * and what it was granted that no longer exists. A single list cannot show that — a
 * revoked grant is invisible in a set that only renders the survivors, which is exactly
 * how an agent silently loses a power and keeps behaving as if it had it.
 */
const OperationList = defineComponent({
  name: "OperationList",
  description:
    "An agent's granted operations. `dropped` lists grants that no longer resolve and is rendered as a separate, louder group.",
  props: z.object({
    title: z.string().min(1).max(120).optional(),
    granted: z.array(z.string().min(1).max(80)).max(40),
    dropped: z.array(z.string().min(1).max(80)).max(40).optional(),
    note: z.string().max(300).optional()
  }),
  component: ({ props }) => {
    const dropped = props.dropped ?? [];
    return (
      <section className="rounded-lg border border-border bg-card p-3">
        {props.title !== undefined ? (
          <h3 className="text-sm font-semibold">{props.title}</h3>
        ) : null}
        {dropped.length > 0 ? (
          <div className="mt-2 rounded-md border border-warning/30 bg-warning/10 p-2">
            <div className="text-[10px] font-medium uppercase tracking-wide text-warning">
              No longer resolve
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {dropped.map((id) => (
                <span
                  className="rounded-[var(--radius-xs)] border border-warning/30 px-1.5 py-0.5 text-[11px] text-warning line-through"
                  key={id}
                >
                  {id}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1">
          {props.granted.map((id) => (
            <span
              className="rounded-[var(--radius-xs)] border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground"
              key={id}
            >
              {id}
            </span>
          ))}
        </div>
        {props.note !== undefined ? (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{props.note}</p>
        ) : null}
      </section>
    );
  }
});

/**
 * How an agent's powers compare to the ceiling it was created under.
 *
 * Rendered as a proportion rather than two numbers because the question a reader actually
 * has is "is this agent narrow or broad", and `12 / 23` requires arithmetic to answer.
 * A bar answers it at a glance, and the count is still there for the reader who wants it.
 */
const GrantCoverage = defineComponent({
  name: "GrantCoverage",
  description:
    "Shows how many of an agent's creator's permitted operations it actually holds. Use when explaining how narrow an agent is.",
  props: z.object({
    label: z.string().min(1).max(120).optional(),
    used: z.number().int().min(0).max(200),
    ceiling: z.number().int().min(0).max(200)
  }),
  component: ({ props }) => {
    // A ceiling of zero would divide by zero; it also cannot occur, because an agent is
    // created by a person who holds at least one operation. Clamping is cheaper than a
    // guard the reader would then have to interpret.
    const ratio = props.ceiling === 0 ? 0 : Math.min(1, props.used / props.ceiling);
    const percent = Math.round(ratio * 100);
    return (
      <div className="rounded-lg border border-border bg-background p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {props.label ?? "Grant coverage"}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {props.used} / {props.ceiling}
          </span>
        </div>
        <div
          aria-label={`${props.used} of ${props.ceiling} operations permitted`}
          aria-valuemax={props.ceiling}
          aria-valuemin={0}
          aria-valuenow={props.used}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  }
});

const StackChild = z.union([
  TextContent.ref,
  Badge.ref,
  Metric.ref,
  Callout.ref,
  Table.ref,
  OperationList.ref,
  GrantCoverage.ref
]);

const Stack = defineComponent({
  name: "Stack",
  description: "Vertical container. Children stack top to bottom with spacing.",
  props: z.object({
    children: z.array(StackChild).min(1).max(40)
  }),
  component: ({ props, renderNode }) => (
    <div className="flex flex-col gap-3">{renderNode(props.children)}</div>
  )
});

export const edapexLibrary = createLibrary({
  root: "Stack",
  components: [
    Stack,
    TextContent,
    Badge,
    Metric,
    Callout,
    Table,
    OperationList,
    GrantCoverage
  ],
  id: "edapex-v1"
});
